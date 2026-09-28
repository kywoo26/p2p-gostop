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

    /**
     * 핫스팟 URL에 쓸 IP. 없으면 null. 폴백 화면은 [rank] 전체를 따로 보여 준다.
     *
     * 이름 점수와 주소를 **따로** 거른다(M0 리뷰 I-1). 합계 점수만 보면 가상 인터페이스(−30)라도
     * 192.168 주소(+30)면 0점이 되어 통과했다. 실기기(S25 Ultra, 회차 1)에서 VPN `tun0 = 10.5.0.2`가
     * 핫스팟 인터페이스(`swlan0`)가 뜨기 전 약 3초간 선택됐고, 삼성의 Wi-Fi Direct `p2p-wlan0-0 = 192.168.49.1`
     * (Quick Share·Smart View)이나 192.168 대역 VPN도 같은 식으로 잘못 뽑힐 수 있다.
     */
    fun selectHotspotIp(ifaces: List<NetIf>, apOnly: Boolean = false): String? =
        rank(ifaces).firstOrNull { nameScore(it.iface) >= (if (apOnly) AP_MIN_NAME_SCORE else 0) && isPrivateIpv4(it.ip) }?.ip

    /**
     * 핫스팟이 막 켜진 직후(유예 시간 동안)에는 핫스팟형 인터페이스(ap·swlan·wlan1)만 인정한다.
     * 회차 2(S25 Ultra)에서 `swlan0`이 뜨기 전 약 3초간 기존 Wi-Fi `wlan0 = 172.16.100.183`이 선택되어
     * 잘못된 URL QR이 잠깐 표시됐다. 유예가 지나면 일반 규칙으로 돌아가 폴백(기존 Wi-Fi)을 허용한다.
     */
    const val AP_MIN_NAME_SCORE = 40
    const val AP_GRACE_MS = 8_000L

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
