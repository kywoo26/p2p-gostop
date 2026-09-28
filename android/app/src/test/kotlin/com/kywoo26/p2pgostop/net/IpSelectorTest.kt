package com.kywoo26.p2pgostop.net

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class IpSelectorTest {
    private fun nif(name: String, vararg ips: String, up: Boolean = true, loopback: Boolean = false) =
        NetIf(name, up, loopback, ips.toList())

    @Test
    fun `비행기 모드 삼성 LOHS - swlan0만 있으면 그 IP`() {
        val ifaces = listOf(nif("lo", "127.0.0.1", loopback = true), nif("swlan0", "192.168.47.1"))
        assertEquals("192.168.47.1", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `기존 Wi-Fi(wlan0)와 LOHS(ap0)가 함께 있으면 ap0 우선`() {
        val ifaces = listOf(
            nif("wlan0", "192.168.0.23"),
            nif("ap0", "10.123.45.1"),
            nif("lo", "127.0.0.1", loopback = true),
        )
        assertEquals("10.123.45.1", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `wlan1 핫스팟이 wlan0보다 우선`() {
        val ifaces = listOf(nif("wlan0", "192.168.1.5"), nif("wlan1", "172.20.3.1"))
        assertEquals("172.20.3.1", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `셀룰러 rmnet의 10점대 주소보다 핫스팟 인터페이스 우선`() {
        val ifaces = listOf(nif("rmnet_data0", "10.54.2.9"), nif("swlan0", "10.201.7.1"))
        assertEquals("10.201.7.1", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `주소 없는 wlan0, down 인터페이스, loopback은 제외`() {
        val ifaces = listOf(
            nif("wlan0"),
            nif("ap0", "192.168.9.1", up = false),
            nif("lo", "127.0.0.1", loopback = true),
        )
        assertNull(IpSelector.selectHotspotIp(ifaces))
        assertTrue(IpSelector.rank(ifaces).isEmpty())
    }

    @Test
    fun `공인·CGNAT·링크로컬 주소는 핫스팟 IP로 고르지 않는다`() {
        val ifaces = listOf(nif("rmnet0", "100.70.1.2"), nif("wlan0", "169.254.3.3"), nif("eth0", "8.8.4.4"))
        assertNull(IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `기존 Wi-Fi만 있으면 주소만 표시 모드에서 wlan0 IP 사용`() {
        val ifaces = listOf(nif("wlan0", "192.168.0.23"), nif("rmnet_data1", "100.80.2.2"))
        assertEquals("192.168.0.23", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `사설 대역 판정`() {
        assertTrue(IpSelector.isPrivateIpv4("10.0.0.1"))
        assertTrue(IpSelector.isPrivateIpv4("172.16.0.1"))
        assertTrue(IpSelector.isPrivateIpv4("172.31.255.1"))
        assertTrue(IpSelector.isPrivateIpv4("192.168.43.1"))
        assertFalse(IpSelector.isPrivateIpv4("172.32.0.1"))
        assertFalse(IpSelector.isPrivateIpv4("192.169.0.1"))
        assertFalse(IpSelector.isPrivateIpv4("100.64.0.1"))
        assertFalse(IpSelector.isPrivateIpv4("not.an.ip.x"))
        assertFalse(IpSelector.isPrivateIpv4("256.1.1.1"))
    }

    @Test
    fun `순위는 결정적이다(점수, 이름, IP 순)`() {
        val ifaces = listOf(nif("swlan0", "192.168.2.1", "192.168.1.1"), nif("ap0", "192.168.3.1"))
        val ranked = IpSelector.rank(ifaces).map { "${it.iface}=${it.ip}" }
        assertEquals(listOf("ap0=192.168.3.1", "swlan0=192.168.1.1", "swlan0=192.168.2.1"), ranked)
    }

    // ---- 회귀: 회차 1(S25 Ultra, Android 16)에서 관찰한 인터페이스 (M0 리뷰 I-1, I-2) ----

    @Test
    fun `VPN tun0 10_5_0_2만 있으면 핫스팟 IP가 없다`() {
        val ifaces = listOf(nif("lo", "127.0.0.1", loopback = true), nif("tun0", "10.5.0.2"))
        assertNull(IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `S25 Ultra 회차 1 - tun0 10_5_0_2와 swlan0 10_252_26_140이 함께 있으면 swlan0`() {
        val ifaces = listOf(
            nif("tun0", "10.5.0.2"),
            nif("swlan0", "10.252.26.140"),
            nif("rmnet_data0", "100.72.10.3"),
            nif("lo", "127.0.0.1", loopback = true),
        )
        assertEquals("10.252.26.140", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `삼성 Wi-Fi Direct p2p-wlan0-0 192_168_49_1은 합계 0점이어도 고르지 않는다`() {
        val p2p = nif("p2p-wlan0-0", "192.168.49.1")
        assertEquals(0, IpSelector.rank(listOf(p2p)).single().score) // 이름 −30 + 주소 +30: 예전 `score >= 0` 경계
        assertNull(IpSelector.selectHotspotIp(listOf(p2p)))
    }

    @Test
    fun `192_168 대역 VPN tun0도 고르지 않고 뒤에 뜬 swlan0을 고른다`() {
        val vpnOnly = listOf(nif("tun0", "192.168.100.2"))
        assertNull(IpSelector.selectHotspotIp(vpnOnly))
        assertEquals("10.252.26.140", IpSelector.selectHotspotIp(vpnOnly + nif("swlan0", "10.252.26.140")))
    }

    @Test
    fun `p2p와 기존 Wi-Fi wlan0이 함께 있으면 주소만 표시 모드에서 wlan0`() {
        val ifaces = listOf(nif("p2p-wlan0-0", "192.168.49.1"), nif("wlan0", "192.168.0.23"))
        assertEquals("192.168.0.23", IpSelector.selectHotspotIp(ifaces))
    }

    @Test
    fun `JVM에서 실제 스냅샷도 예외 없이 동작`() {
        val snap = IpSelector.snapshot()
        assertTrue(snap.none { it.ipv4.any { ip -> ip.contains(':') } })
    }
}
