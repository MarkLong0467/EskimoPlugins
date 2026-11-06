package dev.kmmiio99o.lib.declutter

import app.valenced.plugins.PluginScope
import app.valenced.xposed.api.registerNativeMethod

internal object DeclutterBridge {
    private var classLoader: ClassLoader? = null

    fun register(scope: PluginScope, classLoader: ClassLoader) {
        this.classLoader = classLoader

        scope.registerNativeMethod("declutter.configure") { args ->
            val hideAvatarDecorations = args.getOrNull(0) as? Boolean
            val hideServerTags = args.getOrNull(1) as? Boolean
            hideAvatarDecorations?.let { DeclutterConfig.hideAvatarDecorations = it }
            hideServerTags?.let { DeclutterConfig.hideServerTags = it }
            DeclutterHooks.install(classLoader)
            null
        }
    }
}
