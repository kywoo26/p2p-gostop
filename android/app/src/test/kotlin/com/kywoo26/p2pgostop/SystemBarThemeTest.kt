package com.kywoo26.p2pgostop

import java.io.File
import javax.xml.XMLConstants
import javax.xml.parsers.DocumentBuilderFactory
import kotlin.math.pow
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotEquals
import kotlin.test.assertTrue
import org.w3c.dom.Element

/** 실제 기본 리소스의 계약만 검사한다. Android 아이콘 렌더링·인셋 배치는 기기 검증 대상이다. */
class SystemBarThemeTest {
    private val root = listOf(File("src/main"), File("app/src/main")).first { it.isDirectory }
    private val android = "http://schemas.android.com/apk/res/android"

    private fun elements(path: String, tag: String): List<Element> {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature(XMLConstants.FEATURE_SECURE_PROCESSING, true)
            // JDK 21의 외부 참조 차단 속성. Android 컴파일용 XMLConstants에는 이름 상수가 없다.
            setAttribute("http://javax.xml.XMLConstants/property/accessExternalDTD", "")
            setAttribute("http://javax.xml.XMLConstants/property/accessExternalSchema", "")
        }
        val nodes = factory.newDocumentBuilder().parse(File(root, path)).getElementsByTagName(tag)
        return List(nodes.length) { nodes.item(it) as Element }
    }

    private fun activityTheme(activity: String): String {
        val app = elements("AndroidManifest.xml", "application").single()
        val node = elements("AndroidManifest.xml", "activity")
            .single { it.getAttributeNS(android, "name") == activity }
        return node.getAttributeNS(android, "theme").ifEmpty { app.getAttributeNS(android, "theme") }
    }

    private fun themeItems(reference: String, seen: Set<String> = emptySet()): Map<String, String> {
        if (reference.startsWith("@android:style/")) return emptyMap()
        val name = reference.removePrefix("@style/")
        require(name !in seen) { "Theme inheritance cycle" }
        val style = elements("res/values/themes.xml", "style").single { it.getAttribute("name") == name }
        val parent = style.getAttribute("parent").ifEmpty { name.substringBeforeLast('.', "") }
        val inherited = if (parent.isEmpty()) emptyMap() else themeItems(parent, seen + name)
        val nodes = style.getElementsByTagName("item")
        val items = List(nodes.length) { nodes.item(it) as Element }
        require(items.map { it.getAttribute("name") }.toSet().size == items.size) { "Duplicate theme item" }
        return inherited + items.associate { it.getAttribute("name") to it.textContent.trim() }
    }

    private fun color(reference: String): Long {
        require(reference.startsWith("@color/")) { "Expected explicit app surface" }
        val value = elements("res/values/colors.xml", "color")
            .single { it.getAttribute("name") == reference.removePrefix("@color/") }.textContent.trim()
        require(value.matches(Regex("#[0-9A-Fa-f]{8}"))) { "Expected explicit ARGB surface" }
        return value.substring(1).toLong(16)
    }

    private fun luminance(color: Long): Double {
        fun channel(shift: Int): Double {
            val value = ((color shr shift) and 255).toDouble() / 255
            return if (value <= 0.04045) value / 12.92 else ((value + 0.055) / 1.055).pow(2.4)
        }
        return 0.2126 * channel(16) + 0.7152 * channel(8) + 0.0722 * channel(0)
    }

    @Test fun gameAndNativeDiagnosticsHaveSeparateIconPolicies() {
        val main = activityTheme(".MainActivity")
        val game = activityTheme(".GameActivity")
        assertNotEquals(main, game)
        assertEquals("true", themeItems(main)["android:windowLightStatusBar"])
        assertEquals("false", themeItems(game)["android:windowLightStatusBar"])
        assertTrue(luminance(color(themeItems(main).getValue("android:windowBackground"))) > 0.5)
        assertTrue(luminance(color(themeItems(game).getValue("android:windowBackground"))) < 0.1)
    }

    @Test fun opaqueWindowAndLegacyStatusSurfacesMatchContrastingIcons() {
        for (activity in listOf(".MainActivity", ".GameActivity")) {
            val items = themeItems(activityTheme(activity))
            val window = color(items.getValue("android:windowBackground"))
            val legacy = color(items.getValue("android:statusBarColor"))
            assertEquals(255L, window shr 24)
            assertEquals(window, legacy)
            val lightBackground = items.getValue("android:windowLightStatusBar").toBooleanStrict()
            val surface = luminance(window)
            val contrast = if (lightBackground) (surface + 0.05) / 0.05 else 1.05 / (surface + 0.05)
            assertTrue(contrast >= 4.5, "Status icon design-color contrast is insufficient")
        }
    }

    @Test fun statusThemesKeepNavigationAndEdgeToEdgePolicies() {
        val unrelated = setOf(
            "android:navigationBarColor", "android:windowLightNavigationBar",
            "android:enforceNavigationBarContrast", "android:windowOptOutEdgeToEdgeEnforcement",
            "android:windowFullscreen", "android:windowTranslucentStatus",
            "android:windowLayoutInDisplayCutoutMode",
        )
        for (activity in listOf(".MainActivity", ".GameActivity")) {
            assertFalse(themeItems(activityTheme(activity)).keys.any { it in unrelated })
        }
    }
}
