package com.kywoo26.p2pgostop.server

import java.util.Collections
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** 서버 기동·정지 직렬화 (M0 리뷰 S-3). */
class ServerSlotTest {
    private val executor = Executors.newSingleThreadExecutor()
    private val events = Collections.synchronizedList(mutableListOf<String>())
    private val states = Collections.synchronizedList(mutableListOf<Boolean>())
    private var counter = 0

    @AfterTest
    fun tearDown() {
        executor.shutdownNow()
    }

    private fun drain() {
        val done = CountDownLatch(1)
        executor.execute { done.countDown() }
        assertTrue(done.await(5, TimeUnit.SECONDS))
    }

    private fun slot(start: () -> String, tries: Int = 5) = ServerSlot(
        executor = executor,
        startServer = start,
        stopServer = { events += "stop:$it" },
        onState = { running, _ -> states += running },
        log = {},
        tries = tries,
        sleep = {},
    )

    @Test
    fun `기동이 블로킹 중에 정지가 오면 기동이 끝난 뒤 그 서버를 멈춘다`() {
        val entered = CountDownLatch(1)
        val release = CountDownLatch(1)
        val s = slot({
            entered.countDown()
            release.await(5, TimeUnit.SECONDS)
            "srv${++counter}".also { events += "start:$it" }
        })
        s.ensure()
        assertTrue(entered.await(5, TimeUnit.SECONDS)) // 기동 중(포트 바인딩 대기)
        s.stop()
        release.countDown()
        drain()
        assertEquals(listOf("start:srv1", "stop:srv1"), events)
        assertEquals(false, states.last())
    }

    @Test
    fun `정지 직후 다시 켜면 이전 서버를 멈춘 다음 새로 띄운다`() {
        val s = slot({ "srv${++counter}".also { events += "start:$it" } })
        s.ensure()
        s.stop()
        s.ensure()
        drain()
        assertEquals(listOf("start:srv1", "stop:srv1", "start:srv2"), events)
        assertEquals(true, states.last())
    }

    @Test
    fun `두 번 켜도 서버는 하나`() {
        val s = slot({ "srv${++counter}".also { events += "start:$it" } })
        s.ensure()
        s.ensure()
        drain()
        assertEquals(listOf("start:srv1"), events)
    }

    @Test
    fun `기동 실패는 재시도하고, 재시도 중 정지가 오면 남은 재시도를 건너뛴다`() {
        var attempts = 0
        val s = slot({
            attempts++
            error("BindException 흉내")
        }, tries = 3)
        s.ensure()
        drain()
        assertEquals(3, attempts)
        assertEquals(listOf(false, false, false), states)

        attempts = 0
        val gate = CountDownLatch(1)
        executor.execute { gate.await(5, TimeUnit.SECONDS) } // 실행기를 잠시 붙잡아 둔다
        s.ensure()
        s.stop() // 기동 차례가 오기 전에 정지
        gate.countDown()
        drain()
        assertEquals(0, attempts)
    }
}
