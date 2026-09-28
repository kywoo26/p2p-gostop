package com.kywoo26.p2pgostop.log

/**
 * 공유·복사용 로그 문서 (spec FR-30). Android 의존성 없이 JVM에서 테스트한다.
 *
 * 공유 인텐트는 바인더 트랜잭션(프로세스당 1MB 버퍼) 안에 실려 가고 문자열은 UTF-16으로 직렬화된다.
 * 그래서 [full] 전체는 파일(EXTRA_STREAM)로 보내고, EXTRA_TEXT에는 [summary]로 만든 짧은 요약만 싣는다(M0 리뷰 L-2).
 */
object LogReport {
    /** 공유 EXTRA_TEXT 상한(UTF-8 바이트). 최악(ASCII)에도 UTF-16으로 96KB라 1MB 바인더 한도와 거리가 멀다. */
    const val SHARE_TEXT_MAX_BYTES = 48 * 1024

    /** 클립보드 복사 상한(UTF-8 바이트). 클립보드도 바인더를 거친다. */
    const val COPY_MAX_BYTES = 200 * 1024

    fun full(header: String, diagnostics: List<String>, host: List<String>, guest: List<String>): String = buildString {
        appendLine(header.trimEnd())
        appendLine("--- 진단 ---")
        diagnostics.forEach { appendLine(it) }
        appendLine("--- 호스트 로그 (${host.size}줄) ---")
        host.forEach { appendLine(it) }
        appendLine("--- 게스트 로그 (${guest.size}줄) ---")
        guest.forEach { appendLine(it) }
    }

    /**
     * 머리말·진단 + 호스트·게스트 로그의 마지막 줄들. 결과는 항상 [maxBytes] 이하다.
     * 남는 예산의 2/3는 호스트, 나머지는 게스트 로그에 쓴다(게스트가 호스트 진단을 밀어내지 않게).
     */
    fun summary(
        header: String,
        diagnostics: List<String>,
        host: List<String>,
        guest: List<String>,
        note: String,
        maxBytes: Int = SHARE_TEXT_MAX_BYTES,
    ): String {
        val head = buildString {
            appendLine(header.trimEnd())
            appendLine(note)
            appendLine("--- 진단 ---")
            diagnostics.forEach { appendLine(it) }
        }
        val headPart = Utf8.head(head, maxBytes)
        var budget = maxBytes - Utf8.length(headPart)
        val sb = StringBuilder(headPart)
        val hostTitleProbe = "--- 호스트 로그 마지막 000000/000000줄 ---\n"
        val guestTitleProbe = "--- 게스트 로그 마지막 000000/000000줄 ---\n"
        val titles = Utf8.length(hostTitleProbe) + Utf8.length(guestTitleProbe)
        if (budget <= titles) return sb.toString()
        budget -= titles
        val guestBudget = if (guest.isEmpty()) 0 else budget / 3
        val hostTail = tailWithin(host, budget - guestBudget)
        val guestTail = tailWithin(guest, budget - Utf8.length(hostTail.joinToString("") { it + "\n" }))
        sb.append("--- 호스트 로그 마지막 ${hostTail.size}/${host.size}줄 ---\n")
        hostTail.forEach { sb.append(it).append('\n') }
        sb.append("--- 게스트 로그 마지막 ${guestTail.size}/${guest.size}줄 ---\n")
        guestTail.forEach { sb.append(it).append('\n') }
        return sb.toString()
    }

    /** 뒤에서부터 줄 단위로, 개행 포함 [maxBytes] 이하가 되는 만큼만 남긴다. */
    fun tailWithin(lines: List<String>, maxBytes: Int): List<String> {
        var used = 0
        var from = lines.size
        while (from > 0) {
            val w = Utf8.length(lines[from - 1]) + 1
            if (used + w > maxBytes) break
            used += w
            from--
        }
        return lines.subList(from, lines.size)
    }

    /** 문자열 전체를 [maxBytes] 이하로 줄인다(앞부분 생략). */
    fun clipTail(text: String, maxBytes: Int): String {
        if (Utf8.length(text) <= maxBytes) return text
        val mark = "(앞부분 생략)\n"
        return mark + Utf8.tail(text, maxBytes - Utf8.length(mark))
    }
}
