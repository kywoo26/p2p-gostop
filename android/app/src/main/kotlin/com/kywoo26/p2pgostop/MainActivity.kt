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
import com.kywoo26.p2pgostop.net.IpSelector
import com.kywoo26.p2pgostop.qr.QrBitmap
import com.kywoo26.p2pgostop.qr.WifiQr
import com.kywoo26.p2pgostop.server.SERVER_PORT

/**
 * M0 스모크 화면(클래식 View). M4에서 WebView 셸로 바뀐다.
 * 핫스팟 시작/중지, 자격 증명·IP·QR 표시, 폴백 안내, 진단(FR-32), 로그 복사·공유(FR-30), 빌드 식별자(FR-31).
 */
class MainActivity : Activity() {

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

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)
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
            if (AppState.hotspot.value.serviceActive) {
                AppState.log("버튼: 핫스팟 중지")
                startService(HotspotService.intent(this, HotspotService.ACTION_STOP))
            } else {
                AppState.log("버튼: 핫스팟 시작")
                withPermissions(HotspotService.ACTION_START)
            }
        }
        btnAddressOnly.setOnClickListener {
            AppState.log("버튼: 주소만 표시")
            withPermissions(HotspotService.ACTION_ADDRESS_ONLY)
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
        // 서비스(서버)가 도는 동안 화면을 켜 둔다. LOHS 실패 후에도 폴백용 서버는 살아 있다.
        val keepOn = s.serviceActive || s.serverRunning
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
            HotspotStatus.FAILED -> getString(R.string.status_failed, s.lastError ?: "")
            HotspotStatus.STOPPED -> getString(R.string.status_stopped)
        }
        btnToggle.setText(if (s.serviceActive) R.string.stop_hotspot else R.string.start_hotspot)
        btnPermissions.visibility =
            if (Diagnostics.runtimePermissions.all { Diagnostics.granted(this, it) }) View.GONE else View.VISIBLE

        val none = getString(R.string.none)
        ssid.text = getString(R.string.label_ssid, s.ssid ?: none)
        password.text = getString(R.string.label_password, s.password ?: none)
        val ipText = s.ip ?: if (s.serviceActive) getString(R.string.ip_searching) else none
        ip.text = getString(R.string.label_ip, ipText, SERVER_PORT)
        val pageUrl = s.ip?.let { WifiQr.url(it, SERVER_PORT) }
        url.text = getString(R.string.label_url, pageUrl ?: none)

        val wifiContent = if (s.status == HotspotStatus.RUNNING && s.ssid != null) WifiQr.build(s.ssid, s.password) else null
        wifiQrContent = updateQr(qrWifi, qrWifiCaption, wifiQrContent, wifiContent)
        val urlContent = if (s.serverRunning) pageUrl else null
        urlQrContent = updateQr(qrUrl, qrUrlCaption, urlQrContent, urlContent)

        val ranked = if (s.serviceActive) s.candidates else IpSelector.rank(IpSelector.snapshot())
        allAddresses.text = if (ranked.isEmpty()) none else ranked.joinToString("\n") { "${it.iface}  ${it.ip}" }

        diagnostics.text = Diagnostics.lines(this, s).joinToString("\n")

        val v = AppState.logs.version
        if (v != shownLogVersion) {
            shownLogVersion = v
            logView.text = AppState.logs.tail(LOG_TAIL).joinToString("\n")
        }
    }

    /** QR 내용이 바뀐 경우에만 다시 그린다. 반환값은 현재 표시 중인 내용. */
    private fun updateQr(view: ImageView, caption: TextView, shown: String?, wanted: String?): String? {
        if (wanted == shown) return shown
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
            AppState.log("QR 생성 실패: ${e.message}")
            return null
        }
        view.setImageBitmap(bmp)
        view.visibility = View.VISIBLE
        caption.visibility = View.VISIBLE
        AppState.log("QR 표시: ${if (wanted.startsWith("WIFI:")) wanted.replace(Regex("P:[^;]*"), "P:***") else wanted}")
        return wanted
    }

    // ---- 로그 ----

    private fun fullLogText(): String {
        val s = AppState.hotspot.value
        val body = buildString {
            appendLine(DeviceInfo.header().trimEnd())
            appendLine("--- 진단 ---")
            Diagnostics.lines(this@MainActivity, s).forEach { appendLine(it) }
            appendLine("--- 로그 (${AppState.logs.size()}줄) ---")
            AppState.logs.snapshot().forEach { appendLine(it) }
        }
        // 공유 인텐트(바인더) 한도를 피하려고 뒤쪽 약 180KB만 보낸다.
        return if (body.length > MAX_SHARE_CHARS) "(앞부분 생략)\n" + body.takeLast(MAX_SHARE_CHARS) else body
    }

    private fun copyLog() {
        val cm = getSystemService(ClipboardManager::class.java)
        cm.setPrimaryClip(ClipData.newPlainText(getString(R.string.share_subject), fullLogText()))
        Toast.makeText(this, R.string.log_copied, Toast.LENGTH_SHORT).show()
    }

    private fun shareLog() {
        val send = Intent(Intent.ACTION_SEND)
            .setType("text/plain")
            .putExtra(Intent.EXTRA_SUBJECT, getString(R.string.share_subject) + " " + BuildConfig.GIT_SHA)
            .putExtra(Intent.EXTRA_TEXT, fullLogText())
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
        }
    }

    private companion object {
        const val REQ_PERMISSIONS = 1
        const val LOG_TAIL = 200
        const val MAX_SHARE_CHARS = 180_000
    }
}
