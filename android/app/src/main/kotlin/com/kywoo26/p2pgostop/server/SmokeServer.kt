package com.kywoo26.p2pgostop.server

import io.ktor.http.CacheControl
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.origin
import io.ktor.server.response.header
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.pingPeriod
import io.ktor.server.websocket.timeout
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import java.util.concurrent.atomic.AtomicInteger
import kotlin.time.Duration.Companion.seconds

/** 서버 포트. 호스트 WebView origin(`http://127.0.0.1:17777`)과 묶여 있으므로 바꾸지 않는다. */
const val SERVER_PORT = 17777

/** 게스트 로그 업로드 상한(spec NP-09). WebSocket 프레임 상한도 같다. */
const val MAX_MESSAGE_BYTES = 64 * 1024

/** 서버가 페이지·/health에 싣는 정보와 로그 콜백. Android 의존성 없이 JVM에서 테스트한다. */
class ServerEnv(
    val appVersion: String,
    val gitSha: String,
    val buildTime: String,
    val deviceInfo: () -> Map<String, String>,
    val log: (String) -> Unit,
    val clients: AtomicInteger = AtomicInteger(0),
    val startedAtMs: Long = System.currentTimeMillis(),
)

/** M0 스모크 서버 모듈: `GET /`(연결 성공 페이지), `GET /health`(JSON), `WS /ws`(에코). */
fun Application.smokeModule(env: ServerEnv) {
    install(WebSockets) {
        pingPeriod = 15.seconds
        timeout = 15.seconds
        maxFrameSize = MAX_MESSAGE_BYTES.toLong()
        masking = false
    }
    routing {
        get("/") {
            env.log("HTTP GET / from ${call.request.origin.remoteAddress} UA=${call.request.headers[HttpHeaders.UserAgent].orEmpty().take(160)}")
            call.response.header(HttpHeaders.CacheControl, CacheControl.NoStore(null).toString())
            call.respondText(SmokePage.render(env), ContentType.Text.Html.withParameter("charset", "utf-8"))
        }
        get("/health") {
            call.response.header(HttpHeaders.CacheControl, CacheControl.NoStore(null).toString())
            call.respondText(healthJson(env), ContentType.Application.Json)
        }
        webSocket("/ws") {
            val peer = call.request.origin.remoteAddress
            val n = env.clients.incrementAndGet()
            env.log("WS 연결 $peer (접속 $n)")
            try {
                for (frame in incoming) {
                    when (frame) {
                        is Frame.Text -> {
                            val text = frame.readText()
                            if (text.startsWith(GUEST_LOG_PREFIX)) {
                                env.log("[게스트 로그 $peer]\n" + text.removePrefix(GUEST_LOG_PREFIX).take(MAX_MESSAGE_BYTES))
                            } else {
                                env.log("WS 수신 ${text.length}자: ${text.take(120)}")
                            }
                            send(Frame.Text(text))
                        }
                        is Frame.Binary -> send(Frame.Binary(true, frame.data))
                        else -> Unit
                    }
                }
            } catch (e: Exception) {
                env.log("WS 오류 $peer: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
            } finally {
                val left = env.clients.decrementAndGet()
                env.log("WS 종료 $peer (접속 $left)")
            }
        }
    }
}

/** 게스트 페이지가 로그를 호스트로 올릴 때 붙이는 접두어(M0 전용 텍스트 규약). */
const val GUEST_LOG_PREFIX = "log:"

internal fun healthJson(env: ServerEnv): String {
    val fields = linkedMapOf(
        "status" to "\"ok\"",
        "app" to "\"p2p-gostop\"",
        "versionName" to jsonString(env.appVersion),
        "gitSha" to jsonString(env.gitSha),
        "buildTime" to jsonString(env.buildTime),
        "port" to SERVER_PORT.toString(),
        "wsClients" to env.clients.get().toString(),
        "uptimeMs" to (System.currentTimeMillis() - env.startedAtMs).toString(),
    )
    return fields.entries.joinToString(prefix = "{", postfix = "}", separator = ",") { (k, v) -> "\"$k\":$v" }
}

internal fun jsonString(s: String): String = buildString {
    append('"')
    for (c in s) {
        when {
            c == '"' -> append("\\\"")
            c == '\\' -> append("\\\\")
            c == '\n' -> append("\\n")
            c == '\r' -> append("\\r")
            c == '\t' -> append("\\t")
            c < ' ' -> append("\\u%04x".format(c.code))
            else -> append(c)
        }
    }
    append('"')
}

/** 0.0.0.0:17777에 CIO 서버를 띄운다. 메인 스레드에서 호출하지 않는다. */
fun startSmokeServer(env: ServerEnv, port: Int = SERVER_PORT): EmbeddedServer<*, *> =
    embeddedServer(CIO, host = "0.0.0.0", port = port) { smokeModule(env) }.start(wait = false)
