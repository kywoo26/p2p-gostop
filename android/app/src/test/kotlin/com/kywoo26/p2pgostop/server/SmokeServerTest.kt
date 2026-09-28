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
    private val env = ServerEnv(
        appVersion = "0.0.1-test",
        gitSha = "abc1234",
        buildTime = "2026-09-28T00:00:00Z",
        deviceInfo = { mapOf("호스트 기기" to "samsung <SM-S938N>") },
        log = { logs.add(it) },
    )

    @Test
    fun `루트 페이지는 연결 성공과 기기 정보를 보여 준다`() = testApplication {
        application { smokeModule(env) }
        val res = client.get("/")
        assertEquals(HttpStatusCode.OK, res.status)
        assertTrue(res.contentType()!!.match(ContentType.Text.Html))
        val body = res.bodyAsText()
        assertTrue(body.contains("연결 성공"))
        assertTrue(body.contains("abc1234"))
        assertTrue(body.contains("samsung &lt;SM-S938N&gt;"), "HTML 이스케이프")
        assertTrue(body.contains("/ws"))
        assertFalse(Regex("(src|href)=\"https?://").containsMatchIn(body), "외부 리소스 금지(NP-08)")
        assertFalse(body.contains("navigator.clipboard") || body.contains("navigator.share("), "비보안 컨텍스트 금지 API")
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
        wsClient.webSocket("/ws") {
            send(Frame.Text("ping:1:1727500000000"))
            assertEquals("ping:1:1727500000000", (incoming.receive() as Frame.Text).readText())
            assertEquals(1, env.clients.get())
            send(Frame.Text("log:게스트 줄1\n게스트 줄2"))
            assertEquals("log:게스트 줄1\n게스트 줄2", (incoming.receive() as Frame.Text).readText())
        }
        // 세션 종료 후 finally 블록이 돌 때까지 잠깐 기다린다.
        repeat(50) { if (env.clients.get() != 0) Thread.sleep(20) }
        assertEquals(0, env.clients.get())
        assertTrue(logs.any { it.startsWith("[게스트 로그") && it.contains("게스트 줄2") })
    }

    @Test
    fun `json 문자열 이스케이프`() {
        assertEquals("\"a\\\"b\\\\c\\nd\\u0001\"", jsonString("a\"b\\c\nd\u0001"))
    }
}
