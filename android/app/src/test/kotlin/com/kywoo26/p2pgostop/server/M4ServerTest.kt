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
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class M4ServerTest {
    private fun env(files: Map<String, String> = emptyMap(), remote: String = "127.0.0.1",
                    lan: () -> Boolean = { false }) = ServerEnv(
        appVersion = "0.4.0", gitSha = "abc1234", buildTime = "2026-09-28T00:00:00Z",
        deviceInfo = { emptyMap() }, log = {}, asset = { files[it]?.toByteArray() }, remoteAddress = { remote },
        lanEnabled = lan,
    )

    @Test fun `번들이 없으면 안내 페이지와 no-store`() = testApplication {
        val e = env()
        application { smokeModule(e) }
        val page = client.get("/")
        assertEquals(HttpStatusCode.OK, page.status)
        assertTrue(page.bodyAsText().contains("웹 번들이 없습니다"))
        assertTrue(page.bodyAsText().contains("/smoke"))
        assertTrue(page.headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertTrue(client.get("/health").bodyAsText().contains("\"bundlePresent\":false"))
        assertEquals(HttpStatusCode.NotFound, client.get("/assets/missing.js").status)
    }

    @Test fun `번들 파일을 MIME과 캐시 정책에 맞게 제공한다`() = testApplication {
        val e = env(mapOf(
            "index.html" to "<html><body>게임</body></html>",
            "assets/app-abcdef1234.js" to "export const x = 1;",
            "assets/custom.abcdef1234.js" to "export const y = 1;",
            "style.css" to "body{}", "card.svg" to "<svg/>",
            "manifest.json" to "{}", "about.md" to "# hello", "font.abcdef1234.woff2" to "font",
            "cards/LICENSE" to "license", "notes.txt" to "text",
        ))
        application { smokeModule(e) }
        val page = client.get("/")
        assertEquals("<html><body>게임</body></html>", page.bodyAsText())
        assertTrue(page.headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertTrue(client.get("/health").bodyAsText().contains("\"bundlePresent\":true"))
        for ((path, mime) in listOf(
            "assets/app-abcdef1234.js" to "text/javascript", "style.css" to "text/css",
            "card.svg" to "image/svg+xml", "manifest.json" to "application/json",
            "about.md" to "text/markdown", "font.abcdef1234.woff2" to "font/woff2",
            "cards/LICENSE" to "text/plain", "notes.txt" to "text/plain",
        )) assertTrue(client.get("/$path").headers[HttpHeaders.ContentType]!!.startsWith(mime), path)
        for (path in listOf("index.html", "style.css", "about.md", "cards/LICENSE")) {
            assertTrue(client.get("/$path").headers[HttpHeaders.ContentType]!!.contains("charset=utf-8"), path)
        }
        assertTrue(client.get("/assets/app-abcdef1234.js").headers[HttpHeaders.CacheControl]!!.contains("immutable"))
        assertTrue(client.get("/assets/custom.abcdef1234.js").headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertTrue(client.get("/style.css").headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        assertEquals(HttpStatusCode.NotFound, client.get("/../secret").status)
        assertFalse(page.bodyAsText().contains("https://"), "인덱스에 외부 URL 없음(NP-08)")
    }

    @Test fun `Kit 버전은 JSON no-store이고 생성 hash 자산만 immutable이다`() = testApplication {
        val version = "{\"version\":\"source-build-fixture\"}\n"
        val files = mapOf(
            "index.html" to "<html>static shell</html>",
            "_app/version.json" to version,
            "version.json" to "{\"wireVersion\":4,\"hash\":\"fixture\"}",
            "_app/immutable/entry/start.abcdefgh.js" to "export const start = true;",
            "_app/immutable/chunks/abcdefgh.js" to "export const chunk = true;",
            "_app/immutable/workers/ai.worker-abcdefgh.js" to "self.onmessage = () => {};",
            "_app/immutable/assets/0.abcdefgh.css" to "body{}",
            "_app/immutable/assets/font.abcdefgh.woff2" to "font",
            "_app/immutable/entry/plain.js" to "short-name",
            "_app/immutable/chunks/abcdefgh.js.map" to "source-map",
            ".svelte-kit/output/server/index.js" to "server-only",
        )
        application { smokeModule(env(files)) }
        val response = client.get("/_app/version.json")
        assertEquals(HttpStatusCode.OK, response.status)
        assertEquals(version, response.bodyAsText())
        assertEquals("application/json; charset=utf-8", response.headers[HttpHeaders.ContentType])
        assertTrue(response.headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        // 기존 Android의 wire 파일 서빙을 바꾸지 않는다. relay의 /version 제어 응답과도 별개다.
        assertTrue(client.get("/version.json").bodyAsText().contains("wireVersion"))
        assertTrue(client.get("/version.json").headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        for ((path, mime) in listOf(
            "_app/immutable/entry/start.abcdefgh.js" to "text/javascript",
            "_app/immutable/chunks/abcdefgh.js" to "text/javascript",
            "_app/immutable/workers/ai.worker-abcdefgh.js" to "text/javascript",
            "_app/immutable/assets/0.abcdefgh.css" to "text/css",
            "_app/immutable/assets/font.abcdefgh.woff2" to "font/woff2",
        )) {
            val asset = client.get("/$path")
            assertEquals(HttpStatusCode.OK, asset.status)
            assertEquals(files[path], asset.bodyAsText())
            assertTrue(asset.headers[HttpHeaders.ContentType]!!.startsWith(mime), path)
            assertTrue(asset.headers[HttpHeaders.CacheControl]!!.contains("immutable"), path)
        }
        assertTrue(client.get("/_app/immutable/entry/plain.js").headers[HttpHeaders.CacheControl]!!.contains("no-store"))
        for (path in listOf(
            "_app/missing.json", "_app/immutable/chunks/abcdefgh.js.map",
            ".svelte-kit/output/server/index.js", "r/v0.4.1/fixture/_app/version.json",
        )) assertEquals(HttpStatusCode.NotFound, client.get("/$path").status, path)
    }

    @Test fun `최신 소켓이 역할을 교체하고 알림과 양방향 전달 순서가 유지된다`() = testApplication {
        val e = env()
        application { smokeModule(e) }
        val c = createClient { install(WebSockets) }
        val host = c.webSocketSession("/ws?role=host")
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        host.send(Frame.Text("first"))
        assertEquals(null, withTimeoutOrNull(100) { host.incoming.receive() }, "상대 부재는 한 번만 알린다")
        val guest = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        val original = "{ \"type\":\"ping\", \"n\":1 }"
        host.send(Frame.Text(original))
        assertEquals(original, (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        guest.send(Frame.Text("pong"))
        assertEquals("pong", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        val replacement = c.webSocketSession("/ws?role=guest")
        val replaced = withTimeout(2000) { guest.closeReason.await() }
        assertEquals(4001, replaced?.code?.toInt())
        assertEquals("replaced", replaced?.message)
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { replacement.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        assertEquals(null, withTimeoutOrNull(100) { host.incoming.receive() }, "교체된 소켓은 left를 보내지 않는다")
        replacement.send(Frame.Text("again"))
        assertEquals("again", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        assertEquals(2, e.clients.get())
        assertTrue(client.get("/health").bodyAsText().contains("\"hostConnected\":true,\"guestConnected\":true"))
        replacement.close()
        assertEquals("{\"t\":\"relay\",\"peer\":\"left\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        host.send(Frame.Text("no peer"))
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        host.close()
    }

    @Test fun `게스트가 남아 있을 때 호스트 재접속은 새 호스트가 현재 상대를 알고 이전 호스트를 교체한다`() = testApplication {
        val e = env()
        application { smokeModule(e) }
        val c = createClient { install(WebSockets) }
        val host1 = c.webSocketSession("/ws?role=host")
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { host1.incoming.receive() } as Frame.Text).readText())
        val guest = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { host1.incoming.receive() } as Frame.Text).readText())
        val host2 = c.webSocketSession("/ws?role=host")
        assertEquals(4001, withTimeout(2000) { host1.closeReason.await() }?.code?.toInt())
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { host2.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        assertEquals(null, withTimeoutOrNull(100) { guest.incoming.receive() }, "옛 호스트 종료는 left를 보내지 않는다")
        guest.send(Frame.Text("to-new-host"))
        assertEquals("to-new-host", (withTimeout(2000) { host2.incoming.receive() } as Frame.Text).readText())
        assertEquals(2, e.clients.get())
        host2.close()
        guest.close()
    }

    @Test fun `호스트가 남아 있을 때 게스트 재접속은 새 게스트가 현재 상대를 알고 이전 게스트를 교체한다`() = testApplication {
        application { smokeModule(env()) }
        val c = createClient { install(WebSockets) }
        val guest1 = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { guest1.incoming.receive() } as Frame.Text).readText())
        val host = c.webSocketSession("/ws?role=host")
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { guest1.incoming.receive() } as Frame.Text).readText())
        val guest2 = c.webSocketSession("/ws?role=guest")
        assertEquals(4001, withTimeout(2000) { guest1.closeReason.await() }?.code?.toInt())
        assertEquals("{\"t\":\"relay\",\"peer\":\"present\"}", (withTimeout(2000) { guest2.incoming.receive() } as Frame.Text).readText())
        assertEquals("{\"t\":\"relay\",\"peer\":\"joined\"}", (withTimeout(2000) { host.incoming.receive() } as Frame.Text).readText())
        assertEquals(null, withTimeoutOrNull(100) { host.incoming.receive() })
        host.send(Frame.Text("to-new-guest"))
        assertEquals("to-new-guest", (withTimeout(2000) { guest2.incoming.receive() } as Frame.Text).readText())
        guest2.close()
        host.close()
    }

    @Test fun `원격 호스트 역할은 1008로 거절하고 게스트는 연결된다`() = testApplication {
        application { smokeModule(env(remote = "192.168.1.2", lan = { true })) }
        val c = createClient { install(WebSockets) }
        val host = c.webSocketSession("/ws?role=host")
        assertEquals(1008, withTimeout(2000) { host.closeReason.await() }?.code?.toInt())
        val guest = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        guest.close()
    }

    @Test fun `LAN 게이트는 같은 서버에서 원격 HTTP와 WS를 막았다가 명시적으로 허용한다`() = testApplication {
        val enabled = AtomicBoolean(false)
        application { smokeModule(env(remote = "192.168.1.2", lan = enabled::get)) }
        assertEquals(HttpStatusCode.Forbidden, client.get("/").status)
        assertEquals(HttpStatusCode.Forbidden, client.get("/health").status)
        assertEquals(HttpStatusCode.Forbidden, client.get("/smoke").status)
        assertEquals(HttpStatusCode.Forbidden, client.get("/cards/LICENSE").status)
        val c = createClient { install(WebSockets) }
        val denied = c.webSocketSession("/ws?role=guest")
        assertEquals(1008, withTimeout(2000) { denied.closeReason.await() }?.code?.toInt())
        assertEquals("lan-disabled", denied.closeReason.await()?.message)
        val deniedSmoke = c.webSocketSession("/smoke/ws")
        assertEquals(1008, withTimeout(2000) { deniedSmoke.closeReason.await() }?.code?.toInt())
        enabled.set(true)
        assertEquals(HttpStatusCode.OK, client.get("/").status)
        assertTrue(client.get("/health").bodyAsText().contains("\"lanEnabled\":true"))
        val guest = c.webSocketSession("/ws?role=guest")
        assertEquals("{\"t\":\"relay\",\"peer\":\"absent\"}", (withTimeout(2000) { guest.incoming.receive() } as Frame.Text).readText())
        guest.close()
        enabled.set(false)
        assertEquals(HttpStatusCode.Forbidden, client.get("/").status)
    }

    @Test fun `릴레이는 바이너리를 1003으로 닫는다`() = testApplication {
        application { smokeModule(env()) }
        val c = createClient { install(WebSockets) }
        val guest = c.webSocketSession("/ws?role=guest")
        guest.send(Frame.Binary(true, byteArrayOf(1, 2, 3)))
        assertEquals(1003, withTimeout(2000) { guest.closeReason.await() }?.code?.toInt())
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
