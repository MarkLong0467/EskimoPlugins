@file:JvmName("ChatAnimator")

package marklong.chatanimator

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
 * Chat Animator.
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

@Volatile private var enabled = true
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
    runCatching { cfgFile.writeText("enabled=$enabled\nintervalMs=$intervalMs\n") }
}

private fun loadCfg() {
    runCatching {
        if (cfgFile.isFile) cfgFile.readLines().forEach { line ->
            val (k, v) = line.split("=", limit = 2).let { it[0] to it.getOrElse(1) { "" } }
            when (k) {
                "enabled" -> enabled = v != "false"
                "intervalMs" -> intervalMs = (v.toLongOrNull() ?: 400L).coerceIn(200L, 3000L)
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

private fun hookChat(scope: PluginScope) {
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
    "enabled=$enabled", "running=$running", "guardTripped=$guardTripped", "intervalMs=$intervalMs",
    "restarts=${restarts.get()}", "animated=${animatedSeen.get()}", "binds=${binds.get()}", "sweeps=${sweeps.get()}",
    "attached=$attachedNow", "hook=${hookNote.replace(';', ',')}", "error=${lastError.replace(';', ',')}",
).joinToString(";")

val chatAnimator = plugin {
    start {
        val scope = this
        cfgFile = File(storageDir, "chat-animator.cfg")
        guardFile = File(storageDir, "chat-animator.guard")
        loadCfg()
        if (guardFile.isFile) { guardTripped = true; runCatching { guardFile.delete() } }

        registerNativeMethod("marklong.chat-animator.state") { state() }
        registerNativeMethod("marklong.chat-animator.set") { args ->
            val key = args.getOrNull(0)?.toString()
            val value = args.getOrNull(1)?.toString().orEmpty()
            when (key) {
                "enabled" -> {
                    enabled = value == "true"; saveCfg()
                    if (enabled) { guardTripped = false; handler.post { begin(scope) } } else running = false
                }
                "intervalMs" -> { intervalMs = (value.toLongOrNull() ?: 400L).coerceIn(200L, 3000L); saveCfg() }
                "start" -> { guardTripped = false; handler.post { begin(scope) } }
            }
            state()
        }

        // Start a few seconds after launch, unless the last start did not survive.
        if (enabled && !guardTripped) handler.postDelayed({ begin(scope) }, 4_000L)
    }
    stop {
        running = false
        unhooks.forEach { runCatching { it.unhook() } }
        unhooks.clear()
        hooked = false
        tracked.clear()
    }
}
