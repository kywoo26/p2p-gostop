package com.kywoo26.p2pgostop

import kotlin.test.Test
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
}
