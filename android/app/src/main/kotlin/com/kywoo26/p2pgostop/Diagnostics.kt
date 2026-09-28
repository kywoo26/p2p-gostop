package com.kywoo26.p2pgostop

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.net.wifi.WifiManager
import android.os.PowerManager
import android.provider.Settings
import com.kywoo26.p2pgostop.server.SERVER_PORT

/** 연결 자가진단 (spec FR-32). */
object Diagnostics {
    val runtimePermissions = arrayOf(Manifest.permission.NEARBY_WIFI_DEVICES, Manifest.permission.POST_NOTIFICATIONS)

    fun granted(ctx: Context, permission: String): Boolean =
        ctx.checkSelfPermission(permission) == PackageManager.PERMISSION_GRANTED

    fun airplaneMode(ctx: Context): Boolean =
        Settings.Global.getInt(ctx.contentResolver, Settings.Global.AIRPLANE_MODE_ON, 0) == 1

    fun wifiEnabled(ctx: Context): Boolean = ctx.getSystemService(WifiManager::class.java).isWifiEnabled

    fun batteryExempt(ctx: Context): Boolean =
        ctx.getSystemService(PowerManager::class.java).isIgnoringBatteryOptimizations(ctx.packageName)

    private fun yn(b: Boolean) = if (b) "예" else "아니오"

    fun lines(ctx: Context, s: HotspotState): List<String> = buildList {
        add("권한 NEARBY_WIFI_DEVICES: ${if (granted(ctx, Manifest.permission.NEARBY_WIFI_DEVICES)) "허용" else "거부"}")
        add("권한 POST_NOTIFICATIONS: ${if (granted(ctx, Manifest.permission.POST_NOTIFICATIONS)) "허용" else "거부"}")
        add("Wi-Fi 켜짐: ${yn(wifiEnabled(ctx))}")
        add("비행기 모드: ${yn(airplaneMode(ctx))}")
        add("핫스팟 상태: ${s.status}${s.apiVariant?.let { " ($it)" } ?: ""}")
        add("마지막 오류: ${s.lastError ?: "없음"}")
        add("보안 유형: ${s.securityType ?: "-"}")
        add("서버: ${if (s.serverRunning) "실행 중 0.0.0.0:$SERVER_PORT" else "중지"}${s.serverError?.let { " / 오류 $it" } ?: ""}")
        add("WebSocket 접속 수: ${AppState.wsClients.get()}")
        add("배터리 최적화 예외: ${yn(batteryExempt(ctx))}")
        add("선택된 IP: ${s.ip ?: "없음"}")
        add("IPv4 후보: ${if (s.candidates.isEmpty()) "없음" else s.candidates.joinToString { "${it.iface}=${it.ip}" }}")
    }
}
