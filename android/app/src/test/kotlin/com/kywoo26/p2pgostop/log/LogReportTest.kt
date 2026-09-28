package com.kywoo26.p2pgostop.log

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LogReportTest {
    private fun utf8(s: String) = s.toByteArray(Charsets.UTF_8).size
    private val header = "=== 맞고 P2P 로그 ===\n앱 0.0.2 git abc1234"
    private val diag = listOf("핫스팟 상태: RUNNING", "서비스: 실행 중")

    @Test
    fun `전체 문서는 호스트와 게스트 로그를 나눠 싣는다`() {
        val text = LogReport.full(header, diag, listOf("h1", "h2"), listOf("G| g1"))
        assertTrue(text.contains("--- 호스트 로그 (2줄) ---\nh1\nh2\n--- 게스트 로그 (1줄) ---\nG| g1\n"))
        assertTrue(text.startsWith("=== 맞고 P2P 로그 ==="))
    }

    @Test
    fun `공유 요약은 최악의 입력에서도 바이트 상한 이하이고 최근 줄을 남긴다(L-2)`() {
        val host = List(2000) { "h$it " + "호".repeat(600) }
        val guest = List(2000) { "G| g$it " + "게".repeat(600) }
        val s = LogReport.summary(header, diag, host, guest, note = "전체는 첨부 파일")
        assertTrue(utf8(s) <= LogReport.SHARE_TEXT_MAX_BYTES, "요약 ${utf8(s)}바이트")
        assertTrue(s.contains("h1999 "), "호스트 마지막 줄")
        assertTrue(s.contains("g1999 "), "게스트 마지막 줄")
        assertTrue(s.contains("전체는 첨부 파일"))
        // UTF-16 직렬화 크기도 바인더 1MB 한도와 거리가 멀다
        assertTrue(s.length * 2 < 200 * 1024)
    }

    @Test
    fun `요약 예산이 머리말보다 작아도 상한을 지킨다`() {
        val s = LogReport.summary(header, diag, listOf("x"), emptyList(), note = "n", maxBytes = 20)
        assertTrue(utf8(s) <= 20)
    }

    @Test
    fun `tailWithin과 clipTail`() {
        assertEquals(listOf("bb", "c"), LogReport.tailWithin(listOf("aaaa", "bb", "c"), 5))
        assertEquals(emptyList(), LogReport.tailWithin(listOf("aaaa"), 3))
        val clipped = LogReport.clipTail("가".repeat(1000), 300)
        assertTrue(utf8(clipped) <= 300)
        assertTrue(clipped.startsWith("(앞부분 생략)"))
        assertEquals("짧음", LogReport.clipTail("짧음", 300))
    }
}
