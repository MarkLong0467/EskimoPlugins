@file:JvmName("AvatarLab")

package marklong.avatarlab

import android.graphics.drawable.Animatable
import android.graphics.drawable.Drawable
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.lang.reflect.Modifier
import java.util.Collections
import java.util.IdentityHashMap
import java.util.WeakHashMap
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

/**
 * Avatar Fix test.
 * The chat's own code (MessageView.b / .f and v50.l.w) binds avatars. We note every view it touches, then
 * a timer on the main thread looks through those views for animated pictures and starts any that are not running.
 */
private val HOOK_TARGETS = listOf(
    "com.discord.chat.presentation.message.MessageView" to "b",
    "com.discord.chat.presentation.message.MessageView" to "f",
    "v50.l" to "w",
)
private val OWN_PACKAGES = listOf("com.discord", "v50.", "f9.", "kn.", "hc.", "ij.", "pj.")

private val tracked: MutableSet<View> = Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<View, Boolean>()))
private val stats = ConcurrentHashMap<String, AtomicInteger>()
private val notes = Collections.synchronizedList(mutableListOf<String>())
private val classesSeen = Collections.synchronizedSet(LinkedHashSet<String>())
private val unhooks = mutableListOf<XC_MethodHook.Unhook>()
private val handler = Handler(Looper.getMainLooper())
@Volatile private var running = false
@Volatile private var lastTree: String? = null
@Volatile private var lastTreeAt = 0L
@Volatile private var started = false

private fun bump(key: String) = stats.getOrPut(key) { AtomicInteger() }.incrementAndGet()

private fun hookTargets(scope: PluginScope) {
    for ((className, method) in HOOK_TARGETS) {
        val c = runCatching { scope.classLoader.loadClass(className) }.getOrNull()
        if (c == null) { notes += "no class $className"; continue }
        var n = 0
        c.declaredMethods.filter { it.name == method && !it.isBridge && !it.isSynthetic }.forEach { m ->
            val key = "${c.simpleName}.$method"
            unhooks += XposedBridge.hookMethod(m, object : XC_MethodHook() {
                override fun afterHookedMethod(p: MethodHookParam) {
                    runCatching {
                        bump("$key calls")
                        (p.thisObject as? View)?.let { tracked += it }
                        p.args?.forEach { a -> if (a is View) tracked += a }
                        if (stats["$key calls"]?.get() == 1) {
                            notes += "first call of $key: this=${p.thisObject?.javaClass?.name}; args=" +
                                (p.args?.joinToString { it?.javaClass?.name ?: "null" } ?: "-")
                        }
                    }
                }
            })
            n++
        }
        notes += "$className.$method: hooked $n"
        if (c.simpleName == "l") {
            c.declaredMethods.filter { it.name == method }.forEach {
                notes += "  signature ${it.returnType.simpleName} ${it.name}(${it.parameterTypes.joinToString { p -> p.name }}) static=${Modifier.isStatic(it.modifiers)}"
            }
        }
    }
}

private fun addDrawable(d: Drawable?, out: MutableMap<Animatable, Boolean>, depth: Int = 0) {
    if (d == null || depth > 4) return
    if (d is Animatable) { out[d] = true; classesSeen += d.javaClass.name }
    val current = runCatching { d.current }.getOrNull()
    if (current != null && current !== d) addDrawable(current, out, depth + 1)
    if (d is android.graphics.drawable.LayerDrawable) for (i in 0 until d.numberOfLayers) addDrawable(d.getDrawable(i), out, depth + 1)
}

private fun addObject(o: Any?, out: MutableMap<Animatable, Boolean>, seen: MutableMap<Any, Boolean>, depth: Int) {
    if (o == null || depth < 0 || seen.put(o, true) != null) return
    if (o is Drawable) { addDrawable(o, out); return }
    if (o is Animatable) { out[o] = true; classesSeen += o.javaClass.name }
    if (o is View) return
    val name = o.javaClass.name
    if (OWN_PACKAGES.none { name.startsWith(it) }) return
    var c: Class<*>? = o.javaClass
    while (c != null && c != Any::class.java && !c.name.startsWith("android.")) {
        for (f in c.declaredFields) {
            if (Modifier.isStatic(f.modifiers) || f.type.isPrimitive) continue
            runCatching { f.isAccessible = true; addObject(f.get(o), out, seen, depth - 1) }
        }
        c = c.superclass
    }
}

private val draweeLines = Collections.synchronizedMap(LinkedHashMap<String, String>())

private fun isDrawee(v: View): Boolean {
    var c: Class<*>? = v.javaClass
    while (c != null) { if (c.name == "com.facebook.drawee.view.DraweeView") return true; c = c.superclass }
    return false
}

/** Fresco keeps the running animation in the view's controller, not in the drawable. */
private fun draweeAnimatable(v: View): Pair<String, Animatable?> {
    val ctrl = runCatching { v.javaClass.getMethod("getController").invoke(v) }.getOrNull() ?: return "no controller" to null
    val m = ctrl.javaClass.methods.firstOrNull { it.parameterCount == 0 && Animatable::class.java.isAssignableFrom(it.returnType) }
    val a = m?.let { runCatching { it.invoke(ctrl) as? Animatable }.getOrNull() }
    return "${ctrl.javaClass.name}${if (m == null) " (no animatable getter)" else ""}" to a
}

private fun collect(v: View, out: MutableMap<Animatable, Boolean>, seen: MutableMap<Any, Boolean>, budget: IntArray) {
    if (budget[0]-- <= 0) return
    if (isDrawee(v) && v.width > 0) runCatching {
        val (ctrl, a) = draweeAnimatable(v)
        bump("drawee views seen")
        if (a != null) { out[a] = true; classesSeen += a.javaClass.name; bump("drawee with animation") }
        else if (v.width >= 100) bump("drawee big without animation")
        draweeLines["${v.width}x${v.height} #${System.identityHashCode(v) % 1000}"] =
            "controller=$ctrl; animation=${a?.javaClass?.name ?: "none"}${if (a != null) " running=" + a.isRunning else ""}"
    }
    runCatching {
        (v as? ImageView)?.let { addDrawable(it.drawable, out) }
        addDrawable(v.background, out)
        if (android.os.Build.VERSION.SDK_INT >= 23) addDrawable(v.foreground, out)
        // The chat's own views keep their pictures in fields.
        addObject(v, out, seen, 3)
        var c: Class<*>? = v.javaClass
        while (c != null && !c.name.startsWith("android.")) {
            for (f in c.declaredFields) {
                if (Modifier.isStatic(f.modifiers) || f.type.isPrimitive) continue
                runCatching { f.isAccessible = true; addObject(f.get(v), out, seen, 3) }
            }
            c = c.superclass
        }
    }
    if (v is ViewGroup) for (i in 0 until v.childCount) collect(v.getChildAt(i), out, seen, budget)
}

private fun sweep() {
    val roots = synchronized(tracked) { tracked.toList() }
    bump("sweeps")
    if (roots.any { it.isAttachedToWindow }) draweeLines.clear()
    stats.getOrPut("views tracked now") { AtomicInteger() }.set(roots.size)
    val found = IdentityHashMap<Animatable, Boolean>()
    val seen = IdentityHashMap<Any, Boolean>()
    val budget = intArrayOf(600)
    var attached = 0
    for (root in roots.take(120)) if (root.isAttachedToWindow) { attached++; collect(root, found, seen, budget) }
    stats.getOrPut("attached views now") { AtomicInteger() }.set(attached)
    stats.getOrPut("animations found now") { AtomicInteger() }.set(found.size)
    if (found.size > (stats["animations found at most"]?.get() ?: 0)) stats.getOrPut("animations found at most") { AtomicInteger() }.set(found.size)
    // Snapshot of a chat message while the chat is on screen, so the report is right even when read from settings.
    val now = System.currentTimeMillis()
    if (now - lastTreeAt > 3000) {
        val msg = roots.firstOrNull { it.javaClass.name.endsWith("MessageView") && it.isAttachedToWindow && it.height > 0 }
        if (msg != null) { lastTree = describeTree(msg); lastTreeAt = now; bump("tree snapshots") }
    }
    for (a in found.keys) {
        runCatching {
            if (!a.isRunning) { a.start(); bump("restarted") } else bump("already running")
        }.onFailure { bump("errors"); notes += "start failed: ${it::class.java.simpleName}: ${it.message}" }
    }
}

private val loop = object : Runnable {
    override fun run() {
        if (!running) return
        runCatching { sweep() }.onFailure { bump("errors"); if (notes.size < 40) notes += "sweep error: ${it::class.java.simpleName}: ${it.message}" }
        handler.postDelayed(this, 400)
    }
}


/** Lists the views inside one chat message, with what they hold, so the avatar can be recognised. */
private fun describeTree(root: View): String {
    val sb = StringBuilder()
    var count = 0
    fun walk(v: View, depth: Int) {
        if (count++ > 70) return
        sb.append("  ".repeat(depth)).append(v.javaClass.name).append(" ${v.width}x${v.height}")
        if (v.visibility != View.VISIBLE) sb.append(" hidden")
        runCatching { (v as? ImageView)?.drawable?.let { sb.append(" drawable=").append(it.javaClass.name) } }
        sb.append('\n')
        if (!v.javaClass.name.startsWith("android.")) {
            val fields = mutableListOf<String>()
            var c: Class<*>? = v.javaClass
            while (c != null && !c.name.startsWith("android.") && fields.size < 16) {
                for (f in c.declaredFields) {
                    if (Modifier.isStatic(f.modifiers) || f.type.isPrimitive) continue
                    val tn = f.type.name
                    if (Regex("(?i)drawable|image|bitmap|fresco|anim|controller|avatar|loader|source|gif|apng|lottie|movie").containsMatchIn(tn + f.name)) {
                        val v2 = runCatching { f.isAccessible = true; f.get(v) }.getOrNull()
                        fields += "${f.name}:${tn.substringAfterLast('.')}${if (v2 != null) "=" + v2.javaClass.name else "=null"}"
                    }
                }
                c = c.superclass
            }
            if (fields.isNotEmpty()) sb.append("  ".repeat(depth + 1)).append("[").append(fields.take(16).joinToString("; ")).append("]\n")
        }
        if (v is ViewGroup) for (i in 0 until v.childCount) walk(v.getChildAt(i), depth + 1)
    }
    runCatching { walk(root, 0) }.onFailure { sb.append("tree error: ${it::class.java.simpleName}: ${it.message}\n") }
    return sb.toString()
}

val avatarLab = plugin {
    // Nothing runs at startup. The button below starts it.
    start {
        registerNativeMethod("marklong.avatar-lab.go") {
            if (!started) {
                started = true
                runCatching { hookTargets(this) }.onFailure { notes += "hook error: ${it::class.java.name}: ${it.message}" }
            }
            if (!running) { running = true; handler.post(loop) }
            "running"
        }
        registerNativeMethod("marklong.avatar-lab.stop") { running = false; "stopped" }
        registerNativeMethod("marklong.avatar-lab.report") {
            buildString {
                append("running=$running\n## counts\n")
                stats.entries.sortedBy { it.key }.forEach { append("  ${it.key}: ${it.value.get()}\n") }
                append("## animated picture classes found\n")
                synchronized(classesSeen) { classesSeen.forEach { append("  $it\n") } }
                append("## fresco views on screen (latest sweep)\n")
                synchronized(draweeLines) { draweeLines.entries.take(24).forEach { append("  ${it.key}: ${it.value}\n") } }
                append("## tree of one chat message\n")
                append(lastTree ?: "  no chat message was on screen yet. Tap Start, open a chat, scroll it, then come back.\n")
                append("## hooks and first calls\n")
                synchronized(notes) { notes.take(40).forEach { append("  $it\n") } }
            }
        }
    }
    stop {
        running = false
        unhooks.forEach { runCatching { it.unhook() } }
        unhooks.clear()
        started = false
        tracked.clear()
    }
}
