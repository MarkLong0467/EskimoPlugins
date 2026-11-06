@file:JvmName("MediaSessionPlugin")

package dev.kmmiio99o.lib

import app.valenced.plugins.plugin

val mediaSessionPlugin = plugin {
    start {
        dev.kmmiio99o.lib.mediasession.MediaSessionHooks.install(classLoader)
        dev.kmmiio99o.lib.mediasession.MediaSessionBridge.register(this)
    }
}
