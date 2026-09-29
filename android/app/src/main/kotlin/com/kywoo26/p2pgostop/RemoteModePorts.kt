package com.kywoo26.p2pgostop

/** Activity의 실제 서비스·권한·LAN 부수효과를 JVM 테스트에서 관찰하는 포트(FR-RP-08). */
internal interface EntryEffects {
    fun startServer(action: String, foreground: Boolean)
    fun stopRemoteServer()
    fun requestHotspotPermission()
    fun setLanEnabled(enabled: Boolean)
}

internal interface MainEntryEffects : EntryEffects {
    fun launchGame(remote: Boolean)
}

internal class GameEntry(private val remote: Boolean, private val effects: EntryEffects) {
    fun onStart(serviceRunning: Boolean): String? {
        val action = gameServerAction(remote, serviceRunning)
        if (action != null) effects.startServer(action, foreground = !remote)
        return action
    }

    fun onStop() {
        if (remote) effects.stopRemoteServer()
    }

    fun startHotspot(): Boolean {
        if (remote) return false
        effects.startServer(HotspotService.ACTION_START, foreground = true)
        return true
    }

    fun startAddressOnly(): Boolean {
        if (remote) return false
        effects.startServer(HotspotService.ACTION_ADDRESS_ONLY, foreground = false)
        return true
    }

    fun requestHotspotPermission(): Boolean {
        if (remote) return false
        effects.requestHotspotPermission()
        return true
    }

    fun setLanEnabled(enabled: Boolean): Boolean {
        if (remote) return false
        effects.setLanEnabled(enabled)
        return true
    }
}

internal class MainEntry(private val remote: Boolean, private val effects: MainEntryEffects) {
    fun launchGame() = effects.launchGame(remote)
    fun startHotspot(action: String): Boolean {
        if (remote) return false
        effects.startServer(action, foreground = true)
        return true
    }

    fun requestHotspotPermission(): Boolean {
        if (remote) return false
        effects.requestHotspotPermission()
        return true
    }
}

/** HotspotService.onStartCommand가 통과하는 명령 라우터. 원격 중에는 LAN 명령을 버린다. */
internal interface ServiceEffects {
    fun stop()
    fun cancelHotspot()
    fun closeLan()
    fun switchMode(remote: Boolean)
    fun startLocalForeground()
    fun startVisibleRemoteServer()
    fun ensureServer()
    fun openLocalLan(action: String)
    fun startHotspot()
}

internal class HotspotCommands(private val effects: ServiceEffects, private var remote: Boolean = false) {

    fun dispatch(action: String?) {
        when (action) {
            HotspotService.ACTION_STOP -> {
                effects.stop()
                remote = false
            }
            HotspotService.ACTION_REMOTE_SERVER_ONLY -> {
                effects.cancelHotspot()
                effects.closeLan()
                effects.switchMode(true)
                remote = true
                effects.startVisibleRemoteServer()
                effects.ensureServer()
            }
            HotspotService.ACTION_ADDRESS_ONLY, HotspotService.ACTION_SERVER_ONLY, HotspotService.ACTION_START -> {
                if (remote) return
                effects.switchMode(false)
                effects.startLocalForeground()
                if (action != HotspotService.ACTION_START) {
                    effects.cancelHotspot()
                    effects.openLocalLan(action)
                }
                effects.ensureServer()
                if (action == HotspotService.ACTION_START) effects.startHotspot()
            }
        }
    }
}
