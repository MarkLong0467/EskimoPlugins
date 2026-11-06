package dev.kmmiio99o.materialcord

import android.app.WallpaperManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.drawable.BitmapDrawable
import android.graphics.drawable.Drawable
import android.os.Build
import java.io.FileInputStream

/** A wallpaper bitmap plus whether we decoded it and therefore own it. */
internal class WallpaperBitmap(val bitmap: Bitmap, val owned: Boolean)

internal fun wallpaperBitmap(context: Context): WallpaperBitmap? {
    val manager = WallpaperManager.getInstance(context)
    if (Build.VERSION.SDK_INT >= 26) {
        val descriptor = runCatching {
            manager.getWallpaperFile(WallpaperManager.FLAG_SYSTEM)
        }.getOrNull()
        if (descriptor != null) {
            val bitmap = descriptor.use { desc ->
                runCatching {
                    FileInputStream(desc.fileDescriptor).use { BitmapFactory.decodeStream(it) }
                }.getOrNull()
            }
            if (bitmap != null) return WallpaperBitmap(bitmap, true)
        }
    }
    return drawableBitmap(manager)
}

/** Fallback for wallpapers the file API cannot expose: draw the drawable. */
@Suppress("DEPRECATION")
private fun drawableBitmap(manager: WallpaperManager): WallpaperBitmap? {
    val drawable: Drawable = runCatching { manager.drawable }.getOrNull() ?: return null
    if (drawable is BitmapDrawable) return WallpaperBitmap(drawable.bitmap, false)

    val width = drawable.intrinsicWidth
    val height = drawable.intrinsicHeight
    if (width <= 0 || height <= 0) return null
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    drawable.setBounds(0, 0, width, height)
    drawable.draw(Canvas(bitmap))
    return WallpaperBitmap(bitmap, true)
}
