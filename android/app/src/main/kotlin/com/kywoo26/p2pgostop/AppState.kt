package com.kywoo26.p2pgostop

import android.util.Log
import com.kywoo26.p2pgostop.log.LogBuffer
import com.kywoo26.p2pgostop.net.IpCandidate
import java.util.concurrent.atomic.AtomicInteger
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

enum class HotspotStatus { IDLE, STARTING, RUNNING, ADDRESS_ONLY, FAILED, STOPPED }

/** 서비스가 갱신하고 화면이 읽는 핫스팟·서버 상태. */
data class HotspotState(
    val status: HotspotStatus = HotspotStatus.IDLE,
    val ssid: String? = null,
    val password: String? = null,
    val securityType: String? = null,
    val ip: String? = null,
    val candidates: List<IpCandidate> = emptyList(),
    val lastError: String? = null,
    val serverRunning: Boolean = false,
    val serverError: String? = null,
    val apiVariant: String? = null,
) {
    val serviceActive: Boolean
        get() = status == HotspotStatus.STARTING || status == HotspotStatus.RUNNING || status == HotspotStatus.ADDRESS_ONLY
}

/** 프로세스 전역 상태. 서비스와 액티비티가 같은 프로세스에서 공유한다. */
object AppState {
    private const val TAG = "p2pgostop"
    val logs = LogBuffer(2000)
    val wsClients = AtomicInteger(0)
    private val _hotspot = MutableStateFlow(HotspotState())
    val hotspot: StateFlow<HotspotState> = _hotspot

    fun update(transform: (HotspotState) -> HotspotState) = _hotspot.update(transform)

    fun log(message: String) {
        logs.add(message)
        Log.i(TAG, message)
    }
}
