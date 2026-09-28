package com.kywoo26.p2pgostop

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** LOHS 콜백 순서 시뮬레이션 (M0 리뷰 S-1, S-6). */
class HotspotSessionTest {
    private class Res(val name: String)

    private val closed = mutableListOf<String>()
    private val session = HotspotSession<Res> { closed += it.name }

    @Test
    fun `정상 흐름 - 요청, onStarted, 정지하면 예약을 닫는다`() {
        val gen = session.begin()!!
        assertTrue(session.onStarted(gen, Res("a")))
        assertTrue(session.hasReservation)
        assertTrue(session.shutdown())
        assertEquals(listOf("a"), closed)
        assertFalse(session.hasReservation)
    }

    @Test
    fun `S-1 정지 뒤 늦게 도착한 onStarted는 예약을 곧바로 닫고 반영하지 않는다`() {
        val gen = session.begin()!!
        session.shutdown() // 사용자가 요청 대기 중에 중지
        assertFalse(session.onStarted(gen, Res("late")))
        assertEquals(listOf("late"), closed)
        assertFalse(session.hasReservation)
    }

    @Test
    fun `S-1 서비스가 다시 시작된 뒤에 지난 세대의 onStarted가 와도 닫는다`() {
        val old = session.begin()!!
        session.shutdown()
        session.reopen() // 새 서비스 인스턴스
        val now = session.begin()!!
        assertFalse(session.onStarted(old, Res("old")))
        assertTrue(session.onStarted(now, Res("new")))
        assertEquals(listOf("old"), closed)
        assertTrue(session.hasReservation)
    }

    @Test
    fun `주소만 표시로 전환(cancel)하면 예약을 닫고 늦은 콜백은 무시한다`() {
        val gen = session.begin()!!
        assertTrue(session.onStarted(gen, Res("a")))
        assertTrue(session.cancel())
        assertFalse(session.onStopped(gen))
        assertFalse(session.onFailed(gen))
        assertEquals(listOf("a"), closed)
    }

    @Test
    fun `onFailed 이후 다시 요청할 수 있고, 지난 세대의 onFailed·onStopped는 무시한다`() {
        val g1 = session.begin()!!
        assertTrue(session.isPendingFor(g1)) // 구성 변형 실패 → 기본 API 재시도 판단
        assertTrue(session.onFailed(g1))
        assertFalse(session.onFailed(g1))
        val g2 = session.begin()!!
        assertFalse(session.isPendingFor(g1))
        assertFalse(session.onStopped(g1))
        assertTrue(session.onStarted(g2, Res("b")))
        assertTrue(session.onStopped(g2)) // 시스템이 내림
        assertFalse(session.hasReservation)
        assertTrue(closed.isEmpty(), "시스템이 내린 예약은 우리가 닫지 않는다")
    }

    @Test
    fun `이미 켜져 있거나 요청 중이거나 정지됐으면 새 요청을 만들지 않는다`() {
        val gen = session.begin()!!
        assertNull(session.begin()) // 요청 중
        session.onStarted(gen, Res("a"))
        assertNull(session.begin()) // 켜져 있음
        session.shutdown()
        assertNull(session.begin()) // 정지됨
    }

    @Test
    fun `S-6 정지는 한 번만 처리된다`() {
        assertTrue(session.shutdown())
        assertFalse(session.shutdown())
    }

    @Test
    fun `같은 예약으로 onStarted가 두 번 와도 닫지 않는다`() {
        val gen = session.begin()!!
        val r = Res("a")
        assertTrue(session.onStarted(gen, r))
        assertTrue(session.onStarted(gen, r))
        assertTrue(closed.isEmpty())
    }
}
