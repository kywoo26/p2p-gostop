package com.kywoo26.p2pgostop

import android.Manifest
import android.annotation.SuppressLint
import android.app.AlertDialog
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Color
import android.graphics.Insets
import android.os.Bundle
import android.os.CombinedVibration
import android.os.VibrationEffect
import android.os.VibratorManager
import android.provider.Settings
import android.view.ViewGroup
import android.view.WindowInsets
import android.view.WindowManager
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.RenderProcessGoneDetail
import android.widget.FrameLayout
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import com.kywoo26.p2pgostop.log.LogReport
import com.kywoo26.p2pgostop.log.Utf8
import com.kywoo26.p2pgostop.server.SERVER_PORT
import com.kywoo26.p2pgostop.share.LogShareFiles
import com.kywoo26.p2pgostop.share.LogShareProvider
import java.io.IOException
import java.time.LocalDateTime
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** HostBridge 계약의 정본은 plan.md §1.7. 게임 로직은 루프백 WebView 번들에만 있다. */
// WEB_MESSAGE_LISTENER는 onCreate에서 검사한다. JS는 번들된 루프백 페이지만 실행한다.
// onRenderProcessGone은 createWebView의 WebViewClient에서 구현한다.
@SuppressLint("RequiresFeature", "SetJavaScriptEnabled", "MissingOnRenderProcessGone", "UseKtx")
class GameActivity : ComponentActivity() {
    private var remoteMode = false
    private lateinit var web: WebView
    private lateinit var container: FrameLayout
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var replyProxy: JavaScriptReplyProxy? = null
    private var gameActive = true
    private var pageLoaded = false
    private var pendingHotspotStart = false
    private var pendingHotspotId: Any? = null
    private var awaitingHotspotSettings = false
    private var fallingBack = false
    private lateinit var backCallback: OnBackPressedCallback

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        remoteMode = intent.getBooleanExtra(EXTRA_REMOTE_MODE, false) || HotspotService.remoteModeActive
        backCallback = registerGameBack(
            onBackPressedDispatcher,
            pageLoaded = { pageLoaded },
            bridgeReady = { replyProxy != null },
            gameActive = { gameActive },
            sendWeb = { send(it) },
            confirmNativeExit = {
                AlertDialog.Builder(this).setMessage(R.string.exit_game_confirm)
                    .setPositiveButton(R.string.exit_game) { _, _ -> finish() }
                    .setNegativeButton(R.string.stay_game, null).show()
            },
        )
        // 웹 브리지가 준비되기 전에도 호스트 화면이 잠기지 않게 한다(I-7).
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        if (!bundlePresent(this)) {
            fallback(getString(R.string.web_bundle_missing))
            return
        }
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            fallback(getString(R.string.web_bridge_missing))
            return
        }
        container = FrameLayout(this)
        container.setOnApplyWindowInsetsListener { view, insets ->
            val bars = insets.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout())
            view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
            WindowInsets.Builder(insets)
                .setInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.displayCutout(), Insets.NONE)
                .build()
        }
        setContentView(container)
        val serviceRunning = AppState.hotspot.value.serviceRunning
        val serviceRemote = HotspotService.remoteModeActive
        val action = gameServerAction(remoteMode, serviceRunning, serviceRemote)
        if (action == HotspotService.ACTION_REMOTE_SERVER_ONLY && serviceRunning && !serviceRemote) {
            // 이전 LAN 서버의 running=true로 WebView를 너무 일찍 열지 않는다.
            AppState.update { it.copy(serverRunning = false) }
        }
        action?.let {
            // 원격은 기존 LAN 서비스가 돌고 있어도 LOHS를 종료하고 loopback 서버로 다시 연다.
            startForegroundService(HotspotService.intent(this, it))
        }
        scope.launch {
            AppState.hotspot.collect { state ->
                if (state.serverRunning && !::web.isInitialized) createWebView()
                send(hotspotMessage(state))
            }
        }
    }

    private fun createWebView() {
        web = WebView(this).apply {
            setBackgroundColor(Color.rgb(15, 25, 20))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            webViewClient = object : WebViewClient() {
                override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                    pageLoaded = false
                    replyProxy = null
                }

                override fun onPageFinished(view: WebView, url: String?) {
                    pageLoaded = url?.startsWith(ORIGIN) == true
                }

                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
                    request.url.scheme != "http" || request.url.host != "127.0.0.1" || request.url.port != SERVER_PORT

                override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
                    if (request.isForMainFrame) fallback(getString(R.string.web_page_error, error.description))
                }

                override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean {
                    AppState.log("WebView 렌더러 종료: crash=${detail.didCrash()}; 페이지 다시 로드")
                    destroyWebView(view)
                    createWebView()
                    return true
                }
            }
        }
        container.addView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        WebViewCompat.addWebMessageListener(web, "HostBridge", setOf(ORIGIN)) { _, message, sourceOrigin, isMainFrame, proxy ->
            if (!isMainFrame || sourceOrigin.toString() != ORIGIN) return@addWebMessageListener
            // 새 페이지의 첫 메시지에 현재 상태를 즉시 보낸다.
            if (replyProxy == null) proxy.postMessage(hotspotMessage(AppState.hotspot.value).toString())
            replyProxy = proxy
            val raw = message.data ?: return@addWebMessageListener
            if (Utf8.length(raw) > 64 * 1024) {
                proxy.postMessage(JSONObject().put("type", "error").put("message", "tooLarge").toString())
                return@addWebMessageListener
            }
            try {
                handle(JSONObject(raw), proxy)
            } catch (e: Exception) {
                AppState.log("브리지 입력 오류: ${e.javaClass.simpleName}")
                proxy.postMessage(JSONObject().put("type", "error").put("message", "invalid bridge message").toString())
            }
        }
        web.loadUrl("$ORIGIN/?build=${BuildConfig.GIT_SHA}")
    }

    private fun destroyWebView(view: WebView) {
        pageLoaded = false
        replyProxy = null
        WebViewCompat.removeWebMessageListener(view, "HostBridge")
        container.removeView(view)
        view.destroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        // 호스트의 권위 게임 상태는 이 WebView의 JS 메모리에 있다. 구성을 바꿔도 인스턴스를 유지한다(S-1).
    }

    private fun handle(msg: JSONObject, proxy: JavaScriptReplyProxy) {
        val id = msg.opt("id")
        fun input(key: String, fallback: String = ""): String =
            if (!msg.has(key) || msg.isNull(key)) fallback else msg.optString(key, fallback)
        fun response(type: String, build: JSONObject.() -> Unit = {}) {
            val result = JSONObject().put("type", type)
            if (id != null) result.put("id", id)
            result.build()
            proxy.postMessage(result.toString())
        }
        when (input("type")) {
            "getHotspot" -> proxy.postMessage(hotspotMessage(AppState.hotspot.value).apply { if (id != null) put("id", id) }.toString())
            "startHotspot" -> {
                if (remoteMode) {
                    response("error") { put("message", "unavailableInRemoteMode") }
                    return
                }
                if (pendingHotspotStart || awaitingHotspotSettings) {
                    response("error") { put("message", "permissionPending") }
                } else if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
                    startForegroundService(HotspotService.intent(this, HotspotService.ACTION_START))
                    proxy.postMessage(hotspotMessage(AppState.hotspot.value).apply { if (id != null) put("id", id) }.toString())
                } else {
                    pendingHotspotStart = true
                    pendingHotspotId = id
                    AlertDialog.Builder(this).setTitle(R.string.permission_title).setMessage(R.string.permission_body)
                        .setPositiveButton(R.string.permission_ok) { _, _ ->
                            requestPermissions(Diagnostics.runtimePermissions, REQ_HOTSPOT_PERMISSION)
                        }
                        .setNegativeButton(R.string.cancel) { _, _ ->
                            pendingHotspotStart = false
                            pendingHotspotId = null
                        }
                        .show()
                    response("error") { put("message", "permissionRequired") }
                }
            }
            "stopHotspot" -> {
                if (remoteMode) {
                    response("error") { put("message", "unavailableInRemoteMode") }
                    return
                }
                startService(HotspotService.intent(this, HotspotService.ACTION_ADDRESS_ONLY))
                response("stopHotspot") { put("stopped", true) }
            }
            "enableLan" -> {
                if (remoteMode) {
                    response("error") { put("message", "unavailableInRemoteMode") }
                    return
                }
                if (!msg.has("bool") || msg.isNull("bool")) {
                    response("error") { put("message", "invalid bridge message") }
                } else {
                    val enabled = msg.optBoolean("bool")
                    AppState.update { state ->
                        state.copy(lanEnabled = enabled, status = when {
                            enabled && !state.hotspotActive -> HotspotStatus.ADDRESS_ONLY
                            !enabled && state.status == HotspotStatus.ADDRESS_ONLY -> HotspotStatus.STOPPED
                            else -> state.status
                        })
                    }
                    response("lan") { put("enabled", enabled) }
                }
            }
            "share" -> {
                val text = input("text")
                val filename = input("filename").takeIf { it.isNotEmpty() }
                response("share") { put("shared", share(text, filename, input("title", getString(R.string.share_title)))) }
            }
            "log" -> {
                val entries = msg.optJSONArray("entries")
                if (entries != null) appendLogs(entries, input("role", "host")) else {
                    val level = input("level", "info")
                    val line = "web $level: ${input("message")}"
                    BridgeLogs.append(input("role"), line, AppState.webLogs, AppState.guestLogs)
                }
                response("log") { put("accepted", true) }
            }
            "keepScreenOn" -> {
                val enabled = if (msg.has("bool")) msg.optBoolean("bool") else msg.optBoolean("enabled")
                if (enabled) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                response("keepScreenOn") { put("enabled", enabled) }
            }
            "gameActive" -> {
                setGameActive(msg.optBoolean("bool"))
                response("gameActive") { put("active", gameActive) }
            }
            "vibrate" -> {
                val values = msg.optJSONArray("pattern")
                val pattern = if (values == null || values.length() > VibrationPattern.MAX_SEGMENTS) null else (0 until values.length()).map { index ->
                    values.opt(index).let {
                        if (it is Number && it.toDouble().isFinite() && it.toDouble() >= 0 &&
                            it.toDouble() == it.toDouble().toLong().toDouble()) it.toLong() else -1L
                    }
                }
                val waveform = pattern?.let(VibrationPattern::waveform)
                val accepted = if (waveform == null) false else runCatching {
                    getSystemService(VibratorManager::class.java).vibrate(
                        CombinedVibration.createParallel(VibrationEffect.createWaveform(waveform, -1)),
                    )
                    true
                }.getOrDefault(false)
                response("vibrate") { put("accepted", accepted) }
            }
            "openDiagnostics" -> {
                openDiagnostics()
                response("openDiagnostics")
            }
            "getDeviceInfo" -> response("deviceInfo") {
                put("device", JSONObject(DeviceInfo.map()))
                put("version", BuildConfig.VERSION_NAME)
                put("gitSha", BuildConfig.GIT_SHA)
                put("buildTime", BuildConfig.BUILD_TIME)
            }
            else -> response("error") { put("message", "unknown action") }
        }
    }

    private fun setGameActive(active: Boolean) {
        gameActive = active
    }

    private fun sendPermissionResult(message: JSONObject) {
        pendingHotspotId?.let { message.put("id", it) }
        send(message)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (remoteMode) {
            pendingHotspotStart = false
            pendingHotspotId = null
            return
        }
        if (requestCode != REQ_HOTSPOT_PERMISSION || !pendingHotspotStart) return
        pendingHotspotStart = false
        if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
            startForegroundService(HotspotService.intent(this, HotspotService.ACTION_START))
            sendPermissionResult(hotspotMessage(AppState.hotspot.value))
            pendingHotspotId = null
        } else if (!shouldShowRequestPermissionRationale(Manifest.permission.NEARBY_WIFI_DEVICES)) {
            sendPermissionResult(JSONObject().put("type", "error").put("message", "permissionDenied"))
            AlertDialog.Builder(this).setMessage(R.string.permission_denied)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    awaitingHotspotSettings = true
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:$packageName")))
                }.setNegativeButton(R.string.cancel) { _, _ -> pendingHotspotId = null }.show()
        } else {
            sendPermissionResult(JSONObject().put("type", "error").put("message", "permissionDenied"))
            pendingHotspotId = null
        }
    }

    override fun onResume() {
        super.onResume()
        if (remoteMode) {
            awaitingHotspotSettings = false
            pendingHotspotId = null
            return
        }
        if (!awaitingHotspotSettings) return
        awaitingHotspotSettings = false
        if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
            startForegroundService(HotspotService.intent(this, HotspotService.ACTION_START))
            sendPermissionResult(hotspotMessage(AppState.hotspot.value))
        } else {
            sendPermissionResult(JSONObject().put("type", "error").put("message", "permissionDenied"))
        }
        pendingHotspotId = null
    }

    private fun appendLogs(entries: JSONArray, defaultRole: String) {
        for (i in 0 until minOf(entries.length(), 2000)) {
            val item = entries.opt(i)
            val role = if (item is JSONObject && item.has("role") && !item.isNull("role"))
                item.optString("role") else defaultRole
            val line = if (item is JSONObject) {
                if (item.has("message") && !item.isNull("message")) item.optString("message") else ""
            } else if (item == JSONObject.NULL) "" else item?.toString().orEmpty()
            BridgeLogs.append(role, line, AppState.webLogs, AppState.guestLogs)
        }
    }

    private fun share(text: String, filename: String?, title: String): Boolean {
        val safeText = Utf8.tail(text, 256 * 1024)
        val maxBody = LogReport.SHARE_TEXT_MAX_BYTES
        val name = filename?.takeIf(LogShareFiles::isValidName)
            ?: if (Utf8.length(safeText) > maxBody) LogShareFiles.name(BuildConfig.GIT_SHA, LocalDateTime.now()) else null
        val uri = try {
            name?.let { LogShareProvider.write(this, it, safeText) }
        } catch (e: Exception) {
            AppState.log("공유 파일 쓰기 실패: ${e.message}")
            return false
        }
        val body = if (uri == null) safeText else LogReport.clipTail(getString(R.string.share_file_note, name) + "\n$safeText", maxBody)
        val intent = Intent(Intent.ACTION_SEND).setType(if (name?.endsWith(".json") == true) "application/json" else "text/plain")
            .putExtra(Intent.EXTRA_TEXT, body)
            .putExtra(Intent.EXTRA_SUBJECT, Utf8.head(title, 200))
        if (uri != null) {
            intent.putExtra(Intent.EXTRA_STREAM, uri)
            intent.clipData = ClipData.newRawUri(name, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            startActivity(Intent.createChooser(intent, getString(R.string.share_title)))
            true
        } catch (e: RuntimeException) {
            AppState.log("공유 실패: ${e.javaClass.simpleName} ${e.message}")
            false
        }
    }

    private fun openDiagnostics() {
        startActivity(Intent(this, MainActivity::class.java)
            .putExtra(MainActivity.EXTRA_DIAGNOSTICS, true)
            .putExtra(EXTRA_REMOTE_MODE, remoteMode)
            .putExtra(MainActivity.EXTRA_FROM_GAME, !fallingBack))
    }

    private fun send(message: JSONObject) {
        runOnUiThread { replyProxy?.postMessage(message.toString()) }
    }

    private fun hotspotMessage(s: HotspotState): JSONObject = JSONObject()
        .put("type", "hotspot")
        .put("state", when (s.status) {
            HotspotStatus.STARTING -> "starting"
            HotspotStatus.RUNNING -> "on"
            HotspotStatus.FAILED -> "failed"
            HotspotStatus.ADDRESS_ONLY -> "addressOnly"
            else -> "off"
        })
        .put("ssid", s.ssid ?: JSONObject.NULL)
        .put("password", s.password ?: JSONObject.NULL)
        .put("ip", s.ip ?: JSONObject.NULL)
        .put("port", if (s.serverRunning) SERVER_PORT else JSONObject.NULL)
        .put("error", s.lastError ?: s.serverError ?: JSONObject.NULL)
        .put("lanEnabled", s.lanEnabled)
        .put("warning", if (s.status == HotspotStatus.ADDRESS_ONLY && s.lanEnabled)
            getString(R.string.status_address_only) else JSONObject.NULL)

    private fun fallback(reason: String) {
        if (fallingBack) return
        fallingBack = true
        AppState.log("WebView 폴백: $reason")
        openDiagnostics()
        finish()
    }

    override fun onDestroy() {
        if (::backCallback.isInitialized) backCallback.remove()
        scope.cancel()
        if (::web.isInitialized) {
            destroyWebView(web)
        }
        super.onDestroy()
    }

    companion object {
        private const val REQ_HOTSPOT_PERMISSION = 51
        const val EXTRA_REMOTE_MODE = "com.kywoo26.p2pgostop.REMOTE_MODE"
        const val ORIGIN = "http://127.0.0.1:17777"

        fun bundlePresent(context: Context): Boolean = try {
            context.assets.open("web/index.html").use { true }
        } catch (_: IOException) { false }

    }
}

/** FR-RP-08: 원격 진입·복귀는 기존 서비스 상태와 무관하게 서버 전용 명령을 보낸다. */
internal fun gameServerAction(remoteMode: Boolean, serviceRunning: Boolean, serviceRemote: Boolean): String? = when {
    remoteMode && (!serviceRunning || !serviceRemote) -> HotspotService.ACTION_REMOTE_SERVER_ONLY
    remoteMode -> null
    !serviceRunning -> HotspotService.ACTION_SERVER_ONLY
    else -> null
}
