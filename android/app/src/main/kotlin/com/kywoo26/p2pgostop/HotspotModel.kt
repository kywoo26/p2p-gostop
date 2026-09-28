package com.kywoo26.p2pgostop

import com.kywoo26.p2pgostop.net.IpCandidate
import com.kywoo26.p2pgostop.qr.WifiQr
import com.kywoo26.p2pgostop.server.SERVER_PORT

// 핫스팟 서비스의 상태 규칙. Android 의존성 없이 JVM 단위 테스트로 검증한다(M0 리뷰 S-1, S-2, S-5).

enum class HotspotStatus { IDLE, STARTING, RUNNING, ADDRESS_ONLY, FAILED, STOPPED }

/**
 * 서비스가 갱신하고 화면·알림이 읽는 상태.
 *
 * [serviceRunning](포그라운드 서비스가 살아 있음)과 [status](핫스팟 상태)는 따로 본다(M0 리뷰 S-2).
 * LOHS가 실패(FAILED)하거나 시스템이 내려도(STOPPED) 서비스·서버는 폴백용으로 남으므로,
 * 토글·알림·화면 켜짐은 [serviceRunning]을 기준으로 한다.
 */
data class HotspotState(
    val status: HotspotStatus = HotspotStatus.IDLE,
    val serviceRunning: Boolean = false,
    val ssid: String? = null,
    val password: String? = null,
    val securityType: String? = null,
    val ip: String? = null,
    val candidates: List<IpCandidate> = emptyList(),
    val lastError: String? = null,
    val serverRunning: Boolean = false,
    val serverError: String? = null,
    val apiVariant: String? = null,
    val wsClients: Int = 0,
    val lanEnabled: Boolean = false,
) {
    /** LOHS 요청이 진행 중이거나 켜져 있다. */
    val hotspotActive: Boolean
        get() = status == HotspotStatus.STARTING || status == HotspotStatus.RUNNING

    /** 화면을 켜 둘지: 서비스나 서버가 살아 있는 동안. */
    val keepScreenOn: Boolean
        get() = serviceRunning || serverRunning
}

/** 시작/중지 토글이 할 일. */
enum class ToggleAction { START, STOP_HOTSPOT, STOP_FALLBACK }

fun toggleAction(s: HotspotState): ToggleAction = when {
    !s.serviceRunning -> ToggleAction.START
    s.hotspotActive -> ToggleAction.STOP_HOTSPOT
    else -> ToggleAction.STOP_FALLBACK // FAILED·STOPPED·ADDRESS_ONLY: 서버만 남은 상태도 멈출 수 있어야 한다
}

/** 알림 내용. 핫스팟 상태가 바뀔 때마다 새로 그린다(M0 리뷰 S-2, S-4: 접속 수 포함). */
data class NotifContent(val status: HotspotStatus, val url: String?, val clients: Int, val action: ToggleAction)

fun notifContent(s: HotspotState): NotifContent = NotifContent(
    status = if (s.status == HotspotStatus.IDLE) HotspotStatus.STARTING else s.status,
    url = if (s.lanEnabled) s.ip?.let { WifiQr.url(it, SERVER_PORT) } else null,
    clients = s.wsClients,
    action = if (s.hotspotActive) ToggleAction.STOP_HOTSPOT else ToggleAction.STOP_FALLBACK,
)

/**
 * LOHS 요청·예약의 세대 관리 (M0 리뷰 S-1).
 *
 * 요청마다 세대 번호를 올리고, 콜백은 자기 세대가 현재일 때만 상태에 반영한다.
 * 정지([shutdown])나 폴백 전환([cancel]) 뒤에 늦게 도착한 `onStarted`의 예약은 곧바로 [close]한다.
 * 그렇지 않으면 아무도 닫지 않는 예약이 남아 프로세스가 죽을 때까지 핫스팟이 켜져 있었다.
 * 서비스 인스턴스가 바뀌어도 세대가 이어지도록 프로세스에 하나만 둔다.
 *
 * @param R 예약 타입(`WifiManager.LocalOnlyHotspotReservation`). 테스트에서는 가짜를 쓴다.
 */
class HotspotSession<R : Any>(private val close: (R) -> Unit) {
    private var generation = 0L
    private var pending = false
    private var reservation: R? = null
    private var shutDown = false

    @get:Synchronized
    val hasReservation: Boolean
        get() = reservation != null

    @get:Synchronized
    val isPending: Boolean
        get() = pending

    /** 서비스가 (다시) 시작됨. 세대 번호는 이어진다. */
    @Synchronized
    fun reopen() {
        shutDown = false
    }

    /** 새 LOHS 요청의 세대 번호. 정지됐거나 이미 켜져 있거나 요청 중이면 null. */
    @Synchronized
    fun begin(): Long? {
        if (shutDown || reservation != null || pending) return null
        generation++
        pending = true
        return generation
    }

    /** 요청 중인 세대인가(onFailed 후 재시도 판단용). */
    @Synchronized
    fun isPendingFor(gen: Long): Boolean = !shutDown && pending && gen == generation

    /** @return 반영했으면 true. false면 [res]는 이미 닫혔다. */
    @Synchronized
    fun onStarted(gen: Long, res: R): Boolean {
        if (res === reservation) return true
        if (shutDown || gen != generation || !pending) {
            close(res)
            return false
        }
        pending = false
        reservation = res
        return true
    }

    /** @return 현재 세대의 핫스팟이 내려갔으면 true. */
    @Synchronized
    fun onStopped(gen: Long): Boolean {
        if (shutDown || gen != generation) return false
        val had = pending || reservation != null
        pending = false
        reservation = null
        return had
    }

    /** @return 현재 세대의 요청이 실패로 끝났으면 true. */
    @Synchronized
    fun onFailed(gen: Long): Boolean {
        if (!isPendingFor(gen)) return false
        pending = false
        return true
    }

    /** 진행 중인 요청과 예약을 버린다. 예약이 있었으면 닫고 true. 늦게 오는 콜백은 무시·해제된다. */
    @Synchronized
    fun cancel(): Boolean {
        generation++
        pending = false
        val r = reservation ?: return false
        reservation = null
        close(r)
        return true
    }

    /** 서비스 정지. 두 번째 호출부터는 false(M0 리뷰 S-6). */
    @Synchronized
    fun shutdown(): Boolean {
        if (shutDown) return false
        cancel()
        shutDown = true
        return true
    }
}

/**
 * 핫스팟 IP 감시 간격 (spec NF-04 예외: 3초 주기 허용, 확보 후 30초로 완화. M0 리뷰 S-5).
 * IP를 못 찾았으면 처음 [FAST_TRIES]번은 300ms, 그 뒤 3초. 찾은 뒤에도 인터페이스가 늦게 뜰 수 있어
 * (회차 1: tun0 → 3초 뒤 swlan0) [SETTLE_CHECKS]번은 3초로 더 보고, 바뀌지 않으면 30초로 늦춘다.
 */
object IpWatchSchedule {
    const val FAST_MS = 300L
    const val NORMAL_MS = 3_000L
    const val RELAXED_MS = 30_000L
    const val FAST_TRIES = 10
    const val SETTLE_CHECKS = 10

    /**
     * @param found 지금 선택된 IP가 있는가
     * @param fastTriesUsed 지금까지 쓴 빠른 재시도 횟수
     * @param unchangedChecks 선택된 IP가 바뀌지 않고 이어진 확인 횟수
     */
    fun delayMs(found: Boolean, fastTriesUsed: Int, unchangedChecks: Int): Long = when {
        !found && fastTriesUsed < FAST_TRIES -> FAST_MS
        !found -> NORMAL_MS
        unchangedChecks < SETTLE_CHECKS -> NORMAL_MS
        else -> RELAXED_MS
    }
}
