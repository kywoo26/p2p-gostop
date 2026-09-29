package com.kywoo26.p2pgostop.server

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RelayEnqueuePolicyTest {
    @Test fun `64개 큐의 65번째 메시지는 1008을 예약하고 left로 역할을 해제한다`() {
        val queue = ArrayDeque<Int>()
        val events = mutableListOf<String>()
        val policy = RelayEnqueuePolicy<String>(
            close = { target, code, reason -> events.add("close:$target:$code:$reason") },
            detach = { target -> events.add("left:$target") },
        )
        fun send(n: Int) = policy.offer("guest") {
            if (queue.size == MAX_OUTGOING_FRAMES) false else { queue.addLast(n); true }
        }
        repeat(MAX_OUTGOING_FRAMES) { assertTrue(send(it)) }
        assertFalse(send(65))
        assertFalse(send(66))
        assertEquals(listOf("close:guest:1008:slow-peer", "left:guest"), events)
        assertEquals(MAX_OUTGOING_FRAMES, queue.size)
        policy.forget("guest")
        queue.removeFirst()
        assertTrue(send(67))
    }

    @Test fun `쓰기 불가 가짜 송신 대상은 즉시 종료 예약하고 이후 프레임을 버린다`() {
        val events = mutableListOf<String>()
        var attempts = 0
        val policy = RelayEnqueuePolicy<String>(
            close = { _, code, _ -> events.add("close:$code") },
            detach = { events.add("left") },
        )
        fun send() = policy.offer("guest") { attempts++; false }
        assertFalse(send())
        assertFalse(send())
        assertEquals(1, attempts, "종료 예약 후에는 송신 대상에 다시 쓰지 않는다")
        assertEquals(listOf("close:1008", "left"), events)
    }
}
