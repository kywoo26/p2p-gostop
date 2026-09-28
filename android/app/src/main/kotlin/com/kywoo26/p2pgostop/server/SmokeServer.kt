package com.kywoo26.p2pgostop.server

import com.kywoo26.p2pgostop.log.Utf8
import io.ktor.http.CacheControl
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.Application
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.plugins.origin
import io.ktor.server.response.header
import io.ktor.server.response.respondBytes
import io.ktor.server.response.respondText
import io.ktor.server.routing.get
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.DefaultWebSocketServerSession
import io.ktor.server.websocket.pingPeriod
import io.ktor.server.websocket.timeout
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.CloseReason
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.cancellation.CancellationException
import kotlin.time.Duration.Companion.seconds

/** 서버 포트. 호스트 WebView origin(`http://127.0.0.1:17777`)과 묶여 있으므로 바꾸지 않는다. */
const val SERVER_PORT = 17777

/**
 * 메시지 상한 = WebSocket 프레임 상한(spec NP-09). **UTF-8 바이트** 기준이다(Ktor `maxFrameSize`는 페이로드 바이트).
 * 넘는 프레임이 오면 Ktor가 1009(Message Too Big)로 연결을 닫는다.
 */
const val MAX_MESSAGE_BYTES = 64 * 1024

/**
 * 게스트 페이지가 로그 본문을 자르는 상한(UTF-8 바이트). 접두어 `log:`를 붙여도 [MAX_MESSAGE_BYTES]보다 작다.
 * 페이지(SmokePage)는 이 값을 그대로 받아 `TextEncoder`로 바이트를 세어 자른다(M0 리뷰 L-3).
 */
const val GUEST_UPLOAD_MAX_BYTES = 60_000

/** 게스트 로그 업로드 최소 간격(모든 연결 합산). 한 게스트가 업로드를 반복해 버퍼를 휘젓지 못하게 한다(M0 리뷰 L-1). */
const val GUEST_LOG_MIN_INTERVAL_MS = 5_000L

/** 게스트 로그 수신 응답. 전체를 되돌려 보내지 않고 받은 바이트 수만 알린다(M0 리뷰 L-5). */
const val GUEST_LOG_ACK = "ack:log:"
const val GUEST_LOG_RATE_LIMITED = "nack:log:rate"

/** 서버가 페이지·/health에 싣는 정보와 로그 콜백. Android 의존성 없이 JVM에서 테스트한다. */
class ServerEnv(
    val appVersion: String,
    val gitSha: String,
    val buildTime: String,
    val deviceInfo: () -> Map<String, String>,
    val log: (String) -> Unit,
    /** 게스트가 올린 로그. 호스트 로그와 다른 버퍼에 둔다(spec NP-09, M0 리뷰 L-1·L-4). */
    val guestLog: (String) -> Unit = log,
    val clients: AtomicInteger = AtomicInteger(0),
    val onClientsChanged: (Int) -> Unit = {},
    val startedAtMs: Long = System.currentTimeMillis(),
    val nowMs: () -> Long = System::currentTimeMillis,
    val guestLogMinIntervalMs: Long = GUEST_LOG_MIN_INTERVAL_MS,
    val asset: (String) -> ByteArray? = { null },
    val roles: RoleCounts = RoleCounts(),
    val roleChanged: (String, Boolean) -> Unit = { _, _ -> },
) {
    private val lastGuestLogAt = AtomicLong(-1)

    /** 게스트 로그 업로드 빈도 제한. 받아들이면 true. */
    fun tryAcceptGuestLog(): Boolean {
        while (true) {
            val now = nowMs()
            val prev = lastGuestLogAt.get()
            if (prev >= 0 && now - prev < guestLogMinIntervalMs) return false
            if (lastGuestLogAt.compareAndSet(prev, now)) return true
        }
    }
}

/** 앱 정적 페이지, 역할별 중계, M0 진단을 제공한다. */
fun Application.smokeModule(env: ServerEnv) {
    install(WebSockets) {
        pingPeriod = 25.seconds
        timeout = 60.seconds
        maxFrameSize = MAX_MESSAGE_BYTES.toLong()
        masking = false
    }
    val relay = RelayRoles(env)
    routing {
        get("/") {
            serveAsset(call, env, "index.html")
        }
        get("/{path...}") {
            val path = call.parameters.getAll("path")?.joinToString("/").orEmpty()
            if (path.isEmpty() || path.startsWith("smoke") || path == "health") {
                call.respondText("Not found", status = HttpStatusCode.NotFound)
            } else serveAsset(call, env, path)
        }
        get("/smoke") {
            env.log("HTTP GET /smoke from ${call.request.origin.remoteAddress} UA=${call.request.headers[HttpHeaders.UserAgent].orEmpty().take(160)}")
            call.response.header(HttpHeaders.CacheControl, CacheControl.NoStore(null).toString())
            call.respondText(SmokePage.render(env), ContentType.Text.Html.withParameter("charset", "utf-8"))
        }
        get("/health") {
            call.response.header(HttpHeaders.CacheControl, CacheControl.NoStore(null).toString())
            call.respondText(healthJson(env), ContentType.Application.Json)
        }
        webSocket("/ws") {
            val role = call.request.queryParameters["role"]
            if (role != "host" && role != "guest") {
                close(CloseReason(1008.toShort(), "{\"error\":\"invalid role\"}"))
                return@webSocket
            }
            if (!relay.join(role, this)) {
                close(CloseReason(4409.toShort(), "{\"error\":\"role occupied\"}"))
                return@webSocket
            }
            try {
                relay.notifyPeer(role, "joined")
                for (frame in incoming) {
                    if (frame !is Frame.Text) {
                        close(CloseReason(1003.toShort(), "text frames only"))
                        break
                    }
                    if (frame.data.size > MAX_MESSAGE_BYTES) {
                        close(CloseReason(1009.toShort(), "message too large"))
                        break
                    }
                    relay.forward(role, this, frame)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                env.log("relay $role 오류: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
            } finally {
                relay.leave(role, this)
                relay.notifyPeer(role, "left")
            }
        }
        webSocket("/smoke/ws") {
            val peer = call.request.origin.remoteAddress
            val n = env.clients.incrementAndGet()
            env.onClientsChanged(n)
            env.log("WS 연결 $peer (접속 $n)")
            try {
                for (frame in incoming) {
                    when (frame) {
                        is Frame.Text -> {
                            val text = frame.readText()
                            if (text.startsWith(GUEST_LOG_PREFIX)) {
                                val body = text.removePrefix(GUEST_LOG_PREFIX)
                                val bytes = Utf8.length(body)
                                if (env.tryAcceptGuestLog()) {
                                    // 줄당·총량 바이트 상한은 게스트 로그 버퍼(LogBuffer)가 강제한다.
                                    env.guestLog("[게스트 $peer 업로드 ${bytes}바이트]\n$body")
                                    env.log("게스트 로그 수신 $peer ${bytes}바이트 (게스트 버퍼에 보관)")
                                    send(Frame.Text("$GUEST_LOG_ACK$bytes"))
                                } else {
                                    env.log("게스트 로그 무시(빈도 제한 ${env.guestLogMinIntervalMs}ms) $peer ${bytes}바이트")
                                    send(Frame.Text(GUEST_LOG_RATE_LIMITED))
                                }
                            } else {
                                env.log("WS 수신 ${text.length}자: ${text.take(120)}")
                                send(Frame.Text(text))
                            }
                        }
                        is Frame.Binary -> send(Frame.Binary(true, frame.data))
                        else -> Unit
                    }
                }
            } catch (e: CancellationException) {
                throw e // 서버 정지·연결 종료는 오류가 아니다(M0 리뷰 L-6)
            } catch (e: Exception) {
                env.log("WS 오류 $peer: ${e.javaClass.simpleName} ${e.message.orEmpty()}")
            } finally {
                val left = env.clients.decrementAndGet()
                env.onClientsChanged(left)
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
        "hostConnected" to (env.roles.host.get()).toString(),
        "guestConnected" to (env.roles.guest.get()).toString(),
        "bundlePresent" to (env.asset("index.html") != null).toString(),
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

class RoleCounts {
    val host = AtomicBoolean(false)
    val guest = AtomicBoolean(false)
}

private class RelayRoles(private val env: ServerEnv) {
    private var host: DefaultWebSocketServerSession? = null
    private var guest: DefaultWebSocketServerSession? = null
    private val absenceNotified = mutableSetOf<DefaultWebSocketServerSession>()

    @Synchronized fun join(role: String, session: DefaultWebSocketServerSession): Boolean {
        if (role == "host") {
            if (host != null) return false
            host = session
            env.roles.host.set(true)
        } else {
            if (guest != null) return false
            guest = session
            env.roles.guest.set(true)
        }
        env.clients.incrementAndGet()
        env.onClientsChanged(env.clients.get())
        env.roleChanged(role, true)
        env.log("relay $role 연결 (호스트=${env.roles.host.get()} 게스트=${env.roles.guest.get()})")
        return true
    }

    @Synchronized fun leave(role: String, session: DefaultWebSocketServerSession) {
        if (role == "host" && host === session) {
            host = null
            env.roles.host.set(false)
        } else if (role == "guest" && guest === session) {
            guest = null
            env.roles.guest.set(false)
        } else return
        absenceNotified.remove(session)
        env.clients.decrementAndGet()
        env.onClientsChanged(env.clients.get())
        env.roleChanged(role, false)
        env.log("relay $role 종료 (호스트=${env.roles.host.get()} 게스트=${env.roles.guest.get()})")
    }

    @Synchronized private fun peer(role: String): DefaultWebSocketServerSession? =
        if (role == "host") guest else host

    suspend fun notifyPeer(role: String, event: String) {
        val target = peer(role) ?: return
        synchronized(this) { absenceNotified.remove(target) }
        try {
            target.outgoing.send(Frame.Text("{\"type\":\"relay\",\"peer\":\"$event\"}"))
        } catch (e: CancellationException) {
            throw e
        } catch (_: Exception) {
            // 상대 소켓이 이미 닫혔다. 각 세션의 finally가 접속 상태를 정리한다.
        }
    }

    suspend fun forward(role: String, sender: DefaultWebSocketServerSession, frame: Frame.Text) {
        val target = peer(role)
        if (target == null) {
            val first = synchronized(this) { absenceNotified.add(sender) }
            if (first) sender.outgoing.send(Frame.Text("{\"type\":\"relay\",\"peer\":\"absent\"}"))
        } else {
            synchronized(this) { absenceNotified.remove(sender) }
            try {
                target.outgoing.send(Frame.Text(frame.readText()))
                env.log("relay $role 전달 ${frame.data.size}바이트")
            } catch (e: CancellationException) {
                throw e
            } catch (_: Exception) {
                val first = synchronized(this) { absenceNotified.add(sender) }
                if (first) sender.outgoing.send(Frame.Text("{\"type\":\"relay\",\"peer\":\"absent\"}"))
            }
        }
    }
}

private val HASHED_ASSET = Regex("[.-][A-Za-z0-9_-]{8,}\\.")

private suspend fun serveAsset(call: io.ktor.server.application.ApplicationCall, env: ServerEnv, path: String) {
    if (path.startsWith('/') || path.split('/').any { it == ".." || it == "." || it.isEmpty() } ||
        !path.matches(Regex("[A-Za-z0-9_./-]+"))) {
        call.respondText("Not found", status = HttpStatusCode.NotFound)
        return
    }
    val bytes = env.asset(path)
    if (bytes == null && path != "index.html") {
        call.respondText("Not found", status = HttpStatusCode.NotFound)
        return
    }
    val type = when (path.substringAfterLast('.', "")) {
        "html" -> ContentType.Text.Html
        "js" -> ContentType.parse("text/javascript")
        "css" -> ContentType.Text.CSS
        "svg" -> ContentType.Image.SVG
        "json" -> ContentType.Application.Json
        "md" -> ContentType.parse("text/markdown")
        "woff2" -> ContentType.parse("font/woff2")
        else -> ContentType.Application.OctetStream
    }
    call.response.header(HttpHeaders.CacheControl, if (path != "index.html" && HASHED_ASSET.containsMatchIn(path))
        "public, max-age=31536000, immutable" else CacheControl.NoStore(null).toString())
    val content = bytes ?: "<!doctype html><html lang=\"ko\"><meta charset=\"utf-8\"><title>맞고</title><body><p>web bundle is missing</p></body></html>".toByteArray()
    call.respondBytes(content, type)
}
