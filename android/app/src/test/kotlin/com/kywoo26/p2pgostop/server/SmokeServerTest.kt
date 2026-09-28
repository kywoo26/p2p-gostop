package com.kywoo26.p2pgostop.server

import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpStatusCode
import io.ktor.http.contentType
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import java.util.Collections
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SmokeServerTest {
    private val logs = Collections.synchronizedList(mutableListOf<String>())
    private val guestLogs = Collections.synchronizedList(mutableListOf<String>())
    private val clientCounts = Collections.synchronizedList(mutableListOf<Int>())
    private var now = 1_000_000L
    private val env = ServerEnv(
        appVersion = "0.0.1-test",
        gitSha = "abc1234",
        buildTime = "2026-09-28T00:00:00Z",
        deviceInfo = { mapOf("호스트 기기" to "samsung <SM-S938N>") },
        log = { logs.add(it) },
        guestLog = { guestLogs.add(it) },
        onClientsChanged = { clientCounts.add(it) },
        nowMs = { now },
    )

    @Test
    fun `루트 페이지는 연결 성공과 기기 정보를 보여 준다`() = testApplication {
        application { smokeModule(env) }
        val res = client.get("/smoke")
        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Text.Html))
        val body = res.bodyAsText()
        assertTrue(body.contains("연결 성공"))
        assertTrue(body.contains("abc1234"))
        assertTrue(body.contains("samsung &lt;SM-S938N&gt;"), "HTML 이스케이프")
        assertTrue(body.contains("/ws"))
        assertFalse(Regex("(src|href)=\"https?://").containsMatchIn(body), "외부 리소스 금지(NP-08)")
        assertFalse(body.contains("navigator.clipboard") || body.contains("navigator.share("), "비보안 컨텍스트 금지 API")
        // 게스트는 UTF-8 바이트로 잘라 보낸다(L-3). 상한은 서버 상수와 같은 값이 페이지에 박힌다.
        assertTrue(body.contains("new TextEncoder()"))
        assertTrue(body.contains("var UPLOAD_MAX = $GUEST_UPLOAD_MAX_BYTES;"))
        assertFalse(body.contains("{{"), "치환되지 않은 자리표시자")
        assertFalse(body.contains("slice(-60000)"), "문자 수 기준 자르기 금지")
    }

    @Test
    fun `게스트 업로드 상한과 접두어를 더해도 프레임 상한 안이다(NP-09)`() {
        assertTrue(GUEST_UPLOAD_MAX_BYTES + GUEST_LOG_PREFIX.length < MAX_MESSAGE_BYTES)
    }

    @Test
    fun `health는 JSON`() = testApplication {
        application { smokeModule(env) }
        val res = client.get("/health")
        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Application.Json))
        val body = res.bodyAsText()
        assertTrue(body.startsWith("{\"status\":\"ok\""))
        assertTrue(body.contains("\"gitSha\":\"abc1234\""))
        assertTrue(body.contains("\"port\":17777"))
        assertTrue(body.contains("\"wsClients\":0"))
    }

    @Test
    fun `ws는 텍스트를 그대로 되돌려 주고 접속 수를 센다`() = testApplication {
        application { smokeModule(env) }
        val wsClient = createClient { install(WebSockets) }
        wsClient.webSocket("/smoke/ws") {
            send(Frame.Text("ping:1:1727500000000"))
            assertEquals("ping:1:1727500000000", (incoming.receive() as Frame.Text).readText())
            assertEquals(1, env.clients.get())
            send(Frame.Text("log:게스트 줄1\n게스트 줄2"))
            // 로그는 되돌려 보내지 않고 받은 UTF-8 바이트 수만 알린다(L-5).
            val bytes = "게스트 줄1\n게스트 줄2".toByteArray(Charsets.UTF_8).size
            assertEquals("$GUEST_LOG_ACK$bytes", (incoming.receive() as Frame.Text).readText())
        }
        // 세션 종료 후 finally 블록이 돌 때까지 잠깐 기다린다.
        repeat(50) { if (env.clients.get() != 0) Thread.sleep(20) }
        assertEquals(0, env.clients.get())
        assertEquals(listOf(1, 0), clientCounts.toList(), "접속 수 변화 알림(S-4)")
        // 게스트 로그는 호스트 로그와 다른 곳에 쌓인다(L-1).
        assertTrue(guestLogs.single().contains("게스트 줄2"))
        assertTrue(logs.none { it.contains("게스트 줄2") })
        assertTrue(logs.any { it.startsWith("게스트 로그 수신") })
    }

    @Test
    fun `게스트 로그 업로드는 5초에 한 번만 받는다(연결을 바꿔도)`() = testApplication {
        application { smokeModule(env) }
        val wsClient = createClient { install(WebSockets) }
        wsClient.webSocket("/smoke/ws") {
            send(Frame.Text("log:첫째"))
            assertTrue((incoming.receive() as Frame.Text).readText().startsWith(GUEST_LOG_ACK))
            send(Frame.Text("log:둘째"))
            assertEquals(GUEST_LOG_RATE_LIMITED, (incoming.receive() as Frame.Text).readText())
        }
        wsClient.webSocket("/smoke/ws") {
            send(Frame.Text("log:셋째(새 연결)"))
            assertEquals(GUEST_LOG_RATE_LIMITED, (incoming.receive() as Frame.Text).readText())
            now += GUEST_LOG_MIN_INTERVAL_MS
            send(Frame.Text("log:넷째"))
            assertTrue((incoming.receive() as Frame.Text).readText().startsWith(GUEST_LOG_ACK))
        }
        assertEquals(2, guestLogs.size)
    }

    @Test
    fun `json 문자열 이스케이프`() {
        assertEquals("\"a\\\"b\\\\c\\nd\\u0001\"", jsonString("a\"b\\c\nd\u0001"))
    }
}
