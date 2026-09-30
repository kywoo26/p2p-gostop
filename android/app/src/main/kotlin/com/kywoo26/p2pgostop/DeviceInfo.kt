package com.kywoo26.p2pgostop

import android.os.Build

/** 로그·페이지에 자동으로 싣는 기기·빌드 정보 (intent/plan.md 6장 원격 피드백 루프). */
object DeviceInfo {
    /** 삼성 기기면 SEM_PLATFORM_INT로 One UI 버전을 추정한다. 없으면 null. */
    fun oneUiHint(): String? = try {
        val v = Build.VERSION::class.java.getField("SEM_PLATFORM_INT").getInt(null)
        val major = (v - 90000) / 10000
        val minor = (v % 10000) / 100
        "One UI $major.$minor (SEM_PLATFORM_INT=$v, 추정)"
    } catch (e: ReflectiveOperationException) {
        null
    }

    fun androidVersion(): String {
        val full = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) " full=${Build.VERSION.SDK_INT_FULL}" else ""
        return "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT}$full, 패치 ${Build.VERSION.SECURITY_PATCH})"
    }

    fun map(): Map<String, String> = buildMap {
        put("호스트 기기", "${Build.MANUFACTURER} ${Build.MODEL} (${Build.DEVICE})")
        put("호스트 OS", androidVersion())
        oneUiHint()?.let { put("One UI", it) }
    }

    fun header(): String = buildString {
        appendLine("=== 맞고 P2P 로그 ===")
        appendLine("앱 ${BuildConfig.VERSION_NAME} (code ${BuildConfig.VERSION_CODE}) git ${BuildConfig.GIT_SHA} 빌드 ${BuildConfig.BUILD_TIME}")
        appendLine("기기 ${Build.MANUFACTURER} ${Build.MODEL} / ${Build.DEVICE} / ${Build.PRODUCT}")
        appendLine(androidVersion())
        appendLine("빌드 지문 ${Build.FINGERPRINT}")
        oneUiHint()?.let { appendLine(it) }
    }
}
