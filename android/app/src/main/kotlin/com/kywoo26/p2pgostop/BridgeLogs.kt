package com.kywoo26.p2pgostop

import com.kywoo26.p2pgostop.log.LogBuffer

/** 브리지의 웹 호스트·게스트 로그를 네이티브 진단 이력과 분리한다(NP-09). */
object BridgeLogs {
    fun append(role: String, line: String, hostLog: LogBuffer, guestLog: LogBuffer) {
        if (role == "guest") guestLog.add(line) else hostLog.add(line)
    }
}
