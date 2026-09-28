package com.kywoo26.p2pgostop

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.ClipboardManager
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.View
import android.view.WindowInsets
import android.view.WindowManager
import android.widget.Button
import android.widget.ImageView
import android.widget.TextView
import android.widget.Toast
import com.kywoo26.p2pgostop.log.LogReport
import com.kywoo26.p2pgostop.net.IpCandidate
import com.kywoo26.p2pgostop.net.IpSelector
import com.kywoo26.p2pgostop.qr.QrBitmap
import com.kywoo26.p2pgostop.qr.WifiQr
import com.kywoo26.p2pgostop.server.SERVER_PORT
import com.kywoo26.p2pgostop.share.LogShareFiles
import com.kywoo26.p2pgostop.share.LogShareProvider
import java.time.LocalDateTime
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors

/**
 * M0 스모크 화면(클래식 View). M4에서 WebView 셸로 바뀐다.
 * 핫스팟 시작/중지, 자격 증명·IP·QR 표시, 폴백 안내, 진단(FR-32), 로그 복사·공유(FR-30), 빌드 식별자(FR-31).
 */
class MainActivity : Activity() {
    private var diagnosticsOnly = false
    private var fromGame = false
    private var gameLaunched = false
    private val webBundlePresent by lazy { GameActivity.bundlePresent(this) }

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            render()
            handler.postDelayed(this, 1000)
        }
    }

    private lateinit var status: TextView
    private lateinit var btnToggle: Button
    private lateinit var btnAddressOnly: Button
    private lateinit var btnPermissions: Button
    private lateinit var ssid: TextView
    private lateinit var password: TextView
    private lateinit var ip: TextView
    private lateinit var url: TextView
    private lateinit var qrWifi: ImageView
    private lateinit var qrWifiCaption: TextView
    private lateinit var qrUrl: ImageView
    private lateinit var qrUrlCaption: TextView
    private lateinit var allAddresses: TextView
    private lateinit var diagnostics: TextView
    private lateinit var logView: TextView

    private var wifiQrContent: String? = null
    private var urlQrContent: String? = null
    private var shownLogVersion = -1L
    private var lastKeepOn: Boolean? = null
    private var pendingAction: String? = null

    /** 서비스가 꺼져 있을 때 보여 줄 인터페이스 목록. 메인 스레드 밖에서 5초마다 갱신한다(M0 리뷰 M-3). */
    private val bg: ExecutorService = Executors.newSingleThreadExecutor()
    private var idleCandidates: List<IpCandidate> = emptyList()
    private var lastIdleScanMs = 0L

    /** 생성에 실패한 QR 내용. 같은 내용이면 매초 다시 시도·로그하지 않는다(M0 리뷰 M-4). */
    private val failedQr = mutableMapOf<Int, String>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        diagnosticsOnly = intent.getBooleanExtra(EXTRA_DIAGNOSTICS, false)
        fromGame = intent.getBooleanExtra(EXTRA_FROM_GAME, false)
        setContentView(R.layout.activity_main)
        // 권한 대화상자가 떠 있는 동안 회전해도 시작하려던 동작을 잃지 않는다(M0 리뷰 M-1).
        pendingAction = savedInstanceState?.getString(STATE_PENDING_ACTION)
        if (AppState.logs.size() == 0) AppState.log(DeviceInfo.header().trimEnd())

        // targetSdk 36은 edge-to-edge 강제: 시스템 바 인셋만큼 패딩(tech-stack 1.7).
        val root = findViewById<View>(R.id.root)
        root.setOnApplyWindowInsetsListener { v, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            v.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            insets
        }

        findViewById<TextView>(R.id.buildInfo).text =
            getString(R.string.build_info, BuildConfig.VERSION_NAME, BuildConfig.GIT_SHA, BuildConfig.BUILD_TIME)
        status = findViewById(R.id.status)
        btnToggle = findViewById(R.id.btnToggle)
        findViewById<Button>(R.id.btnGame).setOnClickListener {
            if (fromGame) finish() else startActivity(Intent(this, GameActivity::class.java))
        }
        btnAddressOnly = findViewById(R.id.btnAddressOnly)
        btnPermissions = findViewById(R.id.btnPermissions)
        ssid = findViewById(R.id.ssid)
        password = findViewById(R.id.password)
        ip = findViewById(R.id.ip)
        url = findViewById(R.id.url)
        qrWifi = findViewById(R.id.qrWifi)
        qrWifiCaption = findViewById(R.id.qrWifiCaption)
        qrUrl = findViewById(R.id.qrUrl)
        qrUrlCaption = findViewById(R.id.qrUrlCaption)
        allAddresses = findViewById(R.id.allAddresses)
        diagnostics = findViewById(R.id.diagnostics)
        logView = findViewById(R.id.log)

        btnToggle.setOnClickListener {
            // 서비스 생존 기준(M0 리뷰 S-2): FAILED·STOPPED·주소만 표시에서도 서비스·서버를 멈출 수 있다.
            when (val a = toggleAction(AppState.hotspot.value)) {
                ToggleAction.START -> {
                    AppState.log("버튼: 핫스팟 시작")
                    withPermissions(HotspotService.ACTION_START)
                }
                ToggleAction.STOP_HOTSPOT, ToggleAction.STOP_FALLBACK -> {
                    AppState.log("버튼: 중지($a)")
                    startService(HotspotService.intent(this, HotspotService.ACTION_STOP))
                }
            }
        }
        btnAddressOnly.setOnClickListener {
            // LOHS를 쓰지 않으므로 근처 기기 권한 없이 시작한다(spec FR-02, M0 리뷰 M-2).
            // connectedDevice FGS의 전제 권한은 일반 권한 CHANGE_WIFI_STATE로 충족된다.
            AppState.log("버튼: 주소만 표시")
            startHotspotService(HotspotService.ACTION_ADDRESS_ONLY)
        }
        btnPermissions.setOnClickListener { explainAndRequest(null) }
        findViewById<Button>(R.id.btnHotspotSettings).setOnClickListener { openHotspotSettings() }
        findViewById<Button>(R.id.btnBattery).setOnClickListener {
            safeStart(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))
        }
        findViewById<Button>(R.id.btnCopyLog).setOnClickListener { copyLog() }
        findViewById<Button>(R.id.btnShareLog).setOnClickListener { shareLog() }
    }

    override fun onResume() {
        super.onResume()
        handler.post(ticker)
    }

    override fun onPause() {
        handler.removeCallbacks(ticker)
        super.onPause()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        pendingAction?.let { outState.putString(STATE_PENDING_ACTION, it) }
    }

    override fun onDestroy() {
        bg.shutdownNow()
        super.onDestroy()
    }

    // ---- 권한 ----

    private fun withPermissions(action: String) {
        if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
            startHotspotService(action)
        } else {
            explainAndRequest(action)
        }
    }

    private fun explainAndRequest(action: String?) {
        pendingAction = action
        AlertDialog.Builder(this)
            .setTitle(R.string.permission_title)
            .setMessage(R.string.permission_body)
            .setPositiveButton(R.string.permission_ok) { _, _ ->
                requestPermissions(Diagnostics.runtimePermissions, REQ_PERMISSIONS)
            }
            .setNegativeButton(R.string.cancel, null)
            .show()
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_PERMISSIONS) return
        val summary = permissions.indices.joinToString { "${permissions[it].substringAfterLast('.')}=${grantResults.getOrNull(it) == 0}" }
        AppState.log("권한 결과: $summary")
        val action = pendingAction
        pendingAction = null
        if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
            action?.let { startHotspotService(it) }
        } else if (!shouldShowRequestPermissionRationale(Manifest.permission.NEARBY_WIFI_DEVICES)) {
            AlertDialog.Builder(this)
                .setMessage(R.string.permission_denied)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    safeStart(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", packageName, null)))
                }
                .setNegativeButton(R.string.cancel, null)
                .show()
        } else {
            Toast.makeText(this, R.string.permission_denied, Toast.LENGTH_LONG).show()
        }
    }

    private fun startHotspotService(action: String) {
        // LOHS는 앱이 포그라운드일 때만 시작된다. 버튼을 누른 지금이 포그라운드다.
        startForegroundService(HotspotService.intent(this, action))
    }

    // ---- 화면 갱신 ----

    private fun render() {
        val s = AppState.hotspot.value
        findViewById<Button>(R.id.btnGame).visibility =
            if (webBundlePresent) View.VISIBLE else View.GONE
        if (!diagnosticsOnly && !gameLaunched && webBundlePresent) {
            gameLaunched = true
            startActivity(Intent(this, GameActivity::class.java))
        }
        // 서비스(서버)가 도는 동안 화면을 켜 둔다. LOHS 실패 후에도 폴백용 서버는 살아 있다.
        val keepOn = s.keepScreenOn
        if (keepOn != lastKeepOn) {
            lastKeepOn = keepOn
            if (keepOn) {
                window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            } else {
                window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        status.text = when (s.status) {
            HotspotStatus.IDLE -> getString(R.string.status_idle)
            HotspotStatus.STARTING -> getString(R.string.status_starting)
            HotspotStatus.RUNNING -> getString(R.string.status_running)
            HotspotStatus.ADDRESS_ONLY -> getString(R.string.status_address_only)
            HotspotStatus.FAILED ->
                getString(R.string.status_failed, s.lastError ?: "") + if (s.serviceRunning) getString(R.string.status_failed_hint) else ""
            HotspotStatus.STOPPED -> getString(R.string.status_stopped)
        }
        btnToggle.setText(
            when (toggleAction(s)) {
                ToggleAction.START -> R.string.start_hotspot
                ToggleAction.STOP_HOTSPOT -> R.string.stop_hotspot
                ToggleAction.STOP_FALLBACK -> R.string.stop_fallback
            },
        )
        btnPermissions.visibility =
            if (Diagnostics.runtimePermissions.all { Diagnostics.granted(this, it) }) View.GONE else View.VISIBLE

        val none = getString(R.string.none)
        ssid.text = getString(R.string.label_ssid, s.ssid ?: none)
        password.text = getString(R.string.label_password, s.password ?: none)
        val ipText = s.ip ?: if (s.serviceRunning) getString(R.string.ip_searching) else none
        ip.text = getString(R.string.label_ip, ipText, SERVER_PORT)
        val pageUrl = s.ip?.let { WifiQr.url(it, SERVER_PORT) }
        url.text = getString(R.string.label_url, pageUrl ?: none)

        val wifiContent = if (s.status == HotspotStatus.RUNNING && s.ssid != null) WifiQr.build(s.ssid, s.password) else null
        wifiQrContent = updateQr(qrWifi, qrWifiCaption, wifiQrContent, wifiContent)
        val urlContent = if (s.serverRunning) pageUrl else null
        urlQrContent = updateQr(qrUrl, qrUrlCaption, urlQrContent, urlContent)

        val ranked = if (s.serviceRunning) s.candidates else idleCandidatesThrottled()
        allAddresses.text = if (ranked.isEmpty()) none else ranked.joinToString("\n") { "${it.iface}  ${it.ip}" }

        diagnostics.text = Diagnostics.lines(this, s).joinToString("\n")

        val v = AppState.logs.version
        if (v != shownLogVersion) {
            shownLogVersion = v
            logView.text = AppState.logs.tail(LOG_TAIL).joinToString("\n")
        }
    }

    private fun idleCandidatesThrottled(): List<IpCandidate> {
        val now = System.currentTimeMillis()
        if (now - lastIdleScanMs >= IDLE_SCAN_MS) {
            lastIdleScanMs = now
            bg.execute {
                val r = IpSelector.rank(IpSelector.snapshot())
                handler.post { idleCandidates = r }
            }
        }
        return idleCandidates
    }

    /** QR 내용이 바뀐 경우에만 다시 그린다. 반환값은 현재 표시 중인 내용. */
    private fun updateQr(view: ImageView, caption: TextView, shown: String?, wanted: String?): String? {
        if (wanted == shown) return shown
        if (wanted != null && failedQr[view.id] == wanted) return shown
        if (wanted == null) {
            view.setImageDrawable(null)
            view.visibility = View.GONE
            caption.visibility = View.GONE
            return null
        }
        val px = (260 * resources.displayMetrics.density).toInt()
        val bmp: Bitmap = try {
            QrBitmap.render(wanted, px)
        } catch (e: Exception) {
            failedQr[view.id] = wanted
            AppState.log("QR 생성 실패: ${e.message}")
            view.setImageDrawable(null)
            view.visibility = View.GONE
            caption.visibility = View.GONE
            return null
        }
        failedQr.remove(view.id)
        view.setImageBitmap(bmp)
        view.visibility = View.VISIBLE
        caption.visibility = View.VISIBLE
        AppState.log("QR 표시: ${if (wanted.startsWith("WIFI:")) wanted.replace(Regex("P:[^;]*"), "P:***") else wanted}")
        return wanted
    }

    // ---- 로그 ----

    private fun diagnosticsLines(): List<String> = Diagnostics.lines(this, AppState.hotspot.value)

    /** 호스트·게스트 로그 전체(파일 첨부용). 두 버퍼가 합쳐 최대 약 768KB(UTF-8). */
    private fun fullLogText(): String =
        LogReport.full(DeviceInfo.header(), diagnosticsLines(), AppState.logs.snapshot(), AppState.guestLogs.snapshot())

    private fun copyLog() {
        // 클립보드도 바인더를 거치므로 바이트 상한 안에서 최근 부분만 복사한다(M0 리뷰 L-2).
        val text = LogReport.clipTail(fullLogText(), LogReport.COPY_MAX_BYTES)
        try {
            val cm = getSystemService(ClipboardManager::class.java)
            cm.setPrimaryClip(ClipData.newPlainText(getString(R.string.share_subject), text))
            Toast.makeText(this, R.string.log_copied, Toast.LENGTH_SHORT).show()
        } catch (e: RuntimeException) {
            AppState.log("로그 복사 실패: ${e.javaClass.simpleName} ${e.message}")
        }
    }

    /**
     * 전체 로그는 파일(EXTRA_STREAM, [LogShareProvider])로, 본문(EXTRA_TEXT)에는 [LogReport.SHARE_TEXT_MAX_BYTES]
     * 이하의 요약만 싣는다. 인텐트가 1MB 바인더 한도에 가까워지지 않게 한다(M0 리뷰 L-2).
     */
    private fun shareLog() {
        val name = LogShareFiles.name(BuildConfig.GIT_SHA, LocalDateTime.now())
        val uri = try {
            LogShareProvider.write(this, name, fullLogText())
        } catch (e: Exception) {
            AppState.log("로그 파일 쓰기 실패: ${e.javaClass.simpleName} ${e.message}")
            Toast.makeText(this, R.string.share_file_failed, Toast.LENGTH_LONG).show()
            null
        }
        val summary = LogReport.summary(
            header = DeviceInfo.header(),
            diagnostics = diagnosticsLines(),
            host = AppState.logs.snapshot(),
            guest = AppState.guestLogs.snapshot(),
            note = if (uri != null) getString(R.string.share_note, name) else getString(R.string.share_file_failed),
        )
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, getString(R.string.share_subject) + " " + BuildConfig.GIT_SHA)
            .putExtra(Intent.EXTRA_TEXT, summary)
        if (uri != null) {
            send.putExtra(Intent.EXTRA_STREAM, uri)
            // ClipData를 직접 지정하면 EXTRA_TEXT가 ClipData로 한 번 더 복사되지 않는다. 읽기 권한은 받는 앱에만 준다.
            send.clipData = ClipData.newRawUri(name, uri)
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        AppState.log("로그 공유: 파일 ${if (uri != null) name else "없음"}, 요약 ${summary.length}자")
        safeStart(Intent.createChooser(send, getString(R.string.share_chooser)))
    }

    // ---- 설정 화면 ----

    private fun openHotspotSettings() {
        // 테더링 설정 화면은 공개 액션이 없다. 알려진 액션을 먼저 시도하고 무선 설정으로 폴백한다.
        val tried = listOf(Intent("android.settings.TETHER_SETTINGS"), Intent(Settings.ACTION_WIRELESS_SETTINGS))
        for (i in tried) {
            try {
                startActivity(i)
                return
            } catch (_: ActivityNotFoundException) {
                continue
            } catch (_: SecurityException) {
                continue
            }
        }
    }

    private fun safeStart(intent: Intent) {
        try {
            startActivity(intent)
        } catch (e: ActivityNotFoundException) {
            AppState.log("화면 열기 실패: ${intent.action}")
            Toast.makeText(this, R.string.open_failed, Toast.LENGTH_SHORT).show()
        } catch (e: RuntimeException) {
            // 인텐트가 바인더 한도를 넘으면 TransactionTooLargeException이 RuntimeException으로 감싸여 온다(M0 리뷰 L-2).
            AppState.log("화면 열기 실패: ${intent.action} ${e.javaClass.simpleName}: ${e.message} / 원인 ${e.cause?.javaClass?.simpleName}")
            Toast.makeText(this, R.string.open_failed, Toast.LENGTH_SHORT).show()
        }
    }

    companion object {
        const val EXTRA_DIAGNOSTICS = "diagnostics"
        const val EXTRA_FROM_GAME = "fromGame"
        const val REQ_PERMISSIONS = 1
        const val LOG_TAIL = 200
        const val IDLE_SCAN_MS = 5_000L
        const val STATE_PENDING_ACTION = "pendingAction"
    }
}
