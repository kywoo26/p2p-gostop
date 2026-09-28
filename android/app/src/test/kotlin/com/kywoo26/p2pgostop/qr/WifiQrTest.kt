package com.kywoo26.p2pgostop.qr

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse

class WifiQrTest {
    @Test
    fun `LOHS 자격 증명은 그대로, 항상 T WPA`() {
        assertEquals(
            "WIFI:T:WPA;S:AndroidShare_1234;P:k7m2x9qa4bcd5ef;;",
            WifiQr.build("AndroidShare_1234", "k7m2x9qa4bcd5ef"),
        )
    }

    @Test
    fun `SAE나 WPA3 표기를 쓰지 않는다`() {
        val s = WifiQr.build("net", "password1")
        assertFalse(s.contains("SAE"))
        assertFalse(s.contains("WPA3"))
    }

    @Test
    fun `특수문자는 백슬래시로 이스케이프`() {
        assertEquals(
            """WIFI:T:WPA;S:My\;Net\,\:\"x\\;P:p\;a\:s\,s\"\\;;""",
            WifiQr.build("""My;Net,:"x\""", """p;a:s,s"\"""),
        )
    }

    @Test
    fun `한글 SSID는 이스케이프 없이 유지`() {
        assertEquals("WIFI:T:WPA;S:맞고 핫스팟;P:12345678;;", WifiQr.build("맞고 핫스팟", "12345678"))
    }

    @Test
    fun `비밀번호가 없으면 개방 네트워크`() {
        assertEquals("WIFI:T:nopass;S:open;;", WifiQr.build("open", null))
        assertEquals("WIFI:T:nopass;S:open;;", WifiQr.build("open", ""))
    }

    @Test
    fun `URL 형식`() {
        assertEquals("http://192.168.47.1:17777/", WifiQr.url("192.168.47.1", 17777))
    }
}
