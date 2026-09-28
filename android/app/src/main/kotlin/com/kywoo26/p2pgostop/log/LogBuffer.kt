package com.kywoo26.p2pgostop.log

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** 타임스탬프가 붙는 고정 용량 링 버퍼 로그 (spec FR-30, 2,000줄). 스레드 안전. */
class LogBuffer(
    private val capacity: Int = 2000,
    private val clock: () -> LocalDateTime = { LocalDateTime.now() },
) {
    private val lines = ArrayDeque<String>(capacity)
    private val fmt = DateTimeFormatter.ofPattern("MM-dd HH:mm:ss.SSS")

    @get:Synchronized
    var version: Long = 0
        private set

    @Synchronized
    fun add(message: String) {
        val stamp = clock().format(fmt)
        for (part in message.lines()) {
            if (lines.size >= capacity) lines.removeFirst()
            lines.addLast("$stamp $part")
        }
        version++
    }

    @Synchronized
    fun snapshot(): List<String> = lines.toList()

    @Synchronized
    fun tail(n: Int): List<String> = lines.toList().takeLast(n)

    @Synchronized
    fun size(): Int = lines.size

    @Synchronized
    fun clear() {
        lines.clear()
        version++
    }
}
