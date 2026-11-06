@file:JvmName("KmmiioLibPlugin")

package dev.kmmiio99o.lib

import app.valenced.plugins.plugin

val kmmiioLibPlugin = plugin {
    start {
        dev.kmmiio99o.lib.chatbubbles.BubbleBridge.register(this, classLoader)
        dev.kmmiio99o.lib.declutter.DeclutterBridge.register(this, classLoader)
        dev.kmmiio99o.lib.mediasession.MediaSessionHooks.install(classLoader)
        dev.kmmiio99o.lib.mediasession.MediaSessionBridge.register(this)
    }
    stop {
        dev.kmmiio99o.lib.chatbubbles.MessageViewHooks.uninstall()
        dev.kmmiio99o.lib.chatbubbles.BubbleConfig.hooksEnabled = false
        dev.kmmiio99o.lib.declutter.DeclutterHooks.uninstall()
    }
}
