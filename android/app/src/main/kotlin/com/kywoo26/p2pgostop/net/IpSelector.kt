package com.kywoo26.p2pgostop.net

import java.net.Inet4Address
import java.net.NetworkInterface

/** 네트워크 인터페이스 스냅샷. 테스트를 위해 java.net 타입과 분리한다. */
data class NetIf(
    val name: String,
    val isUp: Boolean,
    val isLoopback: Boolean,
    val ipv4: List<String>,
)

/** 선택 결과 한 줄. [score]가 높을수록 핫스팟 게이트웨이일 가능성이 높다. */
data class IpCandidate(val iface: String, val ip: String, val score: Int)

/**
 * 핫스팟(LOHS·시스템 테더링) 게이트웨이 IPv4 선택 로직 (spec FR-01, tech-stack 1.5).
 *
 * LOHS 예약 객체에는 IP가 없고 서브넷은 192.168/16, 172.16/12, 10/8에서 무작위로 고른다.
 * 인터페이스 이름은 기기마다 다르다(ap0, swlan0(삼성), wlan1 등).
 */
object IpSelector {
    private val apPrefixes = listOf("ap", "swlan", "softap")
    private val cellularPrefixes = listOf("rmnet", "ccmni", "pdp", "radio", "v4-rmnet", "clat", "seth")
    private val virtualPrefixes = listOf("tun", "ppp", "ipsec", "dummy", "docker", "veth", "p2p", "aware", "nan")

    fun isPrivateIpv4(ip: String): Boolean {
        val o = parse(ip) ?: return false
        return when {
            o[0] == 10 -> true
            o[0] == 172 && o[1] in 16..31 -> true
            o[0] == 192 && o[1] == 168 -> true
            else -> false
        }
    }

    private fun parse(ip: String): IntArray? {
        val parts = ip.split('.')
        if (parts.size != 4) return null
        val out = IntArray(4)
        for (i in 0..3) {
            val n = parts[i].toIntOrNull() ?: return null
            if (n !in 0..255) return null
            out[i] = n
        }
        return out
    }

    /** 인터페이스 이름 점수. ap·swlan·wlan1 우선, 셀룰러·VPN 등은 감점. */
    fun nameScore(name: String): Int {
        val n = name.lowercase()
        return when {
            apPrefixes.any { n.startsWith(it) } -> 50
            n == "wlan1" || n == "wlan2" -> 40
            n.startsWith("wlan") -> 20 // wlan0은 보통 STA(기존 Wi-Fi). 사설 IP가 있으면 후보로 남긴다.
            n.startsWith("rndis") || n.startsWith("usb") || n.startsWith("eth") -> 10
            cellularPrefixes.any { n.startsWith(it) } -> -40
            virtualPrefixes.any { n.startsWith(it) } -> -30
            else -> 0
        }
    }

    /** 주소 점수. 사설 대역 우선, 링크 로컬·CGNAT 등은 감점. */
    fun addressScore(ip: String): Int {
        val o = parse(ip) ?: return -1000
        return when {
            o[0] == 127 -> -1000
            o[0] == 169 && o[1] == 254 -> -100
            o[0] == 100 && o[1] in 64..127 -> -50 // CGNAT(셀룰러)
            o[0] == 192 && o[1] == 168 -> 30
            o[0] == 172 && o[1] in 16..31 -> 25
            o[0] == 10 -> 20
            else -> -20
        }
    }

    /** loopback·down·IPv4 없음 인터페이스를 제외하고 점수순으로 정렬한 후보 목록. */
    fun rank(ifaces: List<NetIf>): List<IpCandidate> =
        ifaces.asSequence()
            .filter { it.isUp && !it.isLoopback && it.name != "lo" }
            .flatMap { nif -> nif.ipv4.map { ip -> IpCandidate(nif.name, ip, nameScore(nif.name) + addressScore(ip)) } }
            .filter { it.score > -500 }
            .sortedWith(compareByDescending<IpCandidate> { it.score }.thenBy { it.iface }.thenBy { it.ip })
            .toList()

    /** 핫스팟 URL에 쓸 IP. 사설 IPv4 후보가 없으면 null. */
    fun selectHotspotIp(ifaces: List<NetIf>): String? =
        rank(ifaces).firstOrNull { isPrivateIpv4(it.ip) }?.ip

    /** 현재 기기의 인터페이스 스냅샷(Android/JVM 공통). */
    fun snapshot(): List<NetIf> =
        try {
            NetworkInterface.getNetworkInterfaces()?.toList().orEmpty().map { nif ->
                NetIf(
                    name = nif.name,
                    isUp = runCatching { nif.isUp }.getOrDefault(false),
                    isLoopback = runCatching { nif.isLoopback }.getOrDefault(false),
                    ipv4 = nif.inetAddresses.toList().filterIsInstance<Inet4Address>().mapNotNull { it.hostAddress },
                )
            }
        } catch (e: Exception) {
            emptyList()
        }
}
