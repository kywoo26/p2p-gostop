package com.kywoo26.p2pgostop

/** 웹 패턴(진동부터 시작)을 Android 파형(대기부터 시작)으로 변환한다. */
object VibrationPattern {
    const val MAX_SEGMENTS = 16
    const val MAX_SEGMENT_MS = 500L
    const val MAX_TOTAL_MS = 2_000L

    fun waveform(pattern: List<Long>): LongArray? {
        if (pattern.isEmpty() || pattern.size > MAX_SEGMENTS || pattern.any { it < 0 }) return null
        var remaining = MAX_TOTAL_MS
        val timings = mutableListOf(0L)
        for (duration in pattern) {
            if (remaining == 0L) break
            val capped = minOf(duration, MAX_SEGMENT_MS, remaining)
            timings.add(capped)
            remaining -= capped
        }
        return timings.toLongArray().takeIf { wave -> wave.indices.any { it % 2 == 1 && wave[it] > 0 } }
    }
}
