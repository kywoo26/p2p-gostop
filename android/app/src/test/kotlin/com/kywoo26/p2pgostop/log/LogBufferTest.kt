package com.kywoo26.p2pgostop.log

import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LogBufferTest {
    private val fixed = LocalDateTime.of(2026, 9, 28, 12, 34, 56, 789_000_000)

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
}
