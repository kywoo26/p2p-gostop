package com.kywoo26.p2pgostop

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

/** 실제 Activity/Service 콜백이 호출하는 라우터에 가짜 부수효과 포트를 주입한다. */
class RemoteModePolicyTest {
    private class EntryProbe : MainEntryEffects {
        val starts = mutableListOf<Pair<String, Boolean>>()
        val launches = mutableListOf<Boolean>()
        var stops = 0
        var permissions = 0
        var lanOpens = 0
        override fun startServer(action: String, foreground: Boolean) { starts += action to foreground }
        override fun launchGame(remote: Boolean) { launches += remote }
        override fun stopRemoteServer() { stops++ }
        override fun requestHotspotPermission() { permissions++ }
        override fun setLanEnabled(enabled: Boolean) { if (enabled) lanOpens++ }
    }

    private class ServiceProbe : ServiceEffects {
        var hotspotStarts = 0
        var lanOpens = 0
        var lanCloses = 0
        var localForegroundStarts = 0
        var visibleRemoteStarts = 0
        var serverStarts = 0
        var hotspotCancels = 0
        var remote = false
        override fun stop() = Unit
        override fun cancelHotspot() { hotspotCancels++ }
        override fun closeLan() { lanCloses++ }
        override fun switchMode(remote: Boolean) { this.remote = remote }
        override fun startLocalForeground() { localForegroundStarts++ }
        override fun startVisibleRemoteServer() { visibleRemoteStarts++ }
        override fun ensureServer() { serverStarts++ }
        override fun openLocalLan(action: String) { if (action == HotspotService.ACTION_ADDRESS_ONLY) lanOpens++ }
        override fun startHotspot() { hotspotStarts++ }
    }

    @Test
    fun `원격 Activity 진입 복귀 권한 콜백과 재시도는 LAN 부수효과를 내지 않는다`() {
        val mainEffects = EntryProbe()
        val main = MainEntry(remote = true, effects = mainEffects)
        main.launchGame() // MainActivity.render/게임 버튼의 실제 진입 포트
        assertFalse(main.startHotspot(HotspotService.ACTION_START)) // 토글과 이전 권한 콜백
        assertFalse(main.startHotspot(HotspotService.ACTION_ADDRESS_ONLY))
        assertFalse(main.requestHotspotPermission()) // 권한 버튼과 대화상자 확인

        val gameEffects = EntryProbe()
        val game = GameEntry(remote = true, effects = gameEffects)
        assertEquals(HotspotService.ACTION_REMOTE_SERVER_ONLY, game.onStart(false))
        game.onStop()
        assertEquals(HotspotService.ACTION_REMOTE_SERVER_ONLY, game.onStart(true)) // 이전 LAN 상태
        game.onStop()
        assertEquals(HotspotService.ACTION_REMOTE_SERVER_ONLY, game.onStart(true)) // 원격 화면 복귀
        assertFalse(game.startHotspot()) // WebView bridge, 권한 콜백, 설정 복귀
        assertFalse(game.requestHotspotPermission())
        assertFalse(game.setLanEnabled(true))
        assertFalse(game.startAddressOnly())

        assertTrue(mainEffects.starts.isEmpty())
        assertEquals(listOf(true), mainEffects.launches)
        assertEquals(0, mainEffects.permissions)
        assertEquals(0, mainEffects.lanOpens)
        assertEquals(0, gameEffects.permissions)
        assertEquals(0, gameEffects.lanOpens)
        assertEquals(2, gameEffects.stops)
        assertEquals(List(3) { HotspotService.ACTION_REMOTE_SERVER_ONLY to false }, gameEffects.starts)
    }

    @Test
    fun `원격 서비스 전환은 이전 LAN을 닫고 오래된 ACTION_START를 무시한다`() {
        val effects = ServiceProbe()
        val commands = HotspotCommands(effects)
        commands.dispatch(HotspotService.ACTION_ADDRESS_ONLY) // 이전 LAN 서비스
        assertEquals(1, effects.lanOpens)
        val priorForeground = effects.localForegroundStarts
        commands.dispatch(HotspotService.ACTION_REMOTE_SERVER_ONLY)
        commands.dispatch(HotspotService.ACTION_START) // 큐에 남은 LAN 시작 명령
        commands.dispatch(HotspotService.ACTION_ADDRESS_ONLY)
        commands.dispatch(HotspotService.ACTION_SERVER_ONLY)
        commands.dispatch(HotspotService.ACTION_REMOTE_SERVER_ONLY) // 원격 재시도
        assertEquals(0, effects.hotspotStarts)
        assertEquals(1, effects.lanOpens)
        assertEquals(2, effects.lanCloses)
        assertEquals(3, effects.hotspotCancels) // 이전 ADDRESS_ONLY 1회 + 원격 2회
        assertEquals(priorForeground, effects.localForegroundStarts)
        assertEquals(2, effects.visibleRemoteStarts)
        assertEquals(3, effects.serverStarts)
        assertTrue(effects.remote)
        assertEquals("127.0.0.1", bindHostForMode(effects.remote))
    }

    @Test
    fun `로컬 시작은 여전히 권한과 LOHS 경로를 사용한다`() {
        val entryEffects = EntryProbe()
        val game = GameEntry(remote = false, effects = entryEffects)
        assertEquals(HotspotService.ACTION_SERVER_ONLY, game.onStart(false))
        assertTrue(game.requestHotspotPermission())
        assertTrue(game.startHotspot())
        assertTrue(game.setLanEnabled(true))
        assertEquals(1, entryEffects.permissions)
        assertEquals(1, entryEffects.lanOpens)
        assertEquals(HotspotService.ACTION_START to true, entryEffects.starts.last())

        val serviceEffects = ServiceProbe()
        HotspotCommands(serviceEffects).dispatch(HotspotService.ACTION_START)
        assertEquals(1, serviceEffects.hotspotStarts)
        assertEquals(1, serviceEffects.localForegroundStarts)
    }
}
