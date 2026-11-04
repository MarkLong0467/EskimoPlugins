@file:JvmName("AvatarLab")

package marklong.avatarlab

import app.valenced.plugins.PluginScope
import app.valenced.plugins.plugin
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

/** Looks for Discord classes by name and by the row field names, and forces image playback on. */
val avatarLab = plugin {
    start {
        var scan = "scan not finished yet"
        val notes = mutableListOf<String>()
        registerNativeMethod("marklong.avatar-lab.report") {
            buildString {
                append("## hooks\n")
                notes.forEach { append(it).append('\n') }
                hits.entries.sortedBy { it.key }.forEach { append("  ${it.key}: ${it.value.get()}\n") }
                append("\n").append(scan)
            }
        }
        runCatching {
            force(this, FAST_IMAGE, "setPaused", 1, false, notes)
            force(this, FAST_IMAGE, "setEnableAnimation", 1, true, notes)
            force(this, FAST_IMAGE, "setAutoPlay", 1, true, notes)
            force(this, APNG_DECORATION, "setAutoplay", 1, true, notes)
        }.onFailure { notes += "hook error: ${it::class.java.name}: ${it.message}" }
        Thread {
            scan = runCatching { scan(this) }.getOrElse { "error: ${it::class.java.name}: ${it.message}" }
            log.i("Avatar Lab finished (${scan.length} chars)")
        }.start()
    }
    stop {
        unhooks.forEach { runCatching { it.unhook() } }
        unhooks.clear()
    }
}

private fun scan(scope: PluginScope): String {
    val loader = scope.classLoader
    val found = scope.dexFinder.findValue("avatar-lab:v2", { s: String -> s }, { it }) {
        val out = StringBuilder("## classes by name\n")
        for (word in NAME_WORDS) {
            val hit = findClass {
                searchPackages("com.discord")
                matcher { className(word, StringMatchType.Contains) }
            }.map { it.name }.sorted()
            out.append("# $word (${hit.size})\n")
            hit.take(70).forEach { out.append(it).append('\n') }
        }
        out.append("\n## classes using the row field names\n")
        for (s in ROW_STRINGS) {
            val hit = findClass { matcher { usingStrings(s) } }.map { it.name }.sorted()
            out.append("# \"$s\" (${hit.size})\n")
            hit.take(40).forEach { out.append(it).append('\n') }
        }
        out.toString()
    } ?: return "dex scan returned nothing"

    val sb = StringBuilder(found).append("\n## details\n")
    // The image view and its playback type.
    runCatching {
        val manager = loader.loadClass(FAST_IMAGE)
        val playback = manager.declaredMethods.firstOrNull { it.name == "getPlayback" && it.returnType != Any::class.java }
        sb.append(dump(manager))
        playback?.parameterTypes?.firstOrNull()?.let { sb.append("\nFastImageView class:").append(dump(it, 70)) }
        playback?.returnType?.let { sb.append("\nPlayback type:").append(dump(it)) }
    }
    // Details of the classes that hold the row fields (these are the chat's own avatar code).
    val rowClasses = found.substringAfter("## classes using the row field names")
        .lines().filter { it.startsWith("com.") }.distinct().take(12)
    for (name in rowClasses) runCatching { sb.append(dump(loader.loadClass(name), 60)) }
    return sb.toString()
}
