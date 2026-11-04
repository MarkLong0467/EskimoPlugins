@file:JvmName("AvatarLab")

package marklong.avatarlab

import app.valenced.plugins.plugin
import app.valenced.xposed.api.registerNativeMethod
import org.luckypray.dexkit.query.enums.StringMatchType

private val KEYWORDS = listOf("Avatar", "Decoration", "APNG", "Apng", "FastImage", "Animated", "AnimatedImage", "GifDrawable", "DCD", "Fresco", "Webp", "Lottie")

/** Looks for Discord classes by name and lists their methods. Changes nothing. */
val avatarLab = plugin {
    start {
        var report = "not run yet"
        registerNativeMethod("marklong.avatar-lab.report") { report }
        Thread {
            report = runCatching { scan(this) }.getOrElse { "error: ${it::class.java.name}: ${it.message}" }
            log.i("Avatar Lab finished (${report.length} chars)")
            runCatching { java.io.File(storageDir, "avatar-lab-report.txt").writeText(report) }
        }.start()
    }
}

private fun scan(scope: app.valenced.plugins.PluginScope): String {
    val loader = scope.classLoader
    val classNames = scope.dexFinder.findValue(
        "avatar-lab:names",
        { names: String -> names },
        { it },
    ) {
        val out = StringBuilder()
        for (word in KEYWORDS) {
            val hits = findClass {
                matcher { className(word, StringMatchType.Contains) }
            }.map { it.name }.sorted()
            out.append("## $word (${hits.size})\n")
            hits.take(80).forEach { out.append(it).append('\n') }
        }
        out.toString()
    } ?: return "dex scan returned nothing"

    val sb = StringBuilder(classNames).append("\n## methods\n")
    // Methods of the most promising classes: names with these words, outside of ours and the system's.
    val interesting = classNames.lines().filter { it.contains('.') && !it.startsWith("#") }
        .filter { Regex("Avatar|Decoration|Apng|APNG|FastImage|DCD").containsMatchIn(it.substringAfterLast('.')) }
        .distinct().take(60)
    for (name in interesting) {
        runCatching {
            val c = loader.loadClass(name)
            sb.append("\n").append(name).append(" extends ").append(c.superclass?.name).append('\n')
            c.declaredMethods.sortedBy { it.name }.take(40).forEach { m ->
                sb.append("  ").append(m.returnType.simpleName).append(' ').append(m.name).append('(')
                    .append(m.parameterTypes.joinToString { it.simpleName }).append(")\n")
            }
        }
    }
    return sb.toString()
}
