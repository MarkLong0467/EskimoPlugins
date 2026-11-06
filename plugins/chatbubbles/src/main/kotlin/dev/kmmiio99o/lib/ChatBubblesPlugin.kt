@file:JvmName("ChatBubblesPlugin")

package dev.kmmiio99o.lib

import app.valenced.plugins.plugin

val chatBubblesPlugin = plugin {
    start {
        dev.kmmiio99o.lib.chatbubbles.BubbleBridge.register(this, classLoader)
    }
    stop {
        dev.kmmiio99o.lib.chatbubbles.MessageViewHooks.uninstall()
        dev.kmmiio99o.lib.chatbubbles.BubbleConfig.hooksEnabled = false
    }
}
