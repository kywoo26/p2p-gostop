package com.kywoo26.p2pgostop

import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertNull

class VibrationPatternTest {
    @Test fun `패턴을 대기 진동 교대 파형으로 바꾸고 총 지속 시간을 제한한다`() {
        assertContentEquals(longArrayOf(0, 100, 50, 100), VibrationPattern.waveform(listOf(100, 50, 100)))
        assertContentEquals(longArrayOf(0, 500, 500, 500, 500), VibrationPattern.waveform(List(8) { 900 }))
    }

    @Test fun `빈 패턴과 음수 또는 지나치게 긴 패턴을 거절한다`() {
        assertNull(VibrationPattern.waveform(emptyList()))
        assertNull(VibrationPattern.waveform(listOf(-1)))
        assertNull(VibrationPattern.waveform(listOf(0, 100)))
        assertNull(VibrationPattern.waveform(List(17) { 1 }))
    }
}
