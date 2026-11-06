@file:JvmName("DeclutterPlugin")

package dev.kmmiio99o.lib

import app.valenced.plugins.plugin

val declutterPlugin = plugin {
    start {
        dev.kmmiio99o.lib.declutter.DeclutterBridge.register(this, classLoader)
    }
    stop {
        dev.kmmiio99o.lib.declutter.DeclutterHooks.uninstall()
    }
}
