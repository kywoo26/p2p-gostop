package com.kywoo26.p2pgostop

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
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
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
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

/**
 * HostBridge 계약: 요청은 `{type,id?,...}` JSON이며 같은 id를 응답에 돌려준다.
 * `getHotspot`/`startHotspot` → `hotspot{state,ssid,password,ip,port,error}`;
 * `stopHotspot` → `stopHotspot{stopped}`; `share{text,filename?,title?}` → `share{shared}`;
 * `log{role?,message?,level?,entries?}` → `log{accepted}` (role=guest는 별도 게스트 버퍼,
 *   entries 항목의 role이 있으면 우선 적용; 입력 64KB·줄 2KB·게스트 전체 256KB 상한);
 * `keepScreenOn{bool}` → `keepScreenOn{enabled}`; `gameActive{bool}` → `gameActive{active}`;
 * `vibrate{pattern:number[]}` → `vibrate{accepted}` (첫 원소가 진동, 다음은 쉼, 반복.
 *   최대 16구간·구간당 500ms·총 2초 상한);
 * `openDiagnostics` → `openDiagnostics`; `getDeviceInfo` → `deviceInfo{device,version,gitSha,buildTime}`.
 * 핫스팟 상태는 요청 없이도 첫 브리지 메시지와 상태 변경 때 전달된다. 상태: off/starting/on/addressOnly/failed.
 * 권한이 없으면 startHotspot은 error{message:"permissionRequired"}를 보낸 뒤 권한 안내를 띄운다.
 * null 가능한 필드는 항상 JSON null로 보낸다. 브리지는 메인 프레임의 루프백 origin에만 노출된다.
 */
// WEB_MESSAGE_LISTENER는 onCreate에서 검사한다. JS는 번들된 루프백 페이지만 실행한다.
// onRenderProcessGone은 createWebView의 WebViewClient에서 구현한다.
@SuppressLint("RequiresFeature", "SetJavaScriptEnabled", "MissingOnRenderProcessGone")
class GameActivity : Activity() {
    private lateinit var web: WebView
    private lateinit var container: FrameLayout
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var replyProxy: JavaScriptReplyProxy? = null
    private var gameActive = false
    private var backRegistered = false
    private var pendingHotspotStart = false
    private var fallingBack = false
    private val backCallback = OnBackInvokedCallback {
        AlertDialog.Builder(this).setMessage(R.string.exit_game_confirm)
            .setPositiveButton(R.string.exit_game) { _, _ -> finish() }
            .setNegativeButton(R.string.stay_game, null).show()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
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
        if (!AppState.hotspot.value.serviceRunning) {
            // 솔로 모드: LOHS 권한 없이 서버만 시작하고 준비되면 루프백 WebView를 연다(I-10).
            startForegroundService(HotspotService.intent(this, HotspotService.ACTION_ADDRESS_ONLY))
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
            if (Utf8.length(raw) > 64 * 1024) return@addWebMessageListener
            try {
                handle(JSONObject(raw), proxy)
            } catch (e: Exception) {
                AppState.log("브리지 입력 오류: ${e.javaClass.simpleName}")
                proxy.postMessage(JSONObject().put("type", "error").put("message", "invalid bridge message").toString())
            }
        }
        web.loadUrl("$ORIGIN/?role=host&build=${BuildConfig.GIT_SHA}")
    }

    private fun destroyWebView(view: WebView) {
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
        fun response(type: String, build: JSONObject.() -> Unit = {}) {
            val result = JSONObject().put("type", type)
            if (id != null) result.put("id", id)
            result.build()
            proxy.postMessage(result.toString())
        }
        when (msg.optString("type")) {
            "getHotspot" -> proxy.postMessage(hotspotMessage(AppState.hotspot.value).apply { if (id != null) put("id", id) }.toString())
            "startHotspot" -> {
                if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
                    startForegroundService(HotspotService.intent(this, HotspotService.ACTION_START))
                    proxy.postMessage(hotspotMessage(AppState.hotspot.value).apply { if (id != null) put("id", id) }.toString())
                } else {
                    pendingHotspotStart = true
                    AlertDialog.Builder(this).setTitle(R.string.permission_title).setMessage(R.string.permission_body)
                        .setPositiveButton(R.string.permission_ok) { _, _ ->
                            requestPermissions(Diagnostics.runtimePermissions, REQ_HOTSPOT_PERMISSION)
                        }
                        .setNegativeButton(R.string.cancel) { _, _ -> pendingHotspotStart = false }
                        .show()
                    response("error") { put("message", "permissionRequired") }
                }
            }
            "stopHotspot" -> {
                startService(HotspotService.intent(this, HotspotService.ACTION_STOP))
                response("stopHotspot") { put("stopped", true) }
            }
            "share" -> {
                val text = msg.optString("text")
                val filename = msg.optString("filename").takeIf { it.isNotEmpty() }
                response("share") { put("shared", share(text, filename, msg.optString("title", getString(R.string.share_title)))) }
            }
            "log" -> {
                val entries = msg.optJSONArray("entries")
                if (entries != null) appendLogs(entries, msg.optString("role", "host")) else {
                    val level = msg.optString("level", "info")
                    val line = "web $level: ${msg.optString("message")}"
                    BridgeLogs.append(msg.optString("role"), line, AppState::log, AppState.guestLogs)
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
        if (active && !backRegistered) {
            onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback)
            backRegistered = true
        } else if (!active && backRegistered) {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
            backRegistered = false
        }
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != REQ_HOTSPOT_PERMISSION || !pendingHotspotStart) return
        pendingHotspotStart = false
        if (Diagnostics.granted(this, Manifest.permission.NEARBY_WIFI_DEVICES)) {
            startForegroundService(HotspotService.intent(this, HotspotService.ACTION_START))
        } else if (!shouldShowRequestPermissionRationale(Manifest.permission.NEARBY_WIFI_DEVICES)) {
            AlertDialog.Builder(this).setMessage(R.string.permission_denied)
                .setPositiveButton(R.string.open_settings) { _, _ ->
                    startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                        android.net.Uri.parse("package:$packageName")))
                }.setNegativeButton(R.string.cancel, null).show()
        }
        send(hotspotMessage(AppState.hotspot.value))
    }

    private fun appendLogs(entries: JSONArray, defaultRole: String) {
        for (i in 0 until minOf(entries.length(), 2000)) {
            val item = entries.opt(i)
            val role = if (item is JSONObject) item.optString("role", defaultRole) else defaultRole
            val line = if (item is JSONObject) item.optString("message") else item?.toString().orEmpty()
            BridgeLogs.append(role, line, AppState::log, AppState.guestLogs)
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
            .putExtra(MainActivity.EXTRA_FROM_GAME, !fallingBack))
    }

    private fun send(message: JSONObject) {
        runOnUiThread { replyProxy?.postMessage(message.toString()) }
    }

    private fun fallback(reason: String) {
        if (fallingBack) return
        fallingBack = true
        AppState.log("WebView 폴백: $reason")
        openDiagnostics()
        finish()
    }

    override fun onDestroy() {
        scope.cancel()
        if (backRegistered) onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
        if (::web.isInitialized) {
            destroyWebView(web)
        }
        super.onDestroy()
    }

    companion object {
        private const val REQ_HOTSPOT_PERMISSION = 51
        const val ORIGIN = "http://127.0.0.1:17777"

        fun bundlePresent(context: Context): Boolean = try {
            context.assets.open("web/index.html").use { true }
        } catch (_: IOException) { false }

        fun hotspotMessage(s: HotspotState): JSONObject = JSONObject()
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
    }
}
