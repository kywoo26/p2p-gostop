package com.kywoo26.p2pgostop.server

import java.util.concurrent.Executor

/**
 * 서버 기동·정지를 한 실행기(단일 스레드)에서 차례로 처리한다 (M0 리뷰 S-3).
 *
 * 전에는 기동이 블로킹 중일 때 정지가 오면 `server == null`이라 그냥 반환했고, 뒤늦게 기동이 끝난 서버가
 * 포트 17777을 붙잡은 채 남아 다음 기동이 BindException으로 실패했다. 이제 정지 요청은 기동 뒤에 줄을 서므로
 * 반드시 그 서버를 멈춘다. 프로세스에 하나만 두어 서비스 인스턴스가 바뀌어도 순서가 유지된다.
 *
 * @param S 서버 타입(Ktor `EmbeddedServer`). 테스트에서는 가짜를 쓴다.
 */
class ServerSlot<S : Any>(
    private val executor: Executor,
    private val startServer: () -> S,
    private val stopServer: (S) -> Unit,
    private val onState: (running: Boolean, error: String?) -> Unit,
    private val log: (String) -> Unit,
    private val tries: Int = 5,
    private val retryDelayMs: Long = 500,
    private val sleep: (Long) -> Unit = { Thread.sleep(it) },
) {
    /** 마지막 요청이 "켜기"인가. 기동 재시도 중에 정지가 오면 남은 재시도를 건너뛴다. */
    @Volatile private var wanted = false

    /** 실행기 스레드에서만 읽고 쓴다. */
    private var server: S? = null

    fun ensure() {
        wanted = true
        executor.execute { doStart() }
    }

    fun stop() {
        wanted = false
        executor.execute { doStop() }
    }

    private fun doStart() {
        if (server != null) return
        for (attempt in 1..tries) {
            if (!wanted) return
            try {
                server = startServer()
                onState(true, null)
                log("서버 시작 0.0.0.0:$SERVER_PORT")
                return
            } catch (e: Exception) {
                onState(false, "${e.javaClass.simpleName}: ${e.message}")
                log("서버 시작 실패($attempt/$tries): ${e.javaClass.name}: ${e.message}")
                // 직전 서버가 아직 포트를 놓지 않았을 수 있어 잠시 뒤 재시도한다.
                if (attempt < tries) sleep(retryDelayMs)
            }
        }
    }

    private fun doStop() {
        val s = server ?: return
        server = null
        try {
            stopServer(s)
        } catch (e: Exception) {
            log("서버 중지 오류: ${e.message}")
        }
        onState(false, null)
        log("서버 중지")
    }
}
