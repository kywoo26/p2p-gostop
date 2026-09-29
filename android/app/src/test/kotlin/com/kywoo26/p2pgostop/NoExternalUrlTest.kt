package com.kywoo26.p2pgostop

import java.io.File
import kotlin.test.Test
import kotlin.test.assertTrue

/**
 * spec NP-08 (b)·NP-RP-01: 앱 소스에 외부 호스트로 가는 HTTP/WS 리터럴이 없음을 보장한다.
 * 허용 목록: XML 네임스페이스, 주석·문서 링크, 자기 주소를 조립하는 `http://$ip`/`ws://` 형태.
 */
class NoExternalUrlTest {
    private val url = Regex("""(?:https?|wss?)://[^\s"'`<>()]*""")
    private val allowedPrefixes = listOf(
        "http://schemas.android.com/", // XML 네임스페이스
        "http://\$", // 자기 IP로 조립: "http://$ip:$port/", "http://${s.ip}"
        "http://127.0.0.1", // 호스트 WebView origin(주석)
    )
    private val allowedFragments = setOf("ws://") // SmokePage: location.host를 뒤에 붙이는 로컬 smoke WS

    private fun isComment(line: String): Boolean {
        val t = line.trim()
        return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("<!--")
    }

    @Test
    fun `src main에 외부 URL 리터럴이 없다`() {
        val root = listOf(File("src/main"), File("app/src/main")).first { it.isDirectory }
        // assets/web(웹 번들)은 packages/web의 check-bundle 게이트가 별도로 검사한다(허용 목록: 저작자 표기 URL 등).
        val webAssets = File(root, "assets/web")
        val files = root.walkTopDown()
            .onEnter { dir -> dir.canonicalFile != webAssets.canonicalFile }
            .filter { it.isFile && it.extension in setOf("kt", "xml", "java", "html", "js") }
            .toList()
        assertTrue(files.size > 5, "소스를 찾지 못함: ${root.absolutePath}")
        val offenders = files.flatMap { f ->
            f.readLines().withIndex()
                .filter { (_, line) -> !isComment(line) }
                .flatMap { (i, line) ->
                    url.findAll(line).map { it.value }
                        .filter { u -> u !in allowedFragments && allowedPrefixes.none { u.startsWith(it) } }
                        .map { "${f.path}:${i + 1}: $it" }
                }
        }
        assertTrue(offenders.isEmpty(), "외부 URL(NP-08):\n" + offenders.joinToString("\n"))
    }
}
