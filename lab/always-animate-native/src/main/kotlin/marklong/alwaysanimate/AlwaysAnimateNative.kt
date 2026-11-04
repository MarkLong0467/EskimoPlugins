@file:JvmName("AlwaysAnimateNative")

package marklong.alwaysanimate

import android.graphics.drawable.Animatable
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
private val earsSeen = Collections.synchronizedSet(LinkedHashSet<String>())
private val earsOut = Collections.synchronizedSet(LinkedHashSet<String>())
@Volatile private var intervalMs = 400L
@Volatile private var running = false
@Volatile private var hooked = false
@Volatile private var guardTripped = false
@Volatile private var attachedNow = 0
@Volatile private var lastError = ""
@Volatile private var hookNote = ""
private lateinit var cfgFile: File
private lateinit var guardFile: File

private fun saveCfg() {
    runCatching { cfgFile.writeText("enabled=$animEnabled\nintervalMs=$intervalMs\nearMode=$earMode\n") }
}

private fun loadCfg() {
    runCatching {
        if (cfgFile.isFile) cfgFile.readLines().forEach { line ->
            val (k, v) = line.split("=", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            when (k) {
                "enabled" -> animEnabled = v != "false"
                "intervalMs" -> intervalMs = (v.toLongOrNull() ?: 400L).coerceIn(200L, 3000L)
                "earMode" -> earMode = (v.toIntOrNull() ?: 0).coerceIn(0, 3)
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
                    runCatching { (p.thisObject as? View)?.let { tracked += it }; if (name == "b") binds.incrementAndGet() }
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
    "earMode=$earMode", "earsSeen=${synchronized(earsSeen) { earsSeen.joinToString(" | ") }}", "earsOut=${synchronized(earsOut) { earsOut.joinToString(" | ") }}",
    "attached=$attachedNow", "hook=${hookNote.replace(';', ',')}", "error=${lastError.replace(';', ',')}",
).joinToString(";")

val alwaysAnimateNative = plugin {
    start {
        val scope = this
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
        hooked = false
        tracked.clear()
    }
}
