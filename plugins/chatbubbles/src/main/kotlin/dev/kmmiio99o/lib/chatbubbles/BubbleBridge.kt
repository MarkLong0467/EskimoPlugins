package dev.kmmiio99o.lib.chatbubbles

import android.os.Handler
import android.os.Looper
import app.valenced.plugins.PluginScope
import app.valenced.xposed.api.registerNativeMethod

internal object BubbleBridge {
    private var classLoader: ClassLoader? = null

    fun register(scope: PluginScope, classLoader: ClassLoader) {
        this.classLoader = classLoader

        scope.registerNativeMethod("bubbles.hook") {
            BubbleConfig.hooksEnabled = true
            MessageViewHooks.install(classLoader)
            null
        }
        scope.registerNativeMethod("bubbles.unhook") {
            BubbleConfig.hooksEnabled = false
            null
        }
        scope.registerNativeMethod("bubbles.configure") { args ->
            configure(
                args.getOrNull(0) as? Number,
                args.getOrNull(1) as? Number,
                args.getOrNull(2) as? String,
            )
            null
        }
    }

    private fun configure(avatarRadius: Number? = null, bubbleRadius: Number? = null, bubbleColor: String? = null) {
        avatarRadius?.toFloat()?.let { BubbleConfig.avatarCurveRadius = it }
        bubbleRadius?.toFloat()?.let { BubbleConfig.bubbleCurveRadius = it }
        BubbleConfig.chatBubbleColor =
            bubbleColor?.toLongOrNull()?.toInt() ?: BubbleConfig.DEFAULT_BUBBLE_COLOR
        reapplyOnMainThread()
    }

    private fun reapplyOnMainThread() {
        val mainLooper = Looper.getMainLooper()
        if (Looper.myLooper() == mainLooper) {
            reapplyToAll()
        } else {
            Handler(mainLooper).post { reapplyToAll() }
        }
    }
}
