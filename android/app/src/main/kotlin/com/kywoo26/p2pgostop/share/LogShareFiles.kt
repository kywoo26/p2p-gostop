package com.kywoo26.p2pgostop.share

import java.time.LocalDateTime
import java.time.format.DateTimeFormatter

/** 공유용 로그 파일 이름 규칙. [LogShareProvider]는 이 규칙에 맞는 이름만 연다(경로 조작 방지). */
object LogShareFiles {
    const val DIR = "shared_logs"
    private val NAME = Regex("^[A-Za-z0-9._-]{1,96}\\.(txt|json)$")
    private val fmt = DateTimeFormatter.ofPattern("yyyyMMdd-HHmmss")

    fun name(gitSha: String, at: LocalDateTime): String {
        val sha = gitSha.filter { it.isLetterOrDigit() }.take(12).ifEmpty { "unknown" }
        return "p2p-gostop-log-$sha-${at.format(fmt)}.txt"
    }

    fun isValidName(name: String): Boolean = NAME.matches(name) && !name.startsWith(".") && ".." !in name
}
