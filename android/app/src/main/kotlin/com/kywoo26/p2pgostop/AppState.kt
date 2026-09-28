package com.kywoo26.p2pgostop

import android.util.Log
import com.kywoo26.p2pgostop.log.LogBuffer
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** 프로세스 전역 상태. 서비스와 액티비티가 같은 프로세스에서 공유한다. 상태 규칙은 HotspotModel.kt. */
object AppState {
    private const val TAG = "p2pgostop"

    /** 호스트 진단 로그: 2,000줄, 줄당 2KB, 총 512KB(UTF-8). */
    val logs = LogBuffer(capacity = 2000, maxTotalBytes = 512 * 1024)

    /**
     * 게스트가 올린 로그: 2,000줄, 줄당 2KB, 총 256KB(UTF-8, spec NP-09).
     * 호스트 로그와 버퍼를 나눠 게스트 업로드가 호스트 진단 이력을 밀어내지 못하게 한다(M0 리뷰 L-1).
     * 줄마다 `G| `를 붙여 호스트 줄로 위장하지 못하게 한다(M0 리뷰 L-4).
     */
    val guestLogs = LogBuffer(capacity = 2000, maxTotalBytes = 256 * 1024, linePrefix = "G| ")

    val wsClients = AtomicInteger(0)
    val wsHostClients = AtomicInteger(0)
    val wsGuestClients = AtomicInteger(0)
    private val _hotspot = MutableStateFlow(HotspotState())
    val hotspot: StateFlow<HotspotState> = _hotspot

    fun update(transform: (HotspotState) -> HotspotState) = _hotspot.update(transform)

    fun log(message: String) {
        logs.add(message)
        Log.i(TAG, message)
    }
}
