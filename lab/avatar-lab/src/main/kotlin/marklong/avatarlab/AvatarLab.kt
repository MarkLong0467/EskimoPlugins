@file:JvmName("AvatarLab")

package marklong.avatarlab

import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeAsyncMethod
import app.valenced.xposed.api.registerNativeMethod
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger
import org.luckypray.dexkit.query.enums.StringMatchType

private val NAME_WORDS = listOf(
    "avatar", "Avatar", "decoration", "Decoration", "chat.presentation", "MessageView", "ChatView", "ChatList",
    "Playback", "AutoPlay", "Autoplay", "Animat", "Gif", "Fresco", "Drawable",
)
private val ROW_STRINGS = listOf("avatarURL", "avatarDecorationURL", "gifAutoPlay", "animateEmoji", "isCurrentUserMessageAuthor", "usernameColor")
private const val FAST_IMAGE = "com.discord.image.fast_image.react.FastImageViewManager"
private const val APNG_DECORATION = "com.discord.avatar.react.APNGDecorationViewManager"

private val hits = ConcurrentHashMap<String, AtomicInteger>()
private val unhooks = mutableListOf<XC_MethodHook.Unhook>()

private fun dump(c: Class<*>, limit: Int = 45): String {
    val sb = StringBuilder("\n").append(c.name).append(" extends ").append(c.superclass?.name).append('\n')
    c.declaredFields.take(40).forEach { sb.append("  field ").append(it.type.simpleName).append(' ').append(it.name).append('\n') }
    if (c.isEnum) sb.append("  constants: ").append(c.enumConstants.joinToString()).append('\n')
    c.declaredMethods.sortedBy { it.name }.take(limit).forEach { m ->
        sb.append("  ").append(m.returnType.simpleName).append(' ').append(m.name).append('(')
            .append(m.parameterTypes.joinToString { it.simpleName }).append(")\n")
    }
    return sb.toString()
}

/** Forces a boolean argument of every overload of [method] to [value], and counts how often it ran. */
private fun force(scope: PluginScope, className: String, method: String, index: Int, value: Boolean, notes: MutableList<String>) {
    val c = runCatching { scope.classLoader.loadClass(className) }.getOrNull()
    if (c == null) { notes += "no class $className"; return }
    var n = 0
    c.declaredMethods.filter {
        it.name == method && it.parameterCount == index + 1 && it.parameterTypes[index] == Boolean::class.javaPrimitiveType
    }.forEach { m ->
        val key = "${c.simpleName}.$method(${m.parameterTypes.first().simpleName}..)"
        hits.getOrPut(key) { AtomicInteger() }
        unhooks += XposedBridge.hookMethod(m, object : XC_MethodHook() {
            override fun beforeHookedMethod(p: MethodHookParam) {
                val was = p.args[index] as? Boolean
                if (was != value) hits.getValue("$key changed").incrementAndGet()
                hits.getValue(key).incrementAndGet()
                p.args[index] = value
            }
        })
        hits.getOrPut("$key changed") { AtomicInteger() }
        n++
    }
    notes += "$className.$method: hooked $n overload(s)"
}


private val callers = ConcurrentHashMap<String, MutableSet<String>>()
@Volatile private var blockStops = false

/** Counts calls to every overload of [method], notes who called it, and optionally cancels the call. */
private fun watch(scope: PluginScope, className: String, method: String, cancel: Boolean, notes: MutableList<String>) {
    val c = runCatching { scope.classLoader.loadClass(className) }.getOrNull()
    if (c == null) { notes += "no class $className"; return }
    var n = 0
    c.declaredMethods.filter { it.name == method && !it.isBridge && !it.isSynthetic }.forEach { m ->
        val key = "${c.simpleName}.$method"
        hits.getOrPut(key) { AtomicInteger() }
        if (cancel) hits.getOrPut("$key cancelled") { AtomicInteger() }
        unhooks += XposedBridge.hookMethod(m, object : XC_MethodHook() {
            override fun beforeHookedMethod(p: MethodHookParam) {
                hits.getValue(key).incrementAndGet()
                val set = callers.getOrPut(key) { java.util.Collections.synchronizedSet(LinkedHashSet()) }
                if (set.size < 10) {
                    val frame = Throwable().stackTrace.drop(3).firstOrNull { !it.className.startsWith("com.facebook") && !it.className.startsWith("android.") && !it.className.startsWith("java.") && !it.className.startsWith("de.robv") }
                    if (frame != null) set += "${frame.className}.${frame.methodName}"
                }
                if (cancel && blockStops) { hits.getValue("$key cancelled").incrementAndGet(); p.result = null }
            }
        })
        n++
    }
    notes += "$className.$method: watching $n overload(s)${if (cancel) " (can block)" else ""}"
}

private fun inspect(scope: PluginScope): String {
    val sb = StringBuilder()
    val names = listOf("e7.g", "e7.i", "p7.a", "p7.c", "b7.q", "com.discord.chat.presentation.message.MessageView", "com.discord.chat.bridge.Message")
    val interesting = Regex("(?i)avatar|image|anim|gif|play|load|bind|decor|url|drawable|fresco")
    for (n in names) runCatching {
        val c = scope.classLoader.loadClass(n)
        sb.append("\n").append(c.name).append(" extends ").append(c.superclass?.name)
            .append(" implements ").append(c.interfaces.joinToString { it.name }).append('\n')
        c.declaredFields.filter { interesting.containsMatchIn(it.name) || interesting.containsMatchIn(it.type.name) }.take(40)
            .forEach { sb.append("  field ").append(it.type.name).append(' ').append(it.name).append('\n') }
        c.declaredMethods.filter { interesting.containsMatchIn(it.name) || it.parameterTypes.any { p -> interesting.containsMatchIn(p.name) } }
            .sortedBy { it.name }.take(70).forEach { m ->
                sb.append("  ").append(m.returnType.simpleName).append(' ').append(m.name).append('(')
                    .append(m.parameterTypes.joinToString { it.name.substringAfterLast('.') }).append(")\n")
            }
    }.onFailure { sb.append("\n$n: ${it::class.java.simpleName}\n") }
    return sb.toString()
}

/** Does nothing at startup. Everything runs only when a button is tapped, so a bad step can't stop Discord from opening. */
val avatarLab = plugin {
    start {
        val notes = mutableListOf<String>()
        var names = "not asked"
        var rows = "not asked"
        var inspected = "not asked"
        registerNativeMethod("marklong.avatar-lab.report") {
            buildString {
                append("## hooks\n")
                notes.forEach { append(it).append('\n') }
                hits.entries.sortedBy { it.key }.forEach { append("  ${it.key}: ${it.value.get()}\n") }
                append("## who called\n")
                callers.entries.sortedBy { it.key }.forEach { append("  ${it.key}: ${it.value.joinToString(" | ")}\n") }
                append("\n## inspect\n").append(inspected).append('\n')
                append("\n## names\n").append(names).append("\n\n## rows\n").append(rows)
            }
        }
        registerNativeMethod("marklong.avatar-lab.inspect") {
            inspected = runCatching { inspect(this) }.getOrElse { "error: ${it::class.java.name}: ${it.message}" }
            "inspect done (${inspected.length} chars)"
        }
        registerNativeMethod("marklong.avatar-lab.watch") {
            if (callers.isEmpty() && hits.keys.none { it.startsWith("AnimatedDrawable2") }) {
                runCatching {
                    watch(this, "com.facebook.fresco.animation.drawable.AnimatedDrawable2", "start", false, notes)
                    watch(this, "com.facebook.fresco.animation.drawable.AnimatedDrawable2", "stop", true, notes)
                    watch(this, "android.graphics.drawable.AnimatedImageDrawable", "start", false, notes)
                    watch(this, "android.graphics.drawable.AnimatedImageDrawable", "stop", true, notes)
                }.onFailure { notes += "watch error: ${it::class.java.name}: ${it.message}" }
            }
            "watching"
        }
        registerNativeMethod("marklong.avatar-lab.block") { blockStops = !blockStops; "stops are ${if (blockStops) "BLOCKED" else "allowed"}" }
        registerNativeAsyncMethod("marklong.avatar-lab.names") {
            names = runCatching { scanNames(this) }.getOrElse { "error: ${it::class.java.name}: ${it.message}" }
            "names done (${names.length} chars)"
        }
        registerNativeAsyncMethod("marklong.avatar-lab.rows") {
            rows = runCatching { scanRows(this) }.getOrElse { "error: ${it::class.java.name}: ${it.message}" }
            "rows done (${rows.length} chars)"
        }
        registerNativeMethod("marklong.avatar-lab.hooks") {
            if (unhooks.isNotEmpty()) "already on" else {
                runCatching {
                    force(this, FAST_IMAGE, "setPaused", 1, false, notes)
                    force(this, FAST_IMAGE, "setEnableAnimation", 1, true, notes)
                    force(this, FAST_IMAGE, "setAutoPlay", 1, true, notes)
                    force(this, APNG_DECORATION, "setAutoplay", 1, true, notes)
                }.onFailure { notes += "hook error: ${it::class.java.name}: ${it.message}" }
                "hooks on: ${unhooks.size}"
            }
        }
    }
    stop {
        unhooks.forEach { runCatching { it.unhook() } }
        unhooks.clear()
    }
}

private fun scanNames(scope: PluginScope): String {
    val loader = scope.classLoader
    val found = scope.dexFinder.findValue("avatar-lab:names2", { s: String -> s }, { it }) {
        val out = StringBuilder()
        for (word in NAME_WORDS) {
            val hit = findClass {
                searchPackages("com.discord")
                matcher { className(word, StringMatchType.Contains) }
            }.map { it.name }.sorted()
            out.append("# $word (${hit.size})\n")
            hit.take(70).forEach { out.append(it).append('\n') }
        }
        out.toString()
    } ?: return "dex scan returned nothing"
    val sb = StringBuilder(found).append("\n## details\n")
    runCatching {
        val manager = loader.loadClass(FAST_IMAGE)
        val playback = manager.declaredMethods.firstOrNull { it.name == "getPlayback" && it.returnType != Any::class.java }
        playback?.parameterTypes?.firstOrNull()?.let { sb.append("\nFastImageView class:").append(dump(it, 70)) }
        playback?.returnType?.let { sb.append("\nPlayback type:").append(dump(it)) }
    }
    return sb.toString()
}

private fun scanRows(scope: PluginScope): String {
    val loader = scope.classLoader
    val found = scope.dexFinder.findValue("avatar-lab:rows2", { s: String -> s }, { it }) {
        val out = StringBuilder()
        for (s in ROW_STRINGS) {
            val hit = findClass { matcher { usingStrings(s) } }.map { it.name }.sorted()
            out.append("# \"$s\" (${hit.size})\n")
            hit.take(40).forEach { out.append(it).append('\n') }
        }
        out.toString()
    } ?: return "dex scan returned nothing"
    val sb = StringBuilder(found).append("\n## details\n")
    found.lines().filter { it.startsWith("com.") }.distinct().take(12)
        .forEach { name -> runCatching { sb.append(dump(loader.loadClass(name), 60)) } }
    return sb.toString()
}
