package com.kywoo26.p2pgostop.server

import io.ktor.client.request.get
import io.ktor.client.statement.bodyAsBytes
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.server.application.ApplicationCall
import io.ktor.server.testing.testApplication
import java.io.File
import java.util.zip.ZipFile
import kotlin.test.Test
import kotlin.test.assertContentEquals
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** 메모리 fixture 대신 assembleDebug가 만든 APK를 생산 서빙 경로에 넣는다(SK3-HF01). */
class PackagedWebBootTest {
    @Test fun `완성 APK의 초기 import preload CSS를 생산 경로로 제공한다`() = testApplication {
        ZipFile(File(requireNotNull(System.getProperty("packagedWebApk")))).use { zip ->
            // testApplication의 합성 peer 대신 기존 M4와 같은 loopback fixture를 명시한다.
            val env = packagedWebEnv(zip, remoteAddress = { "127.0.0.1" })
            application { smokeModule(env) }
            val index = requireNotNull(env.asset("index.html"))
            val response = client.get("/?build=packaged-build-fixture")
            assertEquals(HttpStatusCode.OK, response.status)
            assertContentEquals(index, response.bodyAsBytes())
            // index의 inline import와 modulepreload/stylesheet href를 함께 읽는다.
            val references = Regex("\\./(_app/[A-Za-z0-9_./-]+)")
                .findAll(index.toString(Charsets.UTF_8)).map { it.groupValues[1] }.toSet()
            assertTrue(references.isNotEmpty(), "초기 Kit 참조가 있어야 한다")
            assertTrue(references.any { it.endsWith(".js") })
            assertTrue(references.any { it.endsWith(".css") })
            for (path in references) {
                val bytes = requireNotNull(env.asset(path)) { "APK 초기 참조 누락: $path" }
                val asset = client.get("/$path")
                assertEquals(HttpStatusCode.OK, asset.status, path)
                assertContentEquals(bytes, asset.bodyAsBytes(), path)
                val mime = if (path.endsWith(".js")) "text/javascript" else "text/css"
                assertTrue(asset.headers[HttpHeaders.ContentType].orEmpty().startsWith(mime), path)
            }
        }
    }
}

private fun packagedWebEnv(
    zip: ZipFile,
    remoteAddress: (ApplicationCall) -> String = { it.request.local.remoteAddress },
) = ServerEnv(
    appVersion = "packaged-build-fixture", gitSha = "packaged-build-fixture", buildTime = "fixture",
    deviceInfo = { emptyMap() }, log = {},
    asset = { path -> zip.getEntry("assets/web/$path")?.let { zip.getInputStream(it).use { input -> input.readBytes() } } },
    remoteAddress = remoteAddress,
)

/** 외부 단일 Chromium 부팅 검사는 이 JVM entry와 생산 CIO를 재사용한다. stdin 종료 시 닫는다. */
object PackagedWebBootProbe {
    @JvmStatic fun main(args: Array<String>) {
        require(args.size == 1)
        ZipFile(File(args[0])).use { zip ->
            val server = startSmokeServer(packagedWebEnv(zip), port = 4264, bindHost = "127.0.0.1")
            try {
                println("PACKAGED_WEB_CIO_READY")
                System.`in`.bufferedReader().readLine()
            } finally {
                server.stop(0, 1_000)
            }
        }
    }
}
