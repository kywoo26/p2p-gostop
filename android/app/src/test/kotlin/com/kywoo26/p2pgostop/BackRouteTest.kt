package com.kywoo26.p2pgostop

import androidx.activity.OnBackPressedDispatcher
import org.json.JSONObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class BackRouteTest {
    @Test fun gameAndMenuUseWebBack() {
        assertTrue(shouldSendWebBack(pageLoaded = true, bridgeReady = true, gameActive = true))
    }

    @Test fun homeAndUnreadyBridgeKeepNativeConfirmation() {
        assertFalse(shouldSendWebBack(pageLoaded = true, bridgeReady = true, gameActive = false))
        assertFalse(shouldSendWebBack(pageLoaded = true, bridgeReady = false, gameActive = true))
        assertFalse(shouldSendWebBack(pageLoaded = false, bridgeReady = true, gameActive = true))
    }

    @Test fun dispatcherSendsIdlessBackOnlyWhenWebReady() {
        var loaded = true
        var bridge = true
        var active = true
        var nativeConfirmations = 0
        val webMessages = mutableListOf<JSONObject>()
        val dispatcher = OnBackPressedDispatcher()
        val callback = registerGameBack(
            dispatcher,
            pageLoaded = { loaded },
            bridgeReady = { bridge },
            gameActive = { active },
            sendWeb = { webMessages.add(it) },
            confirmNativeExit = { nativeConfirmations++ },
        )
        assertTrue(dispatcher.hasEnabledCallbacks())

        dispatcher.onBackPressed()
        assertEquals(1, webMessages.size)
        assertEquals("back", webMessages.single().getString("type"))
        assertFalse(webMessages.single().has("id"))
        assertEquals(0, nativeConfirmations)

        active = false
        dispatcher.onBackPressed()
        bridge = false
        active = true
        dispatcher.onBackPressed()
        bridge = true
        loaded = false
        dispatcher.onBackPressed()
        assertEquals(3, nativeConfirmations)
        assertEquals(1, webMessages.size)

        callback.remove()
        assertFalse(dispatcher.hasEnabledCallbacks())
    }
}
