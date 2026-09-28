package com.kywoo26.p2pgostop

import com.kywoo26.p2pgostop.log.LogBuffer
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class BridgeLogsTest {
    @Test fun `게스트 업로드는 게스트 버퍼 상한을 지키며 호스트 이력을 밀어내지 않는다`() {
        val host = LogBuffer(capacity = 2000, maxTotalBytes = 256 * 1024, linePrefix = "W| ")
        val guest = LogBuffer(capacity = 2000, maxTotalBytes = 256 * 1024, linePrefix = "G| ")
        BridgeLogs.append("host", "호스트 연결", host, guest)
        repeat(500) { BridgeLogs.append("guest", "게스트 ${"x".repeat(4000)}", host, guest) }
        assertEquals(1, host.size())
        assertTrue(host.snapshot().single().contains("호스트 연결"))
        assertTrue(guest.bytes() <= 256 * 1024)
        assertTrue(guest.snapshot().all { it.contains("G| ") })
    }

    @Test fun `웹 호스트 대량 로그도 네이티브 로그를 밀어내지 않는다`() {
        val native = LogBuffer()
        val host = LogBuffer(maxTotalBytes = 256 * 1024, linePrefix = "W| ")
        val guest = LogBuffer(maxTotalBytes = 256 * 1024, linePrefix = "G| ")
        native.add("핫스팟 시작")
        repeat(500) { BridgeLogs.append("host", "x".repeat(4000), host, guest) }
        assertEquals(1, native.size())
        assertTrue(host.bytes() <= 256 * 1024)
    }
}
