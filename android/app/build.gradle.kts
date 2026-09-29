import java.time.Instant
import groovy.json.JsonSlurper
import org.gradle.api.DefaultTask
import org.gradle.api.artifacts.component.ModuleComponentIdentifier
import org.gradle.api.artifacts.result.ResolvedComponentResult
import org.gradle.api.artifacts.result.ResolvedDependencyResult
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.provider.Property
import org.gradle.api.tasks.Input
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.Sync
import org.gradle.api.tasks.TaskAction

plugins {
    alias(libs.plugins.android.application)
}

// 웹 빌드는 npm(로컬·CI)이 만든다. dist가 있으면 stale 파일을 지우며 동기화한다.
// dist가 없으면 CI가 이미 assets/web에 넣은 산출물을 보존한다.
val copyWebDist = tasks.register<Sync>("copyWebDist") {
    val webDist = rootProject.layout.projectDirectory.dir("../packages/web/dist")
    val webIndex = webDist.file("index.html")
    from(webDist)
    into(layout.projectDirectory.dir("src/main/assets/web"))
    onlyIf("웹 dist가 있을 때만 APK 자산을 동기화") { task ->
        val present = webIndex.asFile.isFile
        if (!present) task.logger.warn("p2p-gostop: 웹 dist 없음; 기존 assets/web을 보존합니다.")
        present
    }
}
tasks.named("preBuild") { dependsOn(copyWebDist) }

// git 정보(FR-31). git이 없거나 저장소가 아니면 개발용 기본값을 쓴다.
fun git(vararg args: String): String? =
    try {
        providers.exec {
            commandLine("git", *args)
            isIgnoreExitValue = true
        }.standardOutput.asText.get().trim().ifEmpty { null }
    } catch (e: Exception) {
        null
    }

val gitDescribe = git("describe", "--tags", "--always", "--dirty") ?: "0.0.0-dev"
val gitSha = git("rev-parse", "--short=7", "HEAD") ?: "unknown"
val gitCommitCount = git("rev-list", "--count", "HEAD")?.toIntOrNull() ?: 1
// 빌드 시각 = HEAD 커밋 시각(UTC). 구성 단계에서 현재 시각을 쓰면 빌드마다 BuildConfig가 바뀌어
// Gradle 캐시가 무효화되고 같은 커밋의 빌드가 재현되지 않는다(M0 리뷰 B-1).
// Git 조회 실패 시 unknown은 시각 미확인을 뜻하는 결정적 값이다. 구성 캐시에 저장·재사용돼도
// 현재 빌드 시각으로 오인하지 않는다. 공용 .git 경로가 안 보이는 환경에서도 같다(B1, FR-31).
val buildTime = git("show", "-s", "--format=%ct", "HEAD")?.toLongOrNull()
    ?.let { Instant.ofEpochSecond(it).toString() }
    ?: "unknown"

// 릴리스 서명: 환경변수가 있으면 고정 키, 없으면 디버그 키로 폴백(로컬 빌드용).
// CI(release.yml)는 secrets에서 키스토어를 복원해 아래 변수를 넘긴다.
val releaseStorePath: String = providers.environmentVariable("ANDROID_KEYSTORE_PATH").orNull
    ?.takeIf { it.isNotBlank() } // compose가 빈 문자열을 넘길 수 있다
    ?: rootProject.file("../secrets/release.jks").path
val releaseStorePassword: String? = providers.environmentVariable("ANDROID_KEYSTORE_PASSWORD").orNull
val releaseKeyAlias: String? = providers.environmentVariable("ANDROID_KEY_ALIAS").orNull
val releaseKeyPassword: String? = providers.environmentVariable("ANDROID_KEY_PASSWORD").orNull
val hasReleaseKey = file(releaseStorePath).isFile &&
    !releaseStorePassword.isNullOrEmpty() && !releaseKeyAlias.isNullOrEmpty() && !releaseKeyPassword.isNullOrEmpty()

android {
    namespace = "com.kywoo26.p2pgostop"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.kywoo26.p2pgostop"
        minSdk = 33
        targetSdk = 36 // 37 금지: LAN 인바운드 권한(AGENTS.md)
        versionCode = gitCommitCount
        versionName = gitDescribe.removePrefix("v")

        buildConfigField("String", "GIT_SHA", "\"$gitSha\"")
        buildConfigField("String", "BUILD_TIME", "\"$buildTime\"")
    }

    signingConfigs {
        if (hasReleaseKey) {
            create("release") {
                storeFile = file(releaseStorePath)
                storePassword = releaseStorePassword
                keyAlias = releaseKeyAlias
                keyPassword = releaseKeyPassword
            }
        }
    }

    buildTypes {
        release {
            // Ktor + R8 이슈 회피, 사이드로드 앱이라 크기 차이는 감수(tech-stack 3.1).
            isMinifyEnabled = false
            isShrinkResources = false
            signingConfig = if (hasReleaseKey) {
                signingConfigs.getByName("release")
            } else {
                logger.warn("p2p-gostop: 릴리스 서명 환경변수가 없어 디버그 키로 서명합니다.")
                signingConfigs.getByName("debug")
            }
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        buildConfig = true
    }

    packaging {
        resources {
            excludes += setOf(
                "META-INF/INDEX.LIST",
                "META-INF/io.netty.versions.properties",
                "META-INF/{AL2.0,LGPL2.1}",
            )
        }
    }

    lint {
        abortOnError = true
        warningsAsErrors = true
        checkReleaseBuilds = true
        // 네트워크 없이도 결정적으로 동작하도록 최신 버전 조회 검사는 끈다(Dependabot이 담당).
        disable += setOf("GradleDependency", "NewerVersionAvailable", "AndroidGradlePluginVersion")
        // targetSdk 36 고정은 의도된 결정: 37부터 LAN 인바운드에 ACCESS_LOCAL_NETWORK가 필요하다(spec NP-08, AGENTS.md).
        disable += "OldTargetApi"
    }
}

dependencies {
    implementation(libs.ktor.server.core)
    implementation(libs.ktor.server.cio)
    implementation(libs.ktor.server.websockets)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.zxing.core)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.activity)

    testImplementation(libs.ktor.server.test.host)
    testImplementation(libs.kotlin.test.junit)
    testImplementation(libs.junit)
    testImplementation(libs.json)
}

// NF-07: 웹 단계에서는 Gradle을 호출하지 않는다. Android 빌드가 실제 런타임 그래프와 커밋된 고지를 대조한다.
abstract class VerifyOssNotices : DefaultTask() {
    @get:InputFile abstract val catalog: RegularFileProperty
    @get:InputFile abstract val notice: RegularFileProperty
    @get:Input abstract val releaseRoot: Property<ResolvedComponentResult>

    @TaskAction fun verify() {
        val document = JsonSlurper().parse(catalog.get().asFile) as Map<*, *>
        val notices = document["android"] as List<*>
        val expected = notices.map { item ->
            val entry = item as Map<*, *>
            "${entry["name"]}:${entry["version"]}"
        }.toSet()
        val actual = mutableSetOf<String>()
        val visited = mutableSetOf<Any>()
        fun visit(component: ResolvedComponentResult) {
            if (!visited.add(component.id)) return
            val id = component.id
            if (id is ModuleComponentIdentifier) actual.add("${id.group}:${id.module}:${id.version}")
            component.dependencies.filterIsInstance<ResolvedDependencyResult>()
                .forEach { visit(it.selected) }
        }
        visit(releaseRoot.get())
        check(actual == expected) {
            "Android 고지 의존성 불일치: 누락=${(actual - expected).sorted()}, 초과=${(expected - actual).sorted()}"
        }
        val text = notice.get().asFile.readText()
        for (item in notices) {
            val entry = item as Map<*, *>
            check(text.contains("${entry["name"]} ${entry["version"]} — ${entry["license"]}")) {
                "Android 고지 원문 누락: ${entry["name"]}"
            }
        }
    }
}

afterEvaluate {
    val verifyOssNotices = tasks.register<VerifyOssNotices>("verifyOssNotices") {
        catalog.set(rootProject.layout.projectDirectory.file("../packages/web/src/oss-notices.json"))
        notice.set(rootProject.layout.projectDirectory.file("../packages/web/public/oss/NOTICE.txt"))
        releaseRoot.set(configurations.named("releaseRuntimeClasspath")
            .flatMap { it.incoming.resolutionResult.rootComponent })
    }
    tasks.named("preBuild") { dependsOn(verifyOssNotices) }
}
