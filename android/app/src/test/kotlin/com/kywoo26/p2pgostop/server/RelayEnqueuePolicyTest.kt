package com.kywoo26.p2pgostop.server

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class RelayEnqueuePolicyTest {
    @Test fun `64개 큐의 65번째 메시지는 종료를 한 번만 예약하고 이후 전송을 버린다`() {
        val queue = ArrayDeque<Int>()
        val policy = RelayEnqueuePolicy<String>()
        var closes = 0
        fun send(n: Int) = policy.offer("guest", {
            if (queue.size == MAX_OUTGOING_FRAMES) false else { queue.addLast(n); true }
        }) { closes++ }
        repeat(MAX_OUTGOING_FRAMES) { assertTrue(send(it)) }
        assertFalse(send(65))
        assertFalse(send(66))
        assertEquals(1, closes)
        assertEquals(MAX_OUTGOING_FRAMES, queue.size)
        policy.forget("guest")
        queue.removeFirst()
        assertTrue(send(67))
    }
}
