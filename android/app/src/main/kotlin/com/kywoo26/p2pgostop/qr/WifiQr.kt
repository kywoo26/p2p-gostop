package com.kywoo26.p2pgostop.qr

/**
 * Wi-Fi 접속 QR 문자열 (spec FR-03, tech-stack 2.1).
 *
 * - 보안 유형은 항상 `T:WPA`. WPA3 전환 모드도 규격상 `T:WPA`이며 `T:SAE`/`T:WPA3`는 iOS가 인식하지 못한다.
 * - 이스케이프는 ZXing 관례(백슬래시로 `\ ; , " :`)를 따른다. LOHS 자격 증명에는 특수문자가 없지만 시스템 핫스팟 이름에는 있을 수 있다.
 * - 비밀번호가 없으면 개방 네트워크(`T:nopass`)로 표기한다.
 */
object WifiQr {
    private val special = setOf('\\', ';', ',', '"', ':')

    fun escape(value: String): String = buildString(value.length + 8) {
        for (c in value) {
            if (c in special) append('\\')
            append(c)
        }
    }

    fun build(ssid: String, password: String?): String =
        if (password.isNullOrEmpty()) {
            "WIFI:T:nopass;S:${escape(ssid)};;"
        } else {
            "WIFI:T:WPA;S:${escape(ssid)};P:${escape(password)};;"
        }

    fun url(ip: String, port: Int): String = "http://$ip:$port/"
}
