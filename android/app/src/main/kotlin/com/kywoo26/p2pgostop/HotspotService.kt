package com.kywoo26.p2pgostop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.content.res.AssetManager
import android.net.wifi.SoftApConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.SparseIntArray
import com.kywoo26.p2pgostop.net.IpSelector
import com.kywoo26.p2pgostop.server.ServerEnv
import com.kywoo26.p2pgostop.server.ServerSlot
import com.kywoo26.p2pgostop.server.startSmokeServer
import io.ktor.server.engine.EmbeddedServer
import java.util.concurrent.Executors
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 포그라운드 서비스(`connectedDevice`): LocalOnlyHotspot 유지 + Ktor 서버 + 핫스팟 IP 탐색 (spec FR-01, FR-02).
 * LOHS는 요청한 프로세스가 죽으면 내려가므로 프로세스를 FGS로 붙잡아 둔다(tech-stack 1.6).
 *
 * 수명 주기 규칙(M0 리뷰 S-1~S-6):
 * - LOHS 요청·예약은 프로세스 단일 [session]이 세대 번호로 관리한다. 정지 뒤 늦게 온 `onStarted`는 예약을 곧바로 닫는다.
 * - 서버 기동·정지는 프로세스 단일 [serverSlot]이 한 스레드에서 차례로 처리한다.
 * - "서비스 생존"(`serviceRunning`)과 "핫스팟 상태"(`status`)를 나눈다. FAILED·STOPPED에서도 서비스·서버는
 *   폴백용으로 남고, 화면 토글과 알림의 중지 버튼으로 멈출 수 있다. 알림은 상태가 바뀔 때마다 다시 그린다.
 * 콜백·onStartCommand·onDestroy는 모두 메인 스레드에서 돈다.
 */
class HotspotService : Service() {
    override fun onCreate() {
        super.onCreate()
        assetManager = applicationContext.assets
    }
    /** LOHS onStarted 시각. 이후 [IpSelector.AP_GRACE_MS] 동안은 핫스팟형 인터페이스만 IP 후보로 인정한다. */
    @Volatile private var hotspotStartedAt = 0L

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val main = Handler(Looper.getMainLooper())
    private var ipJob: Job? = null
    private var notifJob: Job? = null

    /** 이 인스턴스가 [stopAll]을 끝냈는가. 두 번째 정지와 정지 뒤 알림 갱신을 막는다(S-6). */
    @Volatile private var stopped = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAll("사용자 중지")
                return START_NOT_STICKY
            }
            ACTION_ADDRESS_ONLY -> {
                goForeground()
                // LOHS 요청·예약을 버린다. 늦게 오는 onStarted는 세대가 달라 곧바로 닫힌다.
                session.cancel()
                AppState.update {
                    it.copy(
                        status = HotspotStatus.ADDRESS_ONLY, ssid = null, password = null, securityType = null,
                        lastError = null, apiVariant = null,
                    )
                }
                AppState.log("주소만 표시 모드 시작(LOHS 없이 서버만)")
                serverSlot.ensure()
                startIpWatch()
            }
            else -> {
                goForeground()
                serverSlot.ensure()
                startHotspot()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopAll("서비스 종료")
        scope.cancel()
        super.onDestroy()
    }

    private fun goForeground() {
        stopped = false
        session.reopen()
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW),
        )
        AppState.update { it.copy(serviceRunning = true) }
        startForeground(NOTIF_ID, buildNotification(notifContent(AppState.hotspot.value)), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
        if (notifJob?.isActive != true) {
            // 상태(핫스팟 상태·IP·접속 수)가 바뀔 때마다 알림을 다시 그린다(S-2, S-4).
            notifJob = scope.launch {
                AppState.hotspot.map { notifContent(it) }.distinctUntilChanged().collect { c ->
                    main.post { if (!stopped) nm.notify(NOTIF_ID, buildNotification(c)) }
                }
            }
        }
    }

    private fun buildNotification(c: NotifContent): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, GameActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, HotspotService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val title = getString(
            when (c.status) {
                HotspotStatus.RUNNING -> R.string.notif_title_running
                HotspotStatus.ADDRESS_ONLY -> R.string.notif_title_address_only
                HotspotStatus.FAILED -> R.string.notif_title_failed
                HotspotStatus.STOPPED -> R.string.notif_title_stopped
                HotspotStatus.IDLE, HotspotStatus.STARTING -> R.string.notif_title_starting
            },
        )
        val text = when {
            c.url != null -> getString(R.string.notif_text_url, c.url, c.clients)
            c.status == HotspotStatus.STARTING -> getString(R.string.notif_starting)
            else -> getString(R.string.notif_text_no_ip)
        }
        val stopLabel = if (c.action == ToggleAction.STOP_HOTSPOT) R.string.stop_hotspot else R.string.stop_fallback
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_hotspot)
            .setContentTitle(title)
            .setContentText(text)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, getString(stopLabel), stop).build())
            .build()
    }

    // ---- LocalOnlyHotspot ----

    private fun startHotspot() {
        val gen = session.begin()
        if (gen == null) {
            AppState.log(if (session.hasReservation) "핫스팟이 이미 켜져 있음" else "핫스팟 요청이 이미 진행 중")
            return
        }
        val wifi = getSystemService(WifiManager::class.java)
        AppState.update {
            it.copy(status = HotspotStatus.STARTING, lastError = null, ssid = null, password = null, securityType = null, ip = null)
        }
        AppState.log("핫스팟 시작 요청(세대 $gen): Wi-Fi 켜짐=${wifi.isWifiEnabled}, 비행기 모드=${Diagnostics.airplaneMode(this)}")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
            try {
                // API 36: 일반 앱은 밴드(채널)만 반영된다. 2.4GHz 고정(tech-stack 1.3).
                val channels = SparseIntArray().apply { put(SoftApConfiguration.BAND_2GHZ, 0) }
                val config = SoftApConfiguration.Builder().setChannels(channels).build()
                AppState.update { it.copy(apiVariant = "WithConfiguration(2.4GHz)") }
                AppState.log("startLocalOnlyHotspotWithConfiguration(BAND_2GHZ) 호출")
                wifi.startLocalOnlyHotspotWithConfiguration(config, mainExecutor, Callback(gen, configVariant = true))
                return
            } catch (e: SecurityException) {
                fail(gen, "권한 없음(SecurityException): ${e.message}")
                return
            } catch (e: Exception) {
                AppState.log("구성 변형 호출 실패 → 기본 API로 재시도: ${e.javaClass.simpleName} ${e.message}")
            }
        }
        startLegacy(wifi, gen)
    }

    private fun startLegacy(wifi: WifiManager, gen: Long) {
        try {
            AppState.update { it.copy(apiVariant = "startLocalOnlyHotspot") }
            AppState.log("startLocalOnlyHotspot 호출")
            wifi.startLocalOnlyHotspot(Callback(gen, configVariant = false), main)
        } catch (e: SecurityException) {
            fail(gen, "권한 없음(SecurityException): ${e.message}")
        } catch (e: Exception) {
            fail(gen, "${e.javaClass.simpleName}: ${e.message}")
        }
    }

    /** 요청 세대 [gen]에 묶인 콜백. 세대가 지난 콜백은 상태를 바꾸지 않는다(S-1). */
    private inner class Callback(private val gen: Long, private val configVariant: Boolean) :
        WifiManager.LocalOnlyHotspotCallback() {
        override fun onStarted(res: WifiManager.LocalOnlyHotspotReservation) {
            hotspotStartedAt = System.currentTimeMillis()
            if (!session.onStarted(gen, res)) {
                AppState.log("정지·전환 뒤 늦게 도착한 onStarted(세대 $gen) → 예약을 곧바로 닫음")
                return
            }
            val cfg = res.softApConfiguration
            val ssid = cfg.wifiSsid?.toString()?.removeSurrounding("\"") ?: @Suppress("DEPRECATION") cfg.ssid
            val pass = cfg.passphrase
            val sec = securityName(cfg.securityType)
            AppState.update {
                it.copy(status = HotspotStatus.RUNNING, ssid = ssid, password = pass, securityType = sec, lastError = null)
            }
            AppState.log(
                "핫스팟 시작됨(세대 $gen): SSID=$ssid 보안=$sec 비밀번호=${mask(pass)} (길이 ${pass?.length ?: 0}) " +
                    "채널=${channelsOf(cfg)} 숨김=${cfg.isHiddenSsid}",
            )
            startIpWatch()
        }

        override fun onStopped() {
            if (!session.onStopped(gen)) {
                AppState.log("지난 세대의 onStopped(세대 $gen) 무시")
                return
            }
            AppState.update { it.copy(status = HotspotStatus.STOPPED, ssid = null, password = null, securityType = null) }
            AppState.log("핫스팟 중지됨(onStopped): 시스템·사용자에 의해 내려감. 서버는 폴백용으로 유지(중지 버튼으로 끔)")
        }

        override fun onFailed(reason: Int) {
            val msg = failureText(reason)
            if (!session.isPendingFor(gen)) {
                AppState.log("지난 세대의 onFailed(세대 $gen) 무시: $msg")
                return
            }
            if (configVariant && reason != ERROR_INCOMPATIBLE_MODE && reason != ERROR_TETHERING_DISALLOWED) {
                AppState.log("구성 변형 실패($msg) → 기본 startLocalOnlyHotspot으로 재시도")
                startLegacy(getSystemService(WifiManager::class.java), gen)
                return
            }
            fail(gen, msg)
        }
    }

    private fun channelsOf(cfg: SoftApConfiguration): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) cfg.channels.toString() else "(API 36 미만)"

    private fun fail(gen: Long, message: String) {
        if (!session.onFailed(gen)) return
        AppState.update { it.copy(status = HotspotStatus.FAILED, lastError = message) }
        AppState.log("핫스팟 실패: $message")
        // 서버는 유지한다: 시스템 핫스팟·기존 Wi-Fi로 "주소만 표시" 폴백이 가능하도록(FR-02). 중지 버튼으로 끈다.
        startIpWatch()
    }

    // ---- IP 탐색 ----

    /** 인터페이스를 다시 훑는다. 간격은 [IpWatchSchedule](spec NF-04 예외). */
    private fun startIpWatch() {
        ipJob?.cancel()
        ipJob = scope.launch {
            var fastTries = 0
            var unchanged = 0
            var lastIp: String? = "-"
            while (isActive) {
                val ifaces = IpSelector.snapshot()
                val ranked = IpSelector.rank(ifaces)
                val apOnly = AppState.hotspot.value.status == HotspotStatus.RUNNING &&
                    System.currentTimeMillis() - hotspotStartedAt < IpSelector.AP_GRACE_MS
                val ip = IpSelector.selectHotspotIp(ifaces, apOnly)
                AppState.update { it.copy(ip = ip, candidates = ranked) }
                if (ip != lastIp) {
                    AppState.log("IP 탐색: 선택=${ip ?: "없음"} 후보=${ranked.joinToString { "${it.iface}=${it.ip}(${it.score})" }}")
                    lastIp = ip
                    unchanged = 0
                } else {
                    unchanged++
                }
                val wait = IpWatchSchedule.delayMs(found = ip != null, fastTriesUsed = fastTries, unchangedChecks = unchanged)
                if (wait == IpWatchSchedule.FAST_MS) fastTries++
                delay(wait)
            }
        }
    }

    private fun stopAll(reason: String) {
        if (stopped) return
        stopped = true
        AppState.log("정지: $reason")
        ipJob?.cancel()
        ipJob = null
        notifJob?.cancel()
        notifJob = null
        session.shutdown()
        serverSlot.stop()
        AppState.update {
            it.copy(
                status = HotspotStatus.IDLE, serviceRunning = false, ssid = null, password = null, securityType = null,
                ip = null, candidates = emptyList(),
            )
        }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    companion object {
        // 프로세스 전체 서버가 서비스 인스턴스보다 오래 살 수 있어 자산 관리자만 보관한다.
        private lateinit var assetManager: AssetManager
        const val ACTION_START = "com.kywoo26.p2pgostop.START"
        const val ACTION_ADDRESS_ONLY = "com.kywoo26.p2pgostop.ADDRESS_ONLY"
        const val ACTION_STOP = "com.kywoo26.p2pgostop.STOP"
        private const val CHANNEL_ID = "hotspot"
        private const val NOTIF_ID = 1

        /** LOHS 요청·예약(프로세스 단일, S-1). */
        private val session = HotspotSession<WifiManager.LocalOnlyHotspotReservation> { res ->
            runCatching { res.close() }
            AppState.log("핫스팟 예약 해제(close)")
        }

        /** Ktor 서버(프로세스 단일, 기동·정지 직렬화, S-3). */
        private val serverSlot: ServerSlot<EmbeddedServer<*, *>> by lazy {
            val env = ServerEnv(
                appVersion = BuildConfig.VERSION_NAME,
                gitSha = BuildConfig.GIT_SHA,
                buildTime = BuildConfig.BUILD_TIME,
                deviceInfo = DeviceInfo::map,
                log = AppState::log,
                guestLog = AppState.guestLogs::add,
                clients = AppState.wsClients,
                onClientsChanged = { n -> AppState.update { it.copy(wsClients = n) } },
                roleChanged = { role, connected ->
                    (if (role == "host") AppState.wsHostClients else AppState.wsGuestClients).set(if (connected) 1 else 0)
                    AppState.update { it.copy(wsClients = AppState.wsClients.get()) }
                },
                asset = { path ->
                    try { assetManager.open("web/$path").use { it.readBytes() } }
                    catch (_: IOException) { null }
                },
            )
            ServerSlot(
                executor = Executors.newSingleThreadExecutor { r -> Thread(r, "ktor-server").apply { isDaemon = true } },
                startServer = { startSmokeServer(env) },
                stopServer = { it.stop(500, 1500) },
                onState = { running, error -> AppState.update { it.copy(serverRunning = running, serverError = error) } },
                log = AppState::log,
            )
        }

        fun intent(context: Context, action: String) = Intent(context, HotspotService::class.java).setAction(action)

        fun failureText(reason: Int): String = when (reason) {
            WifiManager.LocalOnlyHotspotCallback.ERROR_NO_CHANNEL -> "ERROR_NO_CHANNEL($reason): 사용할 채널 없음"
            WifiManager.LocalOnlyHotspotCallback.ERROR_GENERIC -> "ERROR_GENERIC($reason): 일반 오류(OEM 차단 가능성)"
            WifiManager.LocalOnlyHotspotCallback.ERROR_INCOMPATIBLE_MODE ->
                "ERROR_INCOMPATIBLE_MODE($reason): 시스템 핫스팟이 켜져 있거나 앱이 포그라운드가 아님"
            WifiManager.LocalOnlyHotspotCallback.ERROR_TETHERING_DISALLOWED -> "ERROR_TETHERING_DISALLOWED($reason): 관리자 정책으로 금지"
            else -> "알 수 없는 오류($reason)"
        }

        fun securityName(type: Int): String = when (type) {
            SoftApConfiguration.SECURITY_TYPE_OPEN -> "OPEN"
            SoftApConfiguration.SECURITY_TYPE_WPA2_PSK -> "WPA2_PSK"
            SoftApConfiguration.SECURITY_TYPE_WPA3_SAE_TRANSITION -> "WPA3_SAE_TRANSITION"
            SoftApConfiguration.SECURITY_TYPE_WPA3_SAE -> "WPA3_SAE"
            SoftApConfiguration.SECURITY_TYPE_WPA3_OWE_TRANSITION -> "WPA3_OWE_TRANSITION"
            SoftApConfiguration.SECURITY_TYPE_WPA3_OWE -> "WPA3_OWE"
            else -> "UNKNOWN($type)"
        }

        /** 로그에는 비밀번호 앞 3자만 남긴다(세션마다 바뀌지만 공유 로그이므로). */
        fun mask(pass: String?): String = when {
            pass.isNullOrEmpty() -> "(없음)"
            pass.length <= 3 -> "***"
            else -> pass.take(3) + "*".repeat(pass.length - 3)
        }
    }
}
