package com.kywoo26.p2pgostop

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class HotspotModelTest {
    private fun state(status: HotspotStatus, running: Boolean = true, ip: String? = null, clients: Int = 0) =
        HotspotState(status = status, serviceRunning = running, ip = ip, wsClients = clients,
            lanEnabled = status == HotspotStatus.RUNNING || status == HotspotStatus.ADDRESS_ONLY)

    @Test
    fun `S-2 토글은 서비스 생존 기준 - FAILED·STOPPED·주소만 표시에서도 멈출 수 있다`() {
        assertEquals(ToggleAction.START, toggleAction(state(HotspotStatus.IDLE, running = false)))
        assertEquals(ToggleAction.STOP_HOTSPOT, toggleAction(state(HotspotStatus.STARTING)))
        assertEquals(ToggleAction.STOP_HOTSPOT, toggleAction(state(HotspotStatus.RUNNING)))
        assertEquals(ToggleAction.STOP_FALLBACK, toggleAction(state(HotspotStatus.FAILED)))
        assertEquals(ToggleAction.STOP_FALLBACK, toggleAction(state(HotspotStatus.STOPPED)))
        assertEquals(ToggleAction.STOP_FALLBACK, toggleAction(state(HotspotStatus.ADDRESS_ONLY)))
        // 서비스가 끝났으면 상태 값과 무관하게 시작
        assertEquals(ToggleAction.START, toggleAction(state(HotspotStatus.FAILED, running = false)))
    }

    @Test
    fun `화면 켜짐은 서비스나 서버가 살아 있는 동안`() {
        assertTrue(state(HotspotStatus.FAILED).keepScreenOn)
        assertFalse(state(HotspotStatus.IDLE, running = false).keepScreenOn)
        assertTrue(HotspotState(serverRunning = true).keepScreenOn) // 정지 처리 중 서버가 아직 내려가는 중
    }

    @Test
    fun `S-2 S-4 알림 내용은 상태·IP·접속 수가 바뀌면 달라진다`() {
        val starting = notifContent(state(HotspotStatus.STARTING))
        assertEquals(HotspotStatus.STARTING, starting.status)
        assertNull(starting.url)
        val running = notifContent(state(HotspotStatus.RUNNING, ip = "10.88.0.1"))
        assertEquals("http://10.88.0.1:17777/", running.url)
        assertEquals(ToggleAction.STOP_HOTSPOT, running.action)
        val oneClient = notifContent(state(HotspotStatus.RUNNING, ip = "10.88.0.1", clients = 1))
        assertEquals(1, oneClient.clients)
        assertTrue(running != oneClient)
        val failed = notifContent(state(HotspotStatus.FAILED, ip = "192.168.0.23"))
        assertEquals(HotspotStatus.FAILED, failed.status)
        assertNull(failed.url)
        assertEquals(ToggleAction.STOP_FALLBACK, failed.action)
        assertEquals(HotspotStatus.STOPPED, notifContent(state(HotspotStatus.STOPPED)).status)
    }

    @Test
    fun `S-5 IP 감시 간격 - 못 찾으면 300ms 10번 뒤 3초, 찾으면 3초 10번 뒤 30초`() {
        assertEquals(300, IpWatchSchedule.delayMs(found = false, fastTriesUsed = 0, unchangedChecks = 0))
        assertEquals(300, IpWatchSchedule.delayMs(found = false, fastTriesUsed = 9, unchangedChecks = 0))
        assertEquals(3_000, IpWatchSchedule.delayMs(found = false, fastTriesUsed = 10, unchangedChecks = 50))
        assertEquals(3_000, IpWatchSchedule.delayMs(found = true, fastTriesUsed = 0, unchangedChecks = 0))
        assertEquals(3_000, IpWatchSchedule.delayMs(found = true, fastTriesUsed = 3, unchangedChecks = 9))
        assertEquals(30_000, IpWatchSchedule.delayMs(found = true, fastTriesUsed = 3, unchangedChecks = 10))
    }
}
