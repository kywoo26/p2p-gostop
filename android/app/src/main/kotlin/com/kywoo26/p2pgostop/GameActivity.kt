package com.kywoo26.p2pgostop

import android.Manifest
import android.app.Activity
import android.app.AlertDialog
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.view.ViewGroup
import android.view.WindowManager
import android.window.OnBackInvokedCallback
import android.window.OnBackInvokedDispatcher
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.JavaScriptReplyProxy
import androidx.webkit.WebViewCompat
import androidx.webkit.WebViewFeature
import com.kywoo26.p2pgostop.log.Utf8
import com.kywoo26.p2pgostop.server.SERVER_PORT
import com.kywoo26.p2pgostop.share.LogShareFiles
import com.kywoo26.p2pgostop.share.LogShareProvider
import java.io.IOException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

/** Ktor와 같은 루프백 origin의 호스트 화면. 게임 로직은 웹 번들에만 있다. */
class GameActivity : Activity() {
    private lateinit var web: WebView
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var replyProxy: JavaScriptReplyProxy? = null
    private var gameActive = false
    private var fallingBack = false
    private val backCallback = OnBackInvokedCallback {
        if (gameActive) {
            AlertDialog.Builder(this).setMessage("진행 중인 게임을 나가시겠습니까?")
                .setPositiveButton("나가기") { _, _ -> finish() }
                .setNegativeButton("계속하기", null).show()
        } else finish()
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (!AppState.hotspot.value.serverRunning || !bundlePresent(this) ||
            !WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) {
            fallback("웹 번들 또는 WebView 브리지 없음")
            return
        }
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
                    if (request.isForMainFrame) fallback("웹 페이지 오류: ${error.description}")
                }
            }
        }
        setContentView(web, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        onBackInvokedDispatcher.registerOnBackInvokedCallback(OnBackInvokedDispatcher.PRIORITY_DEFAULT, backCallback)
        WebViewCompat.addWebMessageListener(web, "HostBridge", setOf(ORIGIN)) { _, message, sourceOrigin, isMainFrame, proxy ->
            if (!isMainFrame || sourceOrigin.toString() != ORIGIN) return@addWebMessageListener
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
        scope.launch { AppState.hotspot.collect { send(hotspotMessage(it)) } }
        web.loadUrl("$ORIGIN/?role=host&build=${BuildConfig.GIT_SHA}")
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
                    openDiagnostics()
                    response("error") { put("message", "NEARBY_WIFI_DEVICES permission required") }
                }
            }
            "stopHotspot" -> {
                startService(HotspotService.intent(this, HotspotService.ACTION_STOP))
                response("stopHotspot") { put("stopped", true) }
            }
            "share" -> {
                val text = msg.optString("text")
                val filename = msg.optString("filename").takeIf { it.isNotEmpty() }
                response("share") { put("shared", share(text, filename, msg.optString("title", "맞고 공유"))) }
            }
            "log" -> {
                val entries = msg.optJSONArray("entries")
                if (entries != null) appendLogs(entries) else {
                    val level = msg.optString("level", "info")
                    AppState.log("web $level: ${msg.optString("message")}")
                }
                response("log") { put("accepted", true) }
            }
            "keepScreenOn" -> {
                gameActive = if (msg.has("bool")) msg.optBoolean("bool") else msg.optBoolean("enabled")
                if (gameActive) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                response("keepScreenOn") { put("enabled", gameActive) }
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

    private fun appendLogs(entries: JSONArray) {
        for (i in 0 until minOf(entries.length(), 2000)) {
            val item = entries.opt(i)
            val role = if (item is JSONObject) item.optString("role", "host") else "host"
            val line = if (item is JSONObject) item.optString("message") else item?.toString().orEmpty()
            if (role == "guest") AppState.guestLogs.add(line) else AppState.log("web: $line")
        }
    }

    private fun share(text: String, filename: String?, title: String): Boolean {
        val safeText = Utf8.tail(text, 256 * 1024)
        val name = filename?.takeIf(LogShareFiles::isValidName)
        val uri = name?.let { LogShareProvider.write(this, it, safeText) }
        val intent = Intent(Intent.ACTION_SEND).setType(if (name?.endsWith(".json") == true) "application/json" else "text/plain")
            .putExtra(Intent.EXTRA_TEXT, if (uri == null) safeText else "맞고 공유 파일: $name")
            .putExtra(Intent.EXTRA_SUBJECT, Utf8.head(title, 200))
        if (uri != null) {
            intent.putExtra(Intent.EXTRA_STREAM, uri)
            intent.clipData = ClipData.newRawUri(name, uri)
            intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        return try {
            startActivity(Intent.createChooser(intent, "맞고 공유"))
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
        if (::web.isInitialized) {
            onBackInvokedDispatcher.unregisterOnBackInvokedCallback(backCallback)
            web.destroy()
        }
        super.onDestroy()
    }

    companion object {
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
                else -> "off"
            })
            .put("ssid", s.ssid)
            .put("password", s.password)
            .put("ip", s.ip)
            .put("port", if (s.serverRunning) SERVER_PORT else JSONObject.NULL)
            .put("error", s.lastError ?: s.serverError)
    }
}
