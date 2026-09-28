package com.kywoo26.p2pgostop.log

/**
 * UTF-8 바이트 기준 길이 계산과 자르기 (spec NP-09: 로그 상한은 문자 수가 아니라 UTF-8 바이트로 센다).
 * 한국어는 글자당 3바이트라서 문자 수로 자르면 실제 전송·보관 크기가 최대 3배까지 커진다(M0 리뷰 L-1, L-3).
 * 서로게이트 쌍(이모지 등)은 쪼개지 않는다.
 */
object Utf8 {
    private fun charBytes(c: Char): Int = when {
        c.code < 0x80 -> 1
        c.code < 0x800 -> 2
        Character.isSurrogate(c) -> 2 // 쌍(4바이트)의 절반. 짝 없는 서로게이트도 인코더가 '?'(1) 이상으로 바꾸므로 넉넉히 센다.
        else -> 3
    }

    fun length(s: CharSequence): Int {
        var n = 0
        for (c in s) n += charBytes(c)
        return n
    }

    /** 앞에서부터 [maxBytes] 바이트 이하가 되도록 자른다. */
    fun head(s: String, maxBytes: Int): String {
        if (maxBytes <= 0) return ""
        var n = 0
        var i = 0
        while (i < s.length) {
            val c = s[i]
            val pair = Character.isHighSurrogate(c) && i + 1 < s.length && Character.isLowSurrogate(s[i + 1])
            val w = if (pair) 4 else charBytes(c)
            if (n + w > maxBytes) break
            n += w
            i += if (pair) 2 else 1
        }
        return s.substring(0, i)
    }

    /** 뒤에서부터 [maxBytes] 바이트 이하가 되도록 남긴다(최근 로그 보존). */
    fun tail(s: String, maxBytes: Int): String {
        if (maxBytes <= 0) return ""
        var n = 0
        var i = s.length
        while (i > 0) {
            val c = s[i - 1]
            val pair = Character.isLowSurrogate(c) && i - 2 >= 0 && Character.isHighSurrogate(s[i - 2])
            val w = if (pair) 4 else charBytes(c)
            if (n + w > maxBytes) break
            n += w
            i -= if (pair) 2 else 1
        }
        return s.substring(i)
    }
}
