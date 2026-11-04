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

private fun collect(v: View, out: MutableMap<Animatable, Boolean>, seen: MutableMap<Any, Boolean>, budget: IntArray) {
    if (budget[0]-- <= 0) return
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
    stats.getOrPut("views tracked now") { AtomicInteger() }.set(roots.size)
    val found = IdentityHashMap<Animatable, Boolean>()
    val seen = IdentityHashMap<Any, Boolean>()
    val budget = intArrayOf(600)
    for (root in roots.take(120)) if (root.isAttachedToWindow) collect(root, found, seen, budget)
    stats.getOrPut("animations found now") { AtomicInteger() }.set(found.size)
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
