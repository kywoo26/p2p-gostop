package com.kywoo26.p2pgostop

import kotlin.test.Test
import kotlin.test.assertEquals

class RemoteModePolicyTest {
    @Test
    fun `원격 진입과 복귀에서 startHotspot 0회`() {
        var starts = 0
        // 앱 시작, LAN 서비스가 이미 실행 중인 경우, 원격 복귀·재시도.
        for (running in listOf(false, true, true, false)) {
            val action = gameServerAction(remoteMode = true, serviceRunning = running, serviceRemote = false)
            assertEquals(HotspotService.ACTION_REMOTE_SERVER_ONLY, action)
            startHotspotForAction(action, remoteMode = true) { starts++ }
        }
        // 잘못 도착한 옛 LAN 시작 명령도 원격 중에는 무시한다.
        startHotspotForAction(HotspotService.ACTION_START, remoteMode = true) { starts++ }
        assertEquals(0, starts)
        startHotspotForAction(HotspotService.ACTION_START, remoteMode = false) { starts++ }
        assertEquals(1, starts)
        assertEquals(null, gameServerAction(true, true, true))
        assertEquals("127.0.0.1", bindHostForMode(true))
    }

    @Test
    fun `기본 앱 시작은 서버 전용이고 실행 중에는 중복 시작하지 않는다`() {
        assertEquals(HotspotService.ACTION_SERVER_ONLY, gameServerAction(false, false, false))
        assertEquals(null, gameServerAction(false, true, false))
        assertEquals("0.0.0.0", bindHostForMode(false))
    }
}
