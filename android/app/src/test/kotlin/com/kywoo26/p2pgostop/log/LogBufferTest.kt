package com.kywoo26.p2pgostop.log

import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LogBufferTest {
    private val fixed = LocalDateTime.of(2026, 9, 28, 12, 34, 56, 789_000_000)
    private fun utf8(s: String) = s.toByteArray(Charsets.UTF_8).size

    @Test
    fun `타임스탬프가 붙고 용량을 넘으면 오래된 줄부터 버린다`() {
        val buf = LogBuffer(capacity = 3, clock = { fixed })
        (1..5).forEach { buf.add("줄$it") }
        assertEquals(listOf("09-28 12:34:56.789 줄3", "09-28 12:34:56.789 줄4", "09-28 12:34:56.789 줄5"), buf.snapshot())
    }

    @Test
    fun `여러 줄 메시지는 줄마다 저장`() {
        val buf = LogBuffer(capacity = 10, clock = { fixed })
        buf.add("a\nb")
        assertEquals(2, buf.size())
        assertEquals(listOf("09-28 12:34:56.789 b"), buf.tail(1))
    }

    @Test
    fun `기본 용량은 2000줄`() {
        val buf = LogBuffer()
        repeat(2500) { buf.add("x$it") }
        assertEquals(2000, buf.size())
        assertTrue(buf.snapshot().first().endsWith("x500"))
        assertTrue(buf.version > 0)
    }

    @Test
    fun `줄 하나는 UTF-8 2KB를 넘지 않게 잘리고 표시가 붙는다(NP-09)`() {
        val buf = LogBuffer(clock = { fixed })
        buf.add("가".repeat(64 * 1024)) // 개행 없는 64KB 업로드 흉내(192KB UTF-8)
        val line = buf.snapshot().single()
        assertTrue(utf8(line) <= LogBuffer.DEFAULT_MAX_LINE_BYTES, "줄 바이트 ${utf8(line)}")
        assertTrue(line.contains("잘림: 원래"))
    }

    @Test
    fun `총 바이트 상한을 넘으면 줄 수가 남아도 오래된 줄부터 버린다(L-1)`() {
        val buf = LogBuffer(capacity = 2000, maxLineBytes = 2048, maxTotalBytes = 16 * 1024, clock = { fixed })
        repeat(200) { buf.add("${it}:" + "한".repeat(600)) } // 줄마다 약 1.8KB
        assertTrue(buf.bytes() <= 16 * 1024, "보관 ${buf.bytes()}바이트")
        assertEquals(buf.snapshot().sumOf { utf8(it) + 1 }, buf.bytes())
        assertTrue(buf.snapshot().last().contains("199:"))
        assertTrue(buf.size() < 200)
    }

    @Test
    fun `게스트 버퍼는 줄마다 접두어를 붙여 호스트 줄로 위장하지 못한다(L-4)`() {
        val guest = LogBuffer(linePrefix = "G| ", clock = { fixed })
        guest.add("핫스팟 실패: 가짜\n둘째 줄")
        assertEquals(listOf("09-28 12:34:56.789 G| 핫스팟 실패: 가짜", "09-28 12:34:56.789 G| 둘째 줄"), guest.snapshot())
    }

    @Test
    fun `clear는 바이트도 0으로 되돌린다`() {
        val buf = LogBuffer(clock = { fixed })
        buf.add("abc")
        buf.clear()
        assertEquals(0, buf.bytes())
        assertEquals(0, buf.size())
    }
}
