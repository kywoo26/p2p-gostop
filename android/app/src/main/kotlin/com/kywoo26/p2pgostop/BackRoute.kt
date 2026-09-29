package com.kywoo26.p2pgostop

/** 웹이 준비되어 게임/게임에서 연 설정을 표시할 때만 Back을 넘긴다 (#10, plan §1.7). */
internal fun shouldSendWebBack(pageLoaded: Boolean, bridgeReady: Boolean, gameActive: Boolean): Boolean =
    pageLoaded && bridgeReady && gameActive
