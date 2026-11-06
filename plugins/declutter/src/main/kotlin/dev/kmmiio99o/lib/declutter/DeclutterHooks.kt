package dev.kmmiio99o.lib.declutter

import android.view.View
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers

internal object DeclutterHooks {
    private const val MESSAGE_VIEW_CLASS = "com.discord.chat.presentation.message.MessageView"

    fun install(classLoader: ClassLoader) {
        if (DeclutterConfig.hooksInstalled) return
        try {
            val messageViewClass = XposedHelpers.findClassIfExists(MESSAGE_VIEW_CLASS, classLoader) ?: return
            val configureAuthor = messageViewClass.declaredMethods.find { it.name == "configureAuthor" }
            if (configureAuthor != null) {
                DeclutterConfig.configureAuthorHook = XposedBridge.hookMethod(configureAuthor, object : XC_MethodHook() {
                    override fun afterHookedMethod(param: MethodHookParam) {
                        try {
                            val binding = XposedHelpers.getObjectField(param.thisObject, "binding") ?: return
                            if (DeclutterConfig.hideAvatarDecorations) {
                                (binding.javaClass.getField("authorAvatarDecoration").get(binding) as? View)
                                    ?.visibility = View.GONE
                            }
                            if (DeclutterConfig.hideServerTags) {
                                (binding.javaClass.getField("clanTagChiplet").get(binding) as? View)
                                    ?.visibility = View.GONE
                            }
                        } catch (_: Throwable) {
                        }
                    }
                })
            }
            DeclutterConfig.hooksInstalled = true
        } catch (_: Throwable) {
        }
    }

    fun uninstall() {
        try { DeclutterConfig.configureAuthorHook?.unhook() } catch (_: Throwable) {}
        DeclutterConfig.configureAuthorHook = null
        DeclutterConfig.hooksInstalled = false
    }
}
