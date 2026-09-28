package com.kywoo26.p2pgostop

import com.kywoo26.p2pgostop.log.LogBuffer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BridgeLogsTest {
    @Test fun `게스트 업로드는 게스트 버퍼 상한을 지키며 호스트 이력을 밀어내지 않는다`() {
        val host = mutableListOf<String>()
        val guest = LogBuffer(capacity = 2000, maxTotalBytes = 256 * 1024, linePrefix = "G| ")
        BridgeLogs.append("host", "호스트 연결", host::add, guest)
        repeat(500) { BridgeLogs.append("guest", "게스트 ${"x".repeat(4000)}", host::add, guest) }
        assertEquals(listOf("web: 호스트 연결"), host)
        assertTrue(guest.bytes() <= 256 * 1024)
        assertTrue(guest.snapshot().all { it.contains("G| ") })
    }
}
