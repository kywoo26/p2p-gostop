package com.kywoo26.p2pgostop.log

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/**
 * 타임스탬프가 붙는 링 버퍼 로그 (spec FR-30, NP-09). 스레드 안전.
 *
 * 상한은 세 가지이며 바이트는 모두 **UTF-8 기준**이다(spec NP-09, M0 리뷰 L-1):
 * - [capacity]: 줄 수(기본 2,000줄)
 * - [maxLineBytes]: 줄 하나(타임스탬프·접두어 포함)의 최대 바이트. 넘으면 잘라 내고 표시를 붙인다(NP-09 줄당 2KB).
 * - [maxTotalBytes]: 버퍼 전체 바이트. 넘으면 오래된 줄부터 버린다.
 * 줄 길이 상한이 없으면 개행 없는 64KB 로그를 반복 업로드해 힙을 수백 MB까지 채울 수 있었다.
 *
 * [linePrefix]는 모든 줄 앞에 붙는 출처 표시다(게스트 로그는 `G| `, M0 리뷰 L-4).
 */
class LogBuffer(
    private val capacity: Int = 2000,
    private val maxLineBytes: Int = DEFAULT_MAX_LINE_BYTES,
    private val maxTotalBytes: Int = 512 * 1024,
    private val linePrefix: String = "",
    private val clock: () -> LocalDateTime = { LocalDateTime.now() },
) {
    private val lines = ArrayDeque<String>()
    private val lineBytes = ArrayDeque<Int>()
    private var totalBytes = 0
    private val fmt = DateTimeFormatter.ofPattern("MM-dd HH:mm:ss.SSS")

    init {
        require(capacity > 0 && maxLineBytes >= MIN_LINE_BYTES && maxTotalBytes >= maxLineBytes)
    }

    @get:Synchronized
    var version: Long = 0
        private set

    @Synchronized
    fun add(message: String) {
        val stamp = clock().format(fmt)
        for (part in message.lines()) {
            val line = clip("$stamp $linePrefix$part")
            val bytes = Utf8.length(line) + 1 // 개행 포함
            while (lines.isNotEmpty() && (lines.size >= capacity || totalBytes + bytes > maxTotalBytes)) {
                lines.removeFirst()
                totalBytes -= lineBytes.removeFirst()
            }
            lines.addLast(line)
            lineBytes.addLast(bytes)
            totalBytes += bytes
        }
        version++
    }

    private fun clip(line: String): String {
        val bytes = Utf8.length(line)
        if (bytes <= maxLineBytes) return line
        val marker = " …[잘림: 원래 ${bytes}바이트]"
        return Utf8.head(line, maxLineBytes - Utf8.length(marker)) + marker
    }

    @Synchronized
    fun snapshot(): List<String> = lines.toList()

    @Synchronized
    fun tail(n: Int): List<String> = lines.toList().takeLast(n)

    @Synchronized
    fun size(): Int = lines.size

    /** 보관 중인 UTF-8 바이트(줄마다 개행 1바이트 포함). */
    @Synchronized
    fun bytes(): Int = totalBytes

    @Synchronized
    fun clear() {
        lines.clear()
        lineBytes.clear()
        totalBytes = 0
        version++
    }

    companion object {
        /** spec NP-09 줄당 2KB. */
        const val DEFAULT_MAX_LINE_BYTES = 2 * 1024
        private const val MIN_LINE_BYTES = 64
    }
}
