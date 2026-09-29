package com.kywoo26.p2pgostop

import androidx.activity.OnBackPressedCallback
import androidx.activity.OnBackPressedDispatcher
import org.json.JSONObject

/** 웹이 준비되어 게임/게임에서 연 설정을 표시할 때만 Back을 넘긴다 (#10, plan §1.7). */
internal fun shouldSendWebBack(pageLoaded: Boolean, bridgeReady: Boolean, gameActive: Boolean): Boolean =
    pageLoaded && bridgeReady && gameActive

/** 실제 Activity와 JVM 테스트가 같은 등록·전송 경로를 사용한다. Activity 종료 때 remove()한다. */
internal fun registerGameBack(
    dispatcher: OnBackPressedDispatcher,
    pageLoaded: () -> Boolean,
    bridgeReady: () -> Boolean,
    gameActive: () -> Boolean,
    sendWeb: (JSONObject) -> Unit,
    confirmNativeExit: () -> Unit,
): OnBackPressedCallback {
    val callback = object : OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (shouldSendWebBack(pageLoaded(), bridgeReady(), gameActive())) {
                sendWeb(JSONObject().put("type", "back"))
            } else {
                confirmNativeExit()
            }
        }
    }
    dispatcher.addCallback(callback)
    return callback
}
