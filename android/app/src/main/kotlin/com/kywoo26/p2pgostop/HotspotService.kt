package com.kywoo26.p2pgostop

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.wifi.SoftApConfiguration
import android.net.wifi.WifiManager
import android.os.Build
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.util.SparseIntArray
import com.kywoo26.p2pgostop.net.IpSelector
import com.kywoo26.p2pgostop.server.SERVER_PORT
import com.kywoo26.p2pgostop.server.ServerEnv
import com.kywoo26.p2pgostop.server.startSmokeServer
import io.ktor.server.engine.EmbeddedServer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * 포그라운드 서비스(`connectedDevice`): LocalOnlyHotspot 유지 + Ktor 서버 + 핫스팟 IP 탐색 (spec FR-01, FR-02).
 * LOHS는 요청한 프로세스가 죽으면 내려가므로 프로세스를 FGS로 붙잡아 둔다(tech-stack 1.6).
 */
class HotspotService : Service() {

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    private val main = Handler(Looper.getMainLooper())
    private var reservation: WifiManager.LocalOnlyHotspotReservation? = null
    @Volatile private var server: EmbeddedServer<*, *>? = null
    private var serverJob: Job? = null
    private var ipJob: Job? = null
    private var legacyRetried = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> {
                stopAll("사용자 중지")
                return START_NOT_STICKY
            }
            ACTION_ADDRESS_ONLY -> {
                goForeground()
                closeReservation()
                AppState.update { HotspotState(status = HotspotStatus.ADDRESS_ONLY, serverRunning = it.serverRunning) }
                AppState.log("주소만 표시 모드 시작(LOHS 없이 서버만)")
                ensureServer()
                startIpWatch()
            }
            else -> {
                goForeground()
                ensureServer()
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
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, getString(R.string.notif_channel), NotificationManager.IMPORTANCE_LOW),
        )
        startForeground(NOTIF_ID, buildNotification(), ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE)
    }

    private fun buildNotification(): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE,
        )
        val stop = PendingIntent.getService(
            this, 1, Intent(this, HotspotService::class.java).setAction(ACTION_STOP), PendingIntent.FLAG_IMMUTABLE,
        )
        val s = AppState.hotspot.value
        val text = when {
            s.ip != null -> "http://${s.ip}:$SERVER_PORT/ · 접속 ${AppState.wsClients.get()}"
            else -> getString(R.string.notif_starting)
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_hotspot)
            .setContentTitle(getString(R.string.notif_title))
            .setContentText(text)
            .setOngoing(true)
            .setContentIntent(open)
            .addAction(Notification.Action.Builder(null, getString(R.string.stop_hotspot), stop).build())
            .build()
    }

    private fun refreshNotification() {
        if (AppState.hotspot.value.serviceActive) {
            getSystemService(NotificationManager::class.java).notify(NOTIF_ID, buildNotification())
        }
    }

    // ---- Ktor 서버 ----

    private fun ensureServer() {
        if (server != null || serverJob?.isActive == true) return
        serverJob = scope.launch(Dispatchers.IO) {
            val env = ServerEnv(
                appVersion = BuildConfig.VERSION_NAME,
                gitSha = BuildConfig.GIT_SHA,
                buildTime = BuildConfig.BUILD_TIME,
                deviceInfo = DeviceInfo::map,
                log = AppState::log,
                clients = AppState.wsClients,
            )
            // 직전 서버가 아직 포트를 놓지 않았을 수 있어 몇 번 재시도한다.
            for (attempt in 1..SERVER_START_TRIES) {
                try {
                    server = startSmokeServer(env)
                    AppState.update { it.copy(serverRunning = true, serverError = null) }
                    AppState.log("서버 시작 0.0.0.0:$SERVER_PORT")
                    return@launch
                } catch (e: Exception) {
                    val msg = "${e.javaClass.simpleName}: ${e.message}"
                    AppState.update { it.copy(serverRunning = false, serverError = msg) }
                    AppState.log("서버 시작 실패($attempt/$SERVER_START_TRIES): ${e.javaClass.name}: ${e.message}")
                    delay(500)
                }
            }
        }
    }

    /** 서비스 스코프 취소와 무관하게 끝나도록 별도 스레드에서 멈춘다. */
    private fun stopServer() {
        serverJob?.cancel()
        serverJob = null
        val s = server ?: return
        server = null
        AppState.update { it.copy(serverRunning = false) }
        Thread({
            runCatching { s.stop(500, 1500) }.onFailure { AppState.log("서버 중지 오류: ${it.message}") }
            AppState.log("서버 중지")
        }, "ktor-stop").start()
    }

    // ---- LocalOnlyHotspot ----

    private fun startHotspot() {
        if (reservation != null) {
            AppState.log("핫스팟이 이미 켜져 있음")
            return
        }
        legacyRetried = false
        val wifi = getSystemService(WifiManager::class.java)
        AppState.update { it.copy(status = HotspotStatus.STARTING, lastError = null, ssid = null, password = null, ip = null) }
        AppState.log("핫스팟 시작 요청: Wi-Fi 켜짐=${wifi.isWifiEnabled}, 비행기 모드=${Diagnostics.airplaneMode(this)}")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) {
            try {
                // API 36: 일반 앱은 밴드(채널)만 반영된다. 2.4GHz 고정(tech-stack 1.3).
                val channels = SparseIntArray().apply { put(SoftApConfiguration.BAND_2GHZ, 0) }
                val config = SoftApConfiguration.Builder().setChannels(channels).build()
                AppState.update { it.copy(apiVariant = "WithConfiguration(2.4GHz)") }
                AppState.log("startLocalOnlyHotspotWithConfiguration(BAND_2GHZ) 호출")
                wifi.startLocalOnlyHotspotWithConfiguration(config, mainExecutor, Callback(configVariant = true))
                return
            } catch (e: SecurityException) {
                fail("권한 없음(SecurityException): ${e.message}")
                return
            } catch (e: Exception) {
                AppState.log("구성 변형 호출 실패 → 기본 API로 재시도: ${e.javaClass.simpleName} ${e.message}")
            }
        }
        startLegacy(wifi)
    }

    private fun startLegacy(wifi: WifiManager) {
        try {
            AppState.update { it.copy(apiVariant = "startLocalOnlyHotspot") }
            AppState.log("startLocalOnlyHotspot 호출")
            wifi.startLocalOnlyHotspot(Callback(configVariant = false), main)
        } catch (e: SecurityException) {
            fail("권한 없음(SecurityException): ${e.message}")
        } catch (e: Exception) {
            fail("${e.javaClass.simpleName}: ${e.message}")
        }
    }

    private inner class Callback(private val configVariant: Boolean) : WifiManager.LocalOnlyHotspotCallback() {
        override fun onStarted(res: WifiManager.LocalOnlyHotspotReservation) {
            reservation = res
            val cfg = res.softApConfiguration
            val ssid = cfg.wifiSsid?.toString()?.removeSurrounding("\"") ?: @Suppress("DEPRECATION") cfg.ssid
            val pass = cfg.passphrase
            val sec = securityName(cfg.securityType)
            AppState.update {
                it.copy(status = HotspotStatus.RUNNING, ssid = ssid, password = pass, securityType = sec, lastError = null)
            }
            AppState.log(
                "핫스팟 시작됨: SSID=$ssid 보안=$sec 비밀번호=${mask(pass)} (길이 ${pass?.length ?: 0}) " +
                    "채널=${channelsOf(cfg)} 숨김=${cfg.isHiddenSsid}",
            )
            startIpWatch()
            refreshNotification()
        }

        override fun onStopped() {
            reservation = null
            AppState.update { it.copy(status = HotspotStatus.STOPPED, ssid = null, password = null) }
            AppState.log("핫스팟 중지됨(onStopped): 시스템·사용자에 의해 내려감")
            refreshNotification()
        }

        override fun onFailed(reason: Int) {
            val msg = failureText(reason)
            if (configVariant && !legacyRetried && reason != ERROR_INCOMPATIBLE_MODE && reason != ERROR_TETHERING_DISALLOWED) {
                legacyRetried = true
                AppState.log("구성 변형 실패($msg) → 기본 startLocalOnlyHotspot으로 재시도")
                startLegacy(getSystemService(WifiManager::class.java))
                return
            }
            fail(msg)
        }
    }

    private fun channelsOf(cfg: SoftApConfiguration): String =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) cfg.channels.toString() else "(API 36 미만)"

    private fun fail(message: String) {
        AppState.update { it.copy(status = HotspotStatus.FAILED, lastError = message) }
        AppState.log("핫스팟 실패: $message")
        // 서버는 유지한다: 시스템 핫스팟·기존 Wi-Fi로 "주소만 표시" 폴백이 가능하도록(FR-02).
        startIpWatch()
        refreshNotification()
    }

    private fun closeReservation() {
        reservation?.let {
            runCatching { it.close() }
            AppState.log("핫스팟 예약 해제(close)")
        }
        reservation = null
    }

    // ---- IP 탐색 ----

    /** 처음에는 300ms 간격으로 빠르게, IP를 찾은 뒤에는 3초 간격으로 인터페이스를 다시 훑는다. */
    private fun startIpWatch() {
        ipJob?.cancel()
        ipJob = scope.launch {
            var fastTries = 0
            var lastIp: String? = "-"
            while (isActive) {
                val ifaces = IpSelector.snapshot()
                val ranked = IpSelector.rank(ifaces)
                val ip = IpSelector.selectHotspotIp(ifaces)
                AppState.update { it.copy(ip = ip, candidates = ranked) }
                if (ip != lastIp) {
                    AppState.log("IP 탐색: 선택=${ip ?: "없음"} 후보=${ranked.joinToString { "${it.iface}=${it.ip}(${it.score})" }}")
                    lastIp = ip
                    main.post { refreshNotification() }
                }
                if (ip == null && fastTries < FAST_TRIES) {
                    fastTries++
                    delay(300)
                } else {
                    delay(3000)
                }
            }
        }
    }

    private fun stopAll(reason: String) {
        AppState.log("정지: $reason")
        ipJob?.cancel()
        ipJob = null
        closeReservation()
        stopServer()
        AppState.update { it.copy(status = HotspotStatus.IDLE, ssid = null, password = null, ip = null) }
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    companion object {
        const val ACTION_START = "com.kywoo26.p2pgostop.START"
        const val ACTION_ADDRESS_ONLY = "com.kywoo26.p2pgostop.ADDRESS_ONLY"
        const val ACTION_STOP = "com.kywoo26.p2pgostop.STOP"
        private const val CHANNEL_ID = "hotspot"
        private const val NOTIF_ID = 1
        private const val FAST_TRIES = 10
        private const val SERVER_START_TRIES = 5

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
