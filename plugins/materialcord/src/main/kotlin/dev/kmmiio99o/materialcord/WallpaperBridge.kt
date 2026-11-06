package dev.kmmiio99o.materialcord

import android.app.WallpaperColors
import android.app.WallpaperManager
import android.content.Context
import android.graphics.Color
import android.os.Build
import app.valenced.plugins.PluginScope
import app.valenced.xposed.api.registerNativeAsyncMethod
import java.util.Locale

internal object WallpaperBridge {
    @Volatile
    private var appContext: Context? = null

    fun register(scope: PluginScope) {
        scope.withAppContext { appContext = it }
        // Decoding a wallpaper off the bridge thread; JS awaits a promise either way.
        scope.registerNativeAsyncMethod("materialcord.wallpaper") { read() }
    }

    private fun read(): Map<String, Any?>? {
        val context = appContext ?: return null
        return fromWallpaperColors(context) ?: fromBitmap(context)
    }

    /** API 27+ exposes the palette Android itself uses for dynamic colour. */
    private fun fromWallpaperColors(context: Context): Map<String, Any?>? {
        if (Build.VERSION.SDK_INT < 27) return null
        return try {
            val colors = WallpaperManager.getInstance(context)
                .getWallpaperColors(WallpaperManager.FLAG_SYSTEM) ?: return null
            val palette = listOfNotNull(
                hexOf(colors.primaryColor),
                hexOf(colors.secondaryColor),
                hexOf(colors.tertiaryColor),
            )
            val primary = palette.firstOrNull() ?: return null
            result("wallpaperColors", primary, palette)
        } catch (_: Throwable) {
            null
        }
    }

    /** API 24-26, or when the system hands back no palette: count the pixels. */
    private fun fromBitmap(context: Context): Map<String, Any?>? {
        val source = wallpaperBitmap(context) ?: return null
        try {
            val primary = dominantSeed(source.bitmap) ?: return null
            return result("bitmap", primary, listOf(primary))
        } finally {
            if (source.owned) runCatching { source.bitmap.recycle() }
        }
    }

    private fun result(method: String, primary: String, palette: List<String>) =
        mapOf(
            "method" to method,
            "sdk" to Build.VERSION.SDK_INT,
            "dynamic" to (Build.VERSION.SDK_INT >= 31),
            "primary" to primary,
            "colors" to palette,
        )

    private fun hexOf(color: Color?): String? {
        if (color == null) return null
        val argb = try {
            color.toArgb()
        } catch (_: Throwable) {
            return null
        }
        return "#%06x".format(Locale.US, argb and 0xFFFFFF)
    }
}
