package com.kywoo26.p2pgostop

import com.kywoo26.p2pgostop.log.LogBuffer

/** 브리지의 게스트 로그를 호스트 진단 이력과 분리한다(NP-09). */
object BridgeLogs {
    fun append(role: String, line: String, hostLog: (String) -> Unit, guestLog: LogBuffer) {
        if (role == "guest") guestLog.add(line) else hostLog("web: $line")
    }
}
