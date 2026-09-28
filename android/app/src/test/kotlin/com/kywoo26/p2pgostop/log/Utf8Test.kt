package com.kywoo26.p2pgostop.log

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class Utf8Test {
    private fun real(s: String) = s.toByteArray(Charsets.UTF_8).size

    @Test
    fun `길이는 실제 UTF-8 인코딩과 같다(ASCII·한국어·이모지)`() {
        for (s in listOf("", "abc", "한국어 로그", "é ü", "😀 이모지 🇰🇷", "mixed 핫스팟 ok")) {
            assertEquals(real(s), Utf8.length(s), s)
        }
    }

    @Test
    fun `head와 tail은 바이트 상한을 지키고 글자·서로게이트 쌍을 쪼개지 않는다`() {
        val s = "가나다😀라마abc바사"
        for (max in 0..real(s) + 2) {
            val h = Utf8.head(s, max)
            val t = Utf8.tail(s, max)
            assertTrue(real(h) <= max && s.startsWith(h), "head $max")
            assertTrue(real(t) <= max && s.endsWith(t), "tail $max")
            // 잘린 결과가 온전한 문자열(짝 없는 서로게이트 없음)
            assertEquals(h, String(h.toByteArray(Charsets.UTF_8), Charsets.UTF_8))
            assertEquals(t, String(t.toByteArray(Charsets.UTF_8), Charsets.UTF_8))
        }
        assertEquals("가", Utf8.head("가나", 5)) // 3바이트 + (3바이트는 넘침)
        assertEquals("나", Utf8.tail("가나", 5))
    }
}
