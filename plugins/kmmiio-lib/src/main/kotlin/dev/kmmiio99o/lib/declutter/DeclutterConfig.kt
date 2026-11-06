package dev.kmmiio99o.lib.declutter

import de.robv.android.xposed.XC_MethodHook

internal object DeclutterConfig {
    var hooksInstalled = false
    var hideAvatarDecorations = true
    var hideServerTags = true
    var configureAuthorHook: XC_MethodHook.Unhook? = null
}
