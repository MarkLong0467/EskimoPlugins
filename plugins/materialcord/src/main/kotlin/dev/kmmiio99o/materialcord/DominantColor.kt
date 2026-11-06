package dev.kmmiio99o.materialcord

import android.graphics.Bitmap
import java.util.Locale

/** Wallpaper is downsampled to this size before colours are counted. */
private const val SAMPLE = 64

/** Pixels darker or lighter than this are decorative noise: black bars, white glare. */
private const val MIN_LUMINANCE = 24
private const val MAX_LUMINANCE = 240

private class Bucket(var count: Int = 0, var r: Long = 0, var g: Long = 0, var b: Long = 0)

internal fun dominantSeed(bitmap: Bitmap): String? {
    if (bitmap.width <= 0 || bitmap.height <= 0) return null
    val scaled = Bitmap.createScaledBitmap(bitmap, SAMPLE, SAMPLE, true)
    try {
        val pixels = IntArray(SAMPLE * SAMPLE)
        scaled.getPixels(pixels, 0, SAMPLE, 0, 0, SAMPLE, SAMPLE)
        return dominantFrom(pixels)
    } finally {
        if (scaled !== bitmap) runCatching { scaled.recycle() }
    }
}

private fun dominantFrom(pixels: IntArray): String? {
    if (pixels.isEmpty()) return null
    val buckets = HashMap<Int, Bucket>()
    var totalR = 0L
    var totalG = 0L
    var totalB = 0L

    for (pixel in pixels) {
        val r = (pixel shr 16) and 0xFF
        val g = (pixel shr 8) and 0xFF
        val b = pixel and 0xFF
        totalR += r
        totalG += g
        totalB += b

        val luminance = (r * 299 + g * 587 + b * 114) / 1000
        if (luminance !in MIN_LUMINANCE..MAX_LUMINANCE) continue

        val key = ((r shr 5) shl 6) or ((g shr 5) shl 3) or (b shr 5)
        val bucket = buckets.getOrPut(key) { Bucket() }
        bucket.count++
        bucket.r += r
        bucket.g += g
        bucket.b += b
    }

    // Monochrome wallpaper: every pixel was too dark or too light to count.
    if (buckets.isEmpty()) {
        val n = pixels.size
        return rgb(totalR / n, totalG / n, totalB / n)
    }

    val best = buckets.values.maxBy { it.count }
    val n = best.count
    return rgb(best.r / n, best.g / n, best.b / n)
}

private fun rgb(r: Long, g: Long, b: Long) = "#%02x%02x%02x".format(Locale.US, r, g, b)
