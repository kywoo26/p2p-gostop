package com.kywoo26.p2pgostop.server

import io.ktor.client.plugins.websocket.DefaultClientWebSocketSession
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocketSession
import io.ktor.server.testing.testApplication
import io.ktor.websocket.Frame
import io.ktor.websocket.close
import io.ktor.websocket.readText
import java.io.File
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.withTimeoutOrNull
import org.json.JSONArray
import org.json.JSONObject
import org.junit.Test
import org.junit.runner.RunWith
import org.junit.runners.Parameterized
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Node와 Android가 저장소의 같은 RELAY-01..09 벡터를 실행한다.
 * Gradle 작업 디렉터리(android 또는 android/app)에서 상위로 올라가 저장소 경로를 찾는다.
 * 복사본을 테스트 리소스에 두지 않아 벡터 수정이 양쪽 테스트에 바로 반영된다.
 */
@RunWith(Parameterized::class)
class RelayScenarioTest(private val id: String, private val scenario: JSONObject) {
    companion object {
        @JvmStatic
        @Parameterized.Parameters(name = "{0}")
        fun scenarios(): Collection<Array<Any>> {
            val path = "packages/relay-dev/test/relay-scenarios.json"
            val cwd = System.getProperty("user.dir") ?: error("Gradle 작업 디렉터리 없음")
            val file = generateSequence(File(cwd).absoluteFile) { it.parentFile }
                .map { File(it, path) }.firstOrNull { it.isFile }
                ?: error("공유 중계 벡터를 찾지 못함: $path")
            val cases = JSONArray(file.readText())
            return (0 until cases.length()).map { index ->
                val scenario = cases.getJSONObject(index)
                arrayOf(scenario.getString("id"), scenario)
            }
        }
    }

    @Test fun `공유 중계 시나리오`() = testApplication {
        val remote = scenario.optString("remote", "127.0.0.1")
        application {
            smokeModule(ServerEnv("test", "abcdef0", "2026-09-29T00:00:00Z", { emptyMap() }, {},
                remoteAddress = { remote }, lanEnabled = { true }))
        }
        val client = createClient { install(WebSockets) }
        val sessions = mutableMapOf<String, DefaultClientWebSocketSession>()
        val roles = mutableMapOf<String, String>()
        val replaced = mutableSetOf<String>()
        val steps = scenario.getJSONArray("steps")
        for (index in 0 until steps.length()) {
            val step = steps.getJSONObject(index)
            val label = "$id step ${index + 1}: $step"
            fun session(name: String) = sessions[name] ?: error("$label: 알 수 없는 소켓 $name")
            when {
                step.has("open") -> {
                    val name = step.getString("open")
                    val role = step.getString("role")
                    roles.filterValues { it == role }.keys.forEach { replaced.add(it) }
                    sessions[name] = client.webSocketSession("/ws?role=$role")
                    roles[name] = role
                    if (step.has("rejected")) {
                        assertEquals(step.getInt("rejected"),
                            withTimeout(5_000) { session(name).closeReason.await() }?.code?.toInt(), label)
                    }
                }
                step.has("expect") -> {
                    val frame = withTimeout(5_000) { session(step.getString("expect")).incoming.receive() }
                    assertEquals(step.getString("text"), (frame as Frame.Text).readText(), label)
                }
                step.has("send") -> {
                    val name = step.getString("send")
                    // ws(Node)의 닫힌 이전 소켓 send는 no-op이다. Ktor 클라이언트는 예외를 던지므로 건너뛴다.
                    if (name !in replaced) session(name).send(Frame.Text(step.getString("text")))
                }
                step.has("sendBinary") -> session(step.getString("sendBinary"))
                    .send(Frame.Binary(true, byteArrayOf(1, 2, 3)))
                step.has("sendBytes") -> session(step.getString("sendBytes"))
                    .send(Frame.Text("x".repeat(step.getInt("bytes"))))
                step.has("expectBytes") -> {
                    val frame = withTimeout(5_000) { session(step.getString("expectBytes")).incoming.receive() }
                    assertEquals(step.getInt("bytes"), (frame as Frame.Text).readText().toByteArray().size, label)
                }
                step.has("silence") -> assertNull(
                    withTimeoutOrNull(250) { session(step.getString("silence")).incoming.receive() }, label)
                step.has("closed") -> {
                    val reason = withTimeout(5_000) { session(step.getString("closed")).closeReason.await() }
                    assertEquals(step.getInt("code"), reason?.code?.toInt(), label)
                    if (step.has("reason")) assertEquals(step.getString("reason"), reason?.message, label)
                }
                step.has("close") -> {
                    val socket = session(step.getString("close"))
                    socket.close()
                    withTimeout(5_000) { socket.closeReason.await() }
                }
                else -> error("$label: 지원하지 않는 단계")
            }
        }
        assertTrue(id.matches(Regex("RELAY-0[1-9]")), id)
        sessions.values.forEach { it.close() }
    }
}
