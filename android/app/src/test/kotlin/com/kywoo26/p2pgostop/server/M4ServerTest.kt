package com.kywoo26.p2pgostop.server

import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsText
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class M4ServerTest {
    private fun env(files: Map<String, String> = emptyMap()) = ServerEnv(
        appVersion = "0.4.0", gitSha = "abc1234", buildTime = "2026-09-28T00:00:00Z",
        deviceInfo = { emptyMap() }, log = {}, asset = { files[it]?.toByteArray() },
    )

    @Test fun `번들이 없으면 안내 페이지와 no-store`() = testApplication {
        val e = env()
        application { smokeModule(e) }
        val page = client.get("/")
        assertEquals(HttpStatusCode.OK, page.status)
        assertTrue(page.bodyAsText().contains("web bundle is missing"))
        assertTrue(page.headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertTrue(client.get("/health").bodyAsText().contains("\"bundlePresent\":false"))
        assertEquals(HttpStatusCode.NotFound, client.get("/assets/missing.js").status)
    }

    @Test fun `번들 파일을 MIME과 캐시 정책에 맞게 제공한다`() = testApplication {
        val e = env(mapOf(
            "index.html" to "<html><body>게임</body></html>",
            "assets/app.abcdef1234.js" to "export const x = 1;",
            "style.css" to "body{}", "card.svg" to "<svg/>",
            "manifest.json" to "{}", "about.md" to "# hello", "font.abcdef1234.woff2" to "font",
        ))
        application { smokeModule(e) }
        val page = client.get("/")
        assertEquals("<html><body>게임</body></html>", page.bodyAsText())
        assertTrue(page.headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertTrue(client.get("/health").bodyAsText().contains("\"bundlePresent\":true"))
        for ((path, mime) in listOf(
            "assets/app.abcdef1234.js" to "text/javascript", "style.css" to "text/css",
            "card.svg" to "image/svg+xml", "manifest.json" to "application/json",
            "about.md" to "text/markdown", "font.abcdef1234.woff2" to "font/woff2",
        )) assertTrue(client.get("/$path").headers[HttpHeaders.ContentType]!!.startsWith(mime), path)
        assertTrue(client.get("/assets/app.abcdef1234.js").headers[HttpHeaders.CacheControl]!!.contains("immutable"))
        assertTrue(client.get("/style.css").headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertEquals(HttpStatusCode.NotFound, client.get("/../secret").status)
        assertFalse(page.bodyAsText().contains("https://"), "인덱스에 외부 URL 없음(NP-08)")
    }

    @Test fun `한 역할만 연결되고 양방향 메시지는 원문 그대로 전달된다`() = testApplication {
        val e = env()
        application { smokeModule(e) }
        val c = createClient { install(WebSockets) }
        val host = c.webSocketSession("/ws?role=host")
        assertEquals("{\"type\":\"relay\",\"peer\":\"absent\"}", run {
            host.send(Frame.Text("first"))
            (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText()
        })
        host.send(Frame.Text("second"))
        assertEquals(null, withTimeoutOrNull(100) { host.incoming.receive() }, "상대 부재는 한 번만 알린다")
        val guest = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"type\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        val original = "{ \"type\":\"ping\", \"n\":1 }"
        host.send(Frame.Text(original))
        assertEquals(original, (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        guest.send(Frame.Text("pong"))
        assertEquals("pong", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        val duplicate = c.webSocketSession("/ws?role=guest")
        val rejected = withTimeout(2000) { duplicate.closeReason.await() }
        assertEquals(4409, rejected?.code?.toInt())
        assertEquals("{\"error\":\"role occupied\"}", rejected?.message)
        assertEquals(2, e.clients.get())
        assertTrue(client.get("/health").bodyAsText().contains("\"hostConnected\":true,\"guestConnected\":true"))
        guest.close()
        assertEquals("{\"type\":\"relay\",\"peer\":\"left\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        host.close()
    }

    @Test fun `스모크 에코는 별도 경로에서 유지된다`() = testApplication {
        application { smokeModule(env()) }
        val c = createClient { install(WebSockets) }
        val smoke = c.webSocketSession("/smoke/ws")
        smoke.send(Frame.Text("ping:1:123"))
        assertEquals("ping:1:123", (withTimeout(2000) { smoke.incoming.receive() } as Frame.Text).readText())
        smoke.close()
    }

    @Test fun `64KB 초과 프레임은 1009로 닫는다`() = testApplication {
        application { smokeModule(env()) }
        val c = createClient { install(WebSockets) }
        val host = c.webSocketSession("/ws?role=host")
        host.send(Frame.Text("x".repeat(MAX_MESSAGE_BYTES + 1)))
        assertEquals(1009, withTimeout(3000) { host.closeReason.await() }?.code?.toInt())
    }
}
