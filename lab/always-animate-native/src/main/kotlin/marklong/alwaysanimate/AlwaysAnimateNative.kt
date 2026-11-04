@file:JvmName("AlwaysAnimateNative")

package marklong.alwaysanimate

import android.graphics.Canvas
import android.graphics.ColorFilter
import android.graphics.Paint
import android.graphics.PixelFormat
import android.graphics.Rect
import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.io.File
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.Collections
import java.util.WeakHashMap
import java.util.concurrent.atomic.AtomicInteger

/*
 * Always Animate, native part.
 *
 * Discord's native chat draws avatars and decorations ("ears") with Fresco image views, and the pictures are
 * decoded as animations but not kept playing. The chat's MessageView binds each message; we note those views,
 * and a timer on the main thread looks through them for Fresco views whose animation is not running and starts it.
 *
 * Safety: the first thing a start does is write a "starting" mark. If the app dies or hangs before the mark is
 * cleared (20 seconds later), the next launch does not start by itself.
 */
private const val MESSAGE_VIEW = "com.discord.chat.presentation.message.MessageView"

private val tracked: MutableSet<View> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<View, Boolean>()))
private val handler = Handler(Looper.getMainLooper())
private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

private val restarts = AtomicInteger()
private val animatedSeen = AtomicInteger()
private val sweeps = AtomicInteger()
private val binds = AtomicInteger()

@Volatile private var animEnabled = true
@Volatile private var earMode = 0
@Volatile private var earsOn = true
private val earsSeen = Collections.synchronizedSet(LinkedHashSet<String>())
private val earsOut = Collections.synchronizedSet(LinkedHashSet<String>())
@Volatile private var intervalMs = 400L
@Volatile private var running = false
@Volatile private var hooked = false
@Volatile private var guardTripped = false
@Volatile private var attachedNow = 0
@Volatile private var lastError = ""
@Volatile private var hookNote = ""
@Volatile private var scopeRef: PluginScope? = null
private lateinit var cfgFile: File
private lateinit var guardFile: File

private fun saveCfg() {
    runCatching { cfgFile.writeText("enabled=$animEnabled\nintervalMs=$intervalMs\nearMode=$earMode\nears=$earsOn\n") }
}

private fun loadCfg() {
    runCatching {
        if (cfgFile.isFile) cfgFile.readLines().forEach { line ->
            val (k, v) = line.split("=", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            when (k) {
                "enabled" -> animEnabled = v != "false"
                "intervalMs" -> intervalMs = (v.toLongOrNull() ?: 400L).coerceIn(200L, 3000L)
                "earMode" -> earMode = (v.toIntOrNull() ?: 0).coerceIn(0, 3)
                "ears" -> earsOn = v != "false"
            }
        }
    }
}

private fun isDrawee(v: View): Boolean {
    var c: Class<*>? = v.javaClass
    while (c != null) { if (c.name.endsWith("DraweeView")) return true; c = c.superclass }
    return false
}

private var ctrlGetter: java.lang.reflect.Method? = null
private var animGetter: java.lang.reflect.Method? = null

private fun animatableGetter(c: Class<*>) =
    c.methods.firstOrNull { it.parameterCount == 0 && Animatable::class.java.isAssignableFrom(it.returnType) }

/** Fresco keeps the animation in the view's controller. The names are scrambled, so they are found by what they return. */
private fun animationOf(v: View): Animatable? {
    var ctrl: Any? = ctrlGetter?.let { m -> runCatching { m.invoke(v) }.getOrNull() }
    if (ctrl == null) {
        val named = runCatching { v.javaClass.getMethod("getController") }.getOrNull()
        val candidates = listOfNotNull(named) + v.javaClass.methods.filter {
            it.parameterCount == 0 && !it.returnType.isPrimitive && it.returnType != String::class.java &&
                !it.returnType.name.startsWith("android.") && !it.returnType.name.startsWith("java.") && it != named
        }
        for (m in candidates) {
            val r = runCatching { m.invoke(v) }.getOrNull() ?: continue
            if (animatableGetter(r.javaClass) != null) { ctrlGetter = m; ctrl = r; break }
        }
    }
    val c = ctrl ?: return null
    val getter = animGetter?.takeIf { it.declaringClass.isAssignableFrom(c.javaClass) } ?: animatableGetter(c.javaClass)?.also { animGetter = it }
    return getter?.let { m -> runCatching { m.invoke(c) as? Animatable }.getOrNull() }
}

private fun walk(v: View, budget: IntArray) {
    if (budget[0]-- <= 0) return
    if (isDrawee(v)) {
        if (v.width > 0 && v.visibility == View.VISIBLE) {
            val a = animationOf(v)
            if (v.width in 130..160) { earViews.incrementAndGet(); if (a != null) earViewsAnimated.incrementAndGet() }
            if (a != null) {
                animatedSeen.incrementAndGet()
                runCatching { if (!a.isRunning) { a.start(); restarts.incrementAndGet() } }
                    .onFailure { lastError = "start: ${it::class.java.simpleName}: ${it.message}" }
            }
        }
        return
    }
    if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), budget)
}

private fun sweep() {
    sweeps.incrementAndGet()
    val roots = synchronized(tracked) { tracked.toList() }
    var attached = 0
    for (root in roots) {
        if (!root.isAttachedToWindow || root.height <= 0) continue
        attached++
        walk(root, intArrayOf(200))
        scopeRef?.let { sc -> runCatching { ensureEar(sc, root) }.onFailure { lastError = "ears: ${it::class.java.simpleName}: ${it.message}" } }
    }
    attachedNow = attached
}

private val loop = object : Runnable {
    override fun run() {
        if (!running) return
        runCatching { sweep() }.onFailure { lastError = "sweep: ${it::class.java.simpleName}: ${it.message}" }
        handler.postDelayed(this, intervalMs)
    }
}

private fun addQuery(u: String, q: String) = if (u.contains("?")) "$u&$q" else "$u?$q"

/** Ask the picture server for other forms of the ear picture. */
private fun transformEars(u: String): String = when (earMode) {
    1 -> addQuery(u, "format=webp")
    2 -> addQuery(u, "format=webp&animated=true")
    3 -> addQuery(u, "format=gif")
    else -> u
}

private val earFiles = Collections.synchronizedList(mutableListOf<String>())
private val probed = Collections.synchronizedSet(HashSet<String>())
private val earViews = AtomicInteger()
private val earViewsAnimated = AtomicInteger()

private fun kindOf(b: ByteArray, n: Int): String {
    fun has(s: String): Boolean {
        val p = s.toByteArray(Charsets.ISO_8859_1)
        outer@ for (i in 0..(n - p.size)) { for (j in p.indices) if (b[i + j] != p[j]) continue@outer; return true }
        return false
    }
    return when {
        n >= 8 && b[0] == 0x89.toByte() && b[1] == 0x50.toByte() && b[2] == 0x4E.toByte() && b[3] == 0x47.toByte() -> if (has("acTL")) "APNG (animated PNG)" else "PNG (still)"
        n >= 12 && has("RIFF") && has("WEBP") -> if (has("ANIM")) "animated WebP" else "WebP (still)"
        n >= 4 && b[0] == 'G'.code.toByte() && b[1] == 'I'.code.toByte() && b[2] == 'F'.code.toByte() -> "GIF"
        else -> "unknown (${(0 until minOf(n, 8)).joinToString(" ") { "%02x".format(b[it]) }})"
    }
}

/** Downloads the start of an ear picture and says what kind of file it is. */
private fun probeEar(url: String) {
    if (probed.size >= 3 || !probed.add(url)) return
    Thread {
        for ((label, accept) in listOf("default" to null, "asks for webp" to "image/webp,image/*;q=0.8")) {
            val line = runCatching {
                val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 6000; conn.readTimeout = 6000
                accept?.let { conn.setRequestProperty("Accept", it) }
                conn.setRequestProperty("Range", "bytes=0-8191")
                val code = conn.responseCode
                val type = conn.contentType
                val buf = ByteArray(8192)
                var n = 0
                conn.inputStream.use { s -> while (n < buf.size) { val r = s.read(buf, n, buf.size - n); if (r < 0) break; n += r } }
                "$label: http $code, ${type ?: "no type"}, ${kindOf(buf, n)}"
            }.getOrElse { "$label: ${it::class.java.simpleName}: ${it.message}" }
            earFiles += line
        }
    }.start()
}


// ---------------------------------------------------------------------------------------------------------------
// Ears are APNG (animated PNG). Fresco cannot play them, so they are decoded with the decoder that is in Discord
// (com.linecorp.apng) and drawn over the still ear.
// ---------------------------------------------------------------------------------------------------------------
private class DecodedApng(val apng: Any, val frames: Int, val durations: IntArray, val width: Int, val height: Int, val drawMethod: java.lang.reflect.Method)

private val apngCache = Collections.synchronizedMap(object : LinkedHashMap<String, DecodedApng>(16, 0.75f, true) {
    override fun removeEldestEntry(eldest: MutableMap.MutableEntry<String, DecodedApng>?) = size > 10
})
private val apngLoading = Collections.synchronizedSet(HashSet<String>())
private val apngFailed = Collections.synchronizedSet(HashSet<String>())
private val earUrls = Collections.synchronizedMap(WeakHashMap<View, String?>())
private val earStates = WeakHashMap<View, EarState>()
@Volatile private var earApngNote = "not tried yet"
private val earOverlays = AtomicInteger()
private val earDecoded = AtomicInteger()

private class ApngOverlay(private val decoded: DecodedApng, private val apng: Any) : Drawable() {
    private var frame = 0
    private var active = false
    private val paint = Paint(Paint.FILTER_BITMAP_FLAG or Paint.ANTI_ALIAS_FLAG)
    private val src = Rect(0, 0, decoded.width, decoded.height)
    private val step = Runnable {
        if (!active) return@Runnable
        frame = (frame + 1) % decoded.frames
        invalidateSelf()
        scheduleNext()
    }
    private fun scheduleNext() {
        val ms = decoded.durations.getOrElse(frame) { 40 }.coerceAtLeast(20)
        scheduleSelf(step, SystemClock.uptimeMillis() + ms)
    }
    fun start() { if (!active) { active = true; scheduleNext() } }
    fun stop() { active = false; unscheduleSelf(step) }
    override fun draw(canvas: Canvas) {
        runCatching { decoded.drawMethod.invoke(apng, frame, canvas, src, Rect(bounds), paint) }
            .onFailure { lastError = "ear draw: ${it.cause?.javaClass?.simpleName ?: it::class.java.simpleName}: ${(it.cause ?: it).message}" }
    }
    override fun setAlpha(alpha: Int) { paint.alpha = alpha }
    override fun setColorFilter(cf: ColorFilter?) { paint.colorFilter = cf }
    @Deprecated("Deprecated in Java") override fun getOpacity() = PixelFormat.TRANSLUCENT
}

private class EarState(val url: String, val ear: View, val parent: ViewGroup, val overlay: ApngOverlay) {
    fun release() {
        runCatching { overlay.stop(); parent.overlay.remove(overlay); ear.alpha = 1f; earOverlays.decrementAndGet() }
    }
}

private fun decodeApng(loader: ClassLoader, bytes: ByteArray): DecodedApng {
    val cls = loader.loadClass("com.linecorp.apng.decoder.Apng")
    val companion = cls.getField("Companion").get(null)
    val decode = companion.javaClass.methods.first { it.name == "decode" && it.parameterCount == 3 && it.parameterTypes[0] == java.io.InputStream::class.java }
    var apng: Any? = null
    var lastFail: Throwable? = null
    for ((a, b) in listOf(false to false, true to false, false to true, true to true)) {
        try { apng = decode.invoke(companion, ByteArrayInputStream(bytes), a, b); if (apng != null) break } catch (e: Throwable) { lastFail = e.cause ?: e }
    }
    val a = apng ?: throw IllegalStateException("decode failed: ${lastFail?.javaClass?.simpleName}: ${lastFail?.message}")
    val frames = a.javaClass.getMethod("getFrameCount").invoke(a) as Int
    @Suppress("UNCHECKED_CAST") val durations = (a.javaClass.getMethod("getFrameDurations").invoke(a) as IntArray)
    val w = a.javaClass.getMethod("getWidth").invoke(a) as Int
    val h = a.javaClass.getMethod("getHeight").invoke(a) as Int
    val draw = a.javaClass.methods.first { it.name == "drawWithIndex" && it.parameterCount == 5 }
    return DecodedApng(a, frames, durations, w, h, draw)
}

private fun fetchBytes(url: String): ByteArray {
    val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
    conn.connectTimeout = 8000; conn.readTimeout = 10000
    val out = ByteArrayOutputStream()
    conn.inputStream.use { s -> val buf = ByteArray(16384); while (true) { val r = s.read(buf); if (r < 0) break; out.write(buf, 0, r); if (out.size() > 4_000_000) throw IllegalStateException("file too large") } }
    return out.toByteArray()
}

private fun startDownload(scope: PluginScope, url: String) {
    if (apngFailed.contains(url) || apngCache.containsKey(url) || !apngLoading.add(url)) return
    val loader = scope.classLoader
    Thread {
        try {
            val bytes = fetchBytes(url)
            val d = decodeApng(loader, bytes)
            apngCache[url] = d
            earDecoded.incrementAndGet()
            earApngNote = "decoded ${d.frames} frames ${d.width}x${d.height} (${bytes.size / 1024} KB)"
        } catch (e: Throwable) {
            apngFailed += url
            val c = e.cause ?: e
            earApngNote = "failed: ${c.javaClass.simpleName}: ${c.message}".take(160)
        } finally { apngLoading.remove(url) }
    }.start()
}

private fun findEar(mv: View): View? {
    if (mv !is ViewGroup) return null
    for (i in 0 until mv.childCount) {
        val c = mv.getChildAt(i)
        if (isDrawee(c) && c.width in 130..160) return c
    }
    return null
}

private fun earBind(mv: View, message: Any?) {
    val url = message?.let { runCatching { it.javaClass.getMethod("getAvatarDecorationURL").invoke(it) as? String }.getOrNull() }
    earUrls[mv] = url
    val st = earStates[mv]
    if (st != null && st.url != url) { st.release(); earStates.remove(mv) }
}

private fun ensureEar(scope: PluginScope, mv: View) {
    val st = earStates[mv]
    val url = earUrls[mv]
    val ear = findEar(mv)
    if (!earsOn || url == null || ear == null || ear.visibility != View.VISIBLE) { if (st != null) { st.release(); earStates.remove(mv) }; return }
    if (animationOf(ear) != null) { if (st != null) { st.release(); earStates.remove(mv) }; return } // Fresco plays this one itself
    if (st != null && st.url == url && st.ear === ear) {
        st.overlay.setBounds(ear.left, ear.top, ear.right, ear.bottom)
        return
    }
    if (st != null) { st.release(); earStates.remove(mv) }
    val decoded = apngCache[url]
    if (decoded == null) { startDownload(scope, url); return }
    val parent = ear.parent as? ViewGroup ?: return
    val own = runCatching { decoded.apng.javaClass.getMethod("copy").invoke(decoded.apng) }.getOrNull() ?: decoded.apng
    val overlay = ApngOverlay(decoded, own)
    overlay.setBounds(ear.left, ear.top, ear.right, ear.bottom)
    parent.overlay.add(overlay)
    ear.alpha = 0f
    overlay.start()
    earOverlays.incrementAndGet()
    earStates[mv] = EarState(url, ear, parent, overlay)
}

private fun hookEars(scope: PluginScope) {
    val c = runCatching { scope.classLoader.loadClass("com.discord.chat.bridge.Message") }.getOrNull() ?: return
    c.declaredMethods.filter { it.name == "getAvatarDecorationURL" && it.parameterCount == 0 }.forEach { m ->
        unhooks += XposedBridge.hookMethod(m, object : XC_MethodHook() {
            override fun afterHookedMethod(p: MethodHookParam) {
                val u = p.result as? String ?: return
                if (earsSeen.size < 4) earsSeen += u.substringAfter("://").take(150)
                runCatching { probeEar(u) }
                if (earMode != 0) {
                    val out = transformEars(u)
                    if (out != u) {
                        p.result = out
                        if (earsOut.size < 4) earsOut += out.substringAfter("://").take(150)
                    }
                }
            }
        })
    }
}

private fun hookChat(scope: PluginScope) {
    runCatching { hookEars(scope) }
    val c = runCatching { scope.classLoader.loadClass(MESSAGE_VIEW) }.getOrNull()
    if (c == null) { hookNote = "Discord's chat view was not found (Discord changed?)"; return }
    var n = 0
    for (name in listOf("b", "f")) {
        c.declaredMethods.filter { it.name == name && !it.isBridge && !it.isSynthetic }.forEach { m ->
            unhooks += XposedBridge.hookMethod(m, object : XC_MethodHook() {
                override fun afterHookedMethod(p: MethodHookParam) {
                    runCatching { (p.thisObject as? View)?.let { tracked += it }; if (name == "b") { binds.incrementAndGet(); (p.thisObject as? View)?.let { mv -> earBind(mv, p.args?.firstOrNull()) } } }
                }
            })
            n++
        }
    }
    hookNote = if (n == 0) "Discord's chat view changed: nothing to hook" else "hooked $n place(s) in the chat view"
}

private fun begin(scope: PluginScope) {
    if (running) return
    runCatching {
        runCatching { guardFile.writeText("starting") }
        if (!hooked) { hookChat(scope); hooked = true }
        running = true
        handler.post(loop)
        handler.postDelayed({ runCatching { guardFile.delete() } }, 20_000L)
    }.onFailure { lastError = "start: ${it::class.java.simpleName}: ${it.message}"; running = false }
}

private fun state(): String = listOf(
    "enabled=$animEnabled", "running=$running", "guardTripped=$guardTripped", "intervalMs=$intervalMs",
    "restarts=${restarts.get()}", "animated=${animatedSeen.get()}", "binds=${binds.get()}", "sweeps=${sweeps.get()}",
    "earViews=${earViews.get()}", "earViewsAnimated=${earViewsAnimated.get()}",
    "earFiles=${synchronized(earFiles) { earFiles.joinToString(" || ") }.replace(';', ',')}",
    "ears=$earsOn", "earOverlays=${earOverlays.get()}", "earDecoded=${earDecoded.get()}", "earApng=${earApngNote.replace(';', ',')}",
    "earMode=$earMode", "earsSeen=${synchronized(earsSeen) { earsSeen.joinToString(" | ") }}", "earsOut=${synchronized(earsOut) { earsOut.joinToString(" | ") }}",
    "attached=$attachedNow", "hook=${hookNote.replace(';', ',')}", "error=${lastError.replace(';', ',')}",
).joinToString(";")

val alwaysAnimateNative = plugin {
    start {
        val scope = this
        scopeRef = scope
        cfgFile = File(storageDir, "always-animate-native.cfg")
        guardFile = File(storageDir, "always-animate-native.guard")
        loadCfg()
        if (guardFile.isFile) { guardTripped = true; runCatching { guardFile.delete() } }

        registerNativeMethod("marklong.always-animate.state") { state() }
        registerNativeMethod("marklong.always-animate.set") { args ->
            val key = args.getOrNull(0)?.toString()
            val value = args.getOrNull(1)?.toString().orEmpty()
            when (key) {
                "enabled" -> {
                    animEnabled = value == "true"; saveCfg()
                    if (animEnabled) { guardTripped = false; handler.post { begin(scope) } } else running = false
                }
                "intervalMs" -> { intervalMs = (value.toLongOrNull() ?: 400L).coerceIn(200L, 3000L); saveCfg() }
                "ears" -> { earsOn = value == "true"; saveCfg() }
                "earMode" -> { earMode = (value.toIntOrNull() ?: 0).coerceIn(0, 3); earsOut.clear(); saveCfg() }
                "start" -> { guardTripped = false; handler.post { begin(scope) } }
            }
            state()
        }

        // Start a few seconds after launch, unless the last start did not survive.
        if (animEnabled && !guardTripped) handler.postDelayed({ begin(scope) }, 4_000L)
    }
    stop {
        running = false
        unhooks.forEach { runCatching { it.unhook() } }
        unhooks.clear()
        synchronized(earStates) { earStates.values.toList().forEach { it.release() }; earStates.clear() }
        hooked = false
        tracked.clear()
    }
}
