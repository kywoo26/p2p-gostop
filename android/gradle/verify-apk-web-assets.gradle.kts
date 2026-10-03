import groovy.json.JsonOutput
import java.io.File
import java.nio.file.Files
import java.security.MessageDigest
import java.util.zip.CRC32
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import java.util.zip.ZipOutputStream
import org.gradle.api.DefaultTask
import org.gradle.api.GradleException
import org.gradle.api.file.DirectoryProperty
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputDirectory
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.OutputFile
import org.gradle.api.tasks.PathSensitive
import org.gradle.api.tasks.PathSensitivity
import org.gradle.api.tasks.TaskAction
import org.gradle.api.tasks.testing.Test

/** 복사 성공이 아니라 최종 APK의 경로 집합과 모든 압축 해제 바이트를 검증한다. */
object PackagedWebAssets {
    private fun safe(path: String) {
        if (path.isEmpty() || path.startsWith('/') || '\\' in path ||
            path.any { it.code < 32 } || path.split('/').any { it.isEmpty() || it == "." || it == ".." })
            throw GradleException("unsafe ZIP/input path: $path")
    }

    private fun digest(bytes: ByteArray): String =
        MessageDigest.getInstance("SHA-256").digest(bytes).joinToString("") { "%02x".format(it) }

    fun verify(expected: File, apk: File): Map<String, Any> {
        val root = expected.toPath()
        val input = sortedMapOf<String, File>()
        Files.walk(root).use { walk ->
            walk.forEach { path ->
                if (Files.isSymbolicLink(path)) throw GradleException("symlink in web input")
                if (Files.isRegularFile(path)) {
                    val relative = root.relativize(path).toString().replace(File.separatorChar, '/')
                    safe(relative)
                    input[relative] = path.toFile()
                } else if (!Files.isDirectory(path)) {
                    throw GradleException("non-regular entry in web input")
                }
            }
        }
        if ("index.html" !in input || input.isEmpty()) throw GradleException("web input lacks index.html")
        try {
            ZipFile(apk).use { zip ->
                val seen = mutableSetOf<String>()
                val actual = sortedMapOf<String, ZipEntry>()
                for (entry in zip.entries().asSequence()) {
                    safe(entry.name.removeSuffix("/"))
                    if (!seen.add(entry.name)) throw GradleException("duplicate ZIP path: ${entry.name}")
                    if (entry.isDirectory) continue
                    // AGP가 생성하는 ART baseline profile 두 경로만 웹 입력 밖에서 허용한다.
                    val generatedProfile = entry.name == "assets/dexopt/baseline.prof" ||
                        entry.name == "assets/dexopt/baseline.profm"
                    if (entry.name.startsWith("assets/") && !entry.name.startsWith("assets/web/") && !generatedProfile)
                        throw GradleException("unexpected asset outside web: ${entry.name}")
                    if (entry.name.startsWith("assets/web/")) {
                        val relative = entry.name.removePrefix("assets/web/")
                        safe(relative)
                        actual[relative] = entry
                    }
                }
                if (input.keys != actual.keys) throw GradleException(
                    "asset path mismatch: expected=${input.size} actual=${actual.size} " +
                        "missing=${input.keys - actual.keys} extra=${actual.keys - input.keys}",
                )
                val files = input.map { (path, file) ->
                    val expectedBytes = file.readBytes()
                    val entry = actual.getValue(path)
                    if (entry.size != expectedBytes.size.toLong()) throw GradleException("asset byte mismatch: $path")
                    val bytes = zip.getInputStream(entry).use { it.readNBytes(expectedBytes.size + 1) }
                    if (!bytes.contentEquals(expectedBytes)) throw GradleException("asset byte mismatch: $path")
                    val crc = CRC32().apply { update(bytes) }.value
                    if (crc != entry.crc) throw GradleException("asset CRC mismatch: $path")
                    mapOf("path" to path, "bytes" to bytes.size, "sha256" to digest(bytes))
                }
                return mapOf("apkSHA256" to digest(apk.readBytes()), "files" to files, "count" to files.size)
            }
        } catch (error: GradleException) {
            throw error
        } catch (error: Exception) {
            throw GradleException("APK ZIP unreadable", error)
        }
    }
}

abstract class VerifyPackagedWebAssets : DefaultTask() {
    @get:InputDirectory @get:PathSensitive(PathSensitivity.RELATIVE)
    abstract val expectedWeb: DirectoryProperty
    @get:InputFile @get:PathSensitive(PathSensitivity.NONE)
    abstract val apk: RegularFileProperty
    @get:OutputFile abstract val report: RegularFileProperty

    @TaskAction fun verify() {
        val output = report.get().asFile
        output.delete()
        val result = PackagedWebAssets.verify(expectedWeb.get().asFile, apk.get().asFile)
        output.parentFile.mkdirs()
        output.writeText(JsonOutput.prettyPrint(JsonOutput.toJson(result)) + "\n")
        logger.lifecycle("완성 APK 웹 자산 전체 일치: ${result["count"]}개 (path/bytes/SHA-256)")
    }
}

/** 같은 검사 함수의 양방향 집합/바이트/ZIP 반례를 작은 단일 fixture로 검증한다. */
abstract class TestPackagedWebAssetsVerifier : DefaultTask() {
    @get:OutputFile abstract val report: RegularFileProperty

    @TaskAction fun test() {
        val dir = temporaryDir.resolve("fixture").apply { deleteRecursively(); mkdirs() }
        val expected = dir.resolve("web").apply { mkdirs() }
        val files = mapOf("index.html" to "boot", "_app/start.js" to "home", "_app/home.css" to "body{}")
        for ((path, text) in files) expected.resolve(path).apply { parentFile.mkdirs(); writeText(text) }
        fun archive(name: String, entries: Map<String, String>): File = dir.resolve(name).apply {
            ZipOutputStream(outputStream()).use { zip ->
                for ((path, text) in entries) {
                    zip.putNextEntry(ZipEntry(path)); zip.write(text.toByteArray()); zip.closeEntry()
                }
            }
        }
        val packaged = files.mapKeys { "assets/web/${it.key}" }
        val checks = mutableListOf("valid")
        val good = archive("good.apk", packaged + mapOf(
            "assets/dexopt/baseline.prof" to "generated-profile",
            "assets/dexopt/baseline.profm" to "generated-metadata",
        ))
        check(PackagedWebAssets.verify(expected, good)["count"] == 3)
        fun fails(name: String, apk: File, message: String) {
            val error = runCatching { PackagedWebAssets.verify(expected, apk) }.exceptionOrNull()
            check(error is GradleException && error.message.orEmpty().contains(message)) { "$name did not fail closed" }
            checks.add(name)
        }
        fails("missing", archive("missing.apk", packaged - "assets/web/_app/start.js"), "missing=")
        fails("extra", archive("extra.apk", packaged + ("assets/web/extra.js" to "extra")), "extra=")
        fails("bytes", archive("bytes.apk", packaged + ("assets/web/_app/start.js" to "away")), "byte mismatch")
        fails("unsafe", archive("unsafe.apk", packaged + ("assets/web/../secret" to "no")), "unsafe ZIP")
        fails("outside", archive("outside.apk", packaged + ("assets/private" to "no")), "outside web")
        fails("corrupt", dir.resolve("corrupt.apk").apply { writeBytes(good.readBytes().copyOf(20)) }, "ZIP unreadable")
        // ZipOutputStream 자체는 중복을 거부하므로 같은 길이의 이름을 양쪽 ZIP header에서 치환한다.
        val duplicate = archive("duplicate.apk", packaged + ("assets/web/indey.html" to "boot"))
        val data = duplicate.readBytes()
        val needle = "assets/web/indey.html".toByteArray()
        val replacement = "assets/web/index.html".toByteArray()
        for (offset in 0..data.size - needle.size)
            if (needle.indices.all { data[offset + it] == needle[it] }) replacement.copyInto(data, offset)
        duplicate.writeBytes(data)
        fails("duplicate", duplicate, "duplicate ZIP path")
        val output = report.get().asFile
        output.parentFile.mkdirs(); output.writeText(JsonOutput.toJson(mapOf("passed" to checks)) + "\n")
        logger.lifecycle("완성 APK 검사기 반례: ${checks.size}개 PASS")
    }
}

val dist = rootProject.file("../packages/web/dist")
// release 서명 잡은 npm/dist 없이 전달받은 동일 입력을 assets/web에 복사한다.
val expected = if (dist.resolve("index.html").isFile) dist else file("src/main/assets/web")
val verifierTests = tasks.register<TestPackagedWebAssetsVerifier>("testPackagedWebAssetsVerifier") {
    report.set(layout.buildDirectory.file("reports/web-assets/verifier-tests.json"))
}
fun registerVerifier(name: String, path: String) = tasks.register<VerifyPackagedWebAssets>(name) {
    dependsOn(verifierTests)
    expectedWeb.set(expected)
    apk.set(layout.buildDirectory.file(path))
    report.set(layout.buildDirectory.file("reports/web-assets/$name.json"))
}
val debugVerifier = registerVerifier("verifyDebugApkWebAssets", "outputs/apk/debug/app-debug.apk")
val releaseVerifier = registerVerifier("verifyReleaseApkWebAssets", "outputs/apk/release/app-release.apk")
// standalone 검사는 이미 완성된 파일만 읽는다. 서명 키 정리 뒤 재패키징하지 않는다.
tasks.register<VerifyPackagedWebAssets>("verifyPackagedWebAssets") {
    dependsOn(verifierTests)
    expectedWeb.set(file(providers.gradleProperty("webAssetsExpectedDir").orNull ?: expected.path))
    apk.set(file(providers.gradleProperty("webAssetsApk").orNull ?: "build/outputs/apk/debug/app-debug.apk"))
    report.set(layout.buildDirectory.file("reports/web-assets/external-apk.json"))
}
afterEvaluate {
    tasks.named("assembleDebug") { finalizedBy(debugVerifier) }
    tasks.named("assembleRelease") { finalizedBy(releaseVerifier) }
    debugVerifier.configure { mustRunAfter("packageDebug") }
    releaseVerifier.configure { mustRunAfter("packageRelease") }
    tasks.named<Test>("testDebugUnitTest") {
        dependsOn("assembleDebug", debugVerifier)
        val builtApk = layout.buildDirectory.file("outputs/apk/debug/app-debug.apk")
        inputs.file(builtApk).withPropertyName("packagedWebApk").withPathSensitivity(PathSensitivity.NONE)
        systemProperty("packagedWebApk", builtApk.get().asFile.path)
    }
}
