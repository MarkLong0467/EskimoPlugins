@file:JvmName("MaterialCord")

package dev.kmmiio99o.materialcord

import app.valenced.plugins.plugin

val materialCord = plugin {
    start {
        WallpaperBridge.register(this)
    }
}
