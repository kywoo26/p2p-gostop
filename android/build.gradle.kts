// 최상위 빌드 파일.
// AGP 9 내장 Kotlin을 쓴다. Kotlin 버전(2.4.20)은 KGP를 buildscript classpath에 올려서 고정한다
// (https://developer.android.com/build/migrate-to-built-in-kotlin). kotlin-android 플러그인은 적용하지 않는다.
buildscript {
    repositories {
        mavenCentral()
    }
    dependencies {
        classpath(libs.kotlin.gradle.plugin)
    }
}

plugins {
    alias(libs.plugins.android.application) apply false
}
