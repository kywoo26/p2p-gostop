package com.kywoo26.p2pgostop.share

import android.content.ContentProvider
import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.MatrixCursor
import android.net.Uri
import android.os.ParcelFileDescriptor
import android.provider.OpenableColumns
import com.kywoo26.p2pgostop.BuildConfig
import java.io.File
import java.io.FileNotFoundException

/**
 * 로그 파일을 공유 시트로 넘기는 읽기 전용 ContentProvider (spec FR-30, M0 리뷰 L-2).
 *
 * androidx.core `FileProvider`와 같은 역할을 하되 의존성을 늘리지 않으려고 필요한 부분만 구현했다
 * (plan.md 1.8 표 밖 의존성 추가 금지). `exported=false` + `grantUriPermissions=true`라서
 * 공유 인텐트의 `FLAG_GRANT_READ_URI_PERMISSION`으로 받은 앱만, `cacheDir/shared_logs/`의 파일만 읽을 수 있다.
 * 받는 앱이 이름·크기를 물으면 `OpenableColumns`(DISPLAY_NAME, SIZE)로 답한다.
 */
class LogShareProvider : ContentProvider() {

    override fun onCreate(): Boolean = true

    override fun getType(uri: Uri): String = "text/plain"

    override fun openFile(uri: Uri, mode: String): ParcelFileDescriptor {
        if (mode != "r") throw SecurityException("읽기 전용: $mode")
        val f = fileFor(uri) ?: throw FileNotFoundException(uri.toString())
        return ParcelFileDescriptor.open(f, ParcelFileDescriptor.MODE_READ_ONLY)
    }

    override fun query(
        uri: Uri,
        projection: Array<out String>?,
        selection: String?,
        selectionArgs: Array<out String>?,
        sortOrder: String?,
    ): Cursor? {
        val f = fileFor(uri) ?: return null
        val cols = (projection ?: arrayOf(OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE))
            .filter { it == OpenableColumns.DISPLAY_NAME || it == OpenableColumns.SIZE }
            .toTypedArray()
        return MatrixCursor(cols, 1).apply {
            addRow(cols.map { if (it == OpenableColumns.DISPLAY_NAME) f.name else f.length() })
        }
    }

    override fun insert(uri: Uri, values: ContentValues?): Uri? = throw UnsupportedOperationException()

    override fun delete(uri: Uri, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()

    override fun update(uri: Uri, values: ContentValues?, selection: String?, selectionArgs: Array<out String>?): Int =
        throw UnsupportedOperationException()

    private fun fileFor(uri: Uri): File? {
        if (uri.authority != AUTHORITY) return null
        val name = uri.pathSegments.singleOrNull() ?: return null
        if (!LogShareFiles.isValidName(name)) return null
        val f = File(dir(requireContext()), name)
        return f.takeIf { it.isFile }
    }

    companion object {
        const val AUTHORITY = "${BuildConfig.APPLICATION_ID}.logshare"

        private fun dir(ctx: Context) = File(ctx.cacheDir, LogShareFiles.DIR)

        /** 이전 공유 파일을 지우고 새 파일을 쓴 뒤 content URI를 돌려준다. 메인 스레드에서 불러도 될 만큼 작다(수백 KB). */
        fun write(ctx: Context, name: String, text: String): Uri {
            require(LogShareFiles.isValidName(name)) { "잘못된 파일 이름: $name" }
            val d = dir(ctx)
            d.mkdirs()
            d.listFiles()?.forEach { it.delete() }
            File(d, name).writeText(text, Charsets.UTF_8)
            return Uri.Builder().scheme("content").authority(AUTHORITY).appendPath(name).build()
        }
    }
}
