package com.kywoo26.p2pgostop.share

import java.time.LocalDateTime
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class LogShareFilesTest {
    @Test
    fun `파일 이름 규칙과 경로 조작 거부`() {
        val name = LogShareFiles.name("abc1234", LocalDateTime.of(2026, 9, 28, 1, 2, 3))
        assertEquals("p2p-gostop-log-abc1234-20260928-010203.txt", name)
        assertTrue(LogShareFiles.isValidName(name))
        assertTrue(LogShareFiles.isValidName(LogShareFiles.name("../../evil", LocalDateTime.of(2026, 1, 1, 0, 0))))
        for (bad in listOf("../x.txt", "a/b.txt", "..txt", ".hidden.txt", "x.jks", "", "x.txt/..", "가.txt")) {
            assertFalse(LogShareFiles.isValidName(bad), bad)
        }
    }
}
