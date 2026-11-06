package dev.kmmiio99o.lib.chatbubbles

import android.util.Log
import android.view.ViewGroup
import de.robv.android.xposed.XC_MethodHook
import de.robv.android.xposed.XposedBridge
import de.robv.android.xposed.XposedHelpers

internal object MessageViewHooks {
    private const val TAG = "KmmiioLib"

    fun install(classLoader: ClassLoader) {
        if (BubbleConfig.hooksInstalled) return
        val messageViewClass = XposedHelpers.findClassIfExists("com.discord.chat.presentation.message.MessageView", classLoader) ?: return
        val messageClass = XposedHelpers.findClassIfExists("com.discord.chat.bridge.Message", classLoader)
        if (messageClass == null) {
            Log.e(TAG, "MessageView hook not installed: Discord Message class not found")
            return
        }

        val setMessageMethod = messageViewClass.declaredMethods.firstOrNull {
            it.parameterCount == 7 && it.parameterTypes[0] == messageClass
        }
        if (setMessageMethod == null) {
            Log.e(TAG, "MessageView hook not installed: seven-argument message method not found")
            return
        }

        try {
            BubbleConfig.messageViewHook = XposedBridge.hookMethod(setMessageMethod, object : XC_MethodHook() {
                override fun afterHookedMethod(param: MethodHookParam) {
                    if (!BubbleConfig.hooksEnabled) return
                    val view = param.thisObject as? ViewGroup ?: return
                    findAccessoriesView(view)?.let(::adjustMarginsForAccessories)
                    applyRoundedSquareProfilePicture(view)
                    applyBubbleChat(view)
                    registerStyledView(view)
                }
            })
            BubbleConfig.hooksInstalled = true
        } catch (e: Throwable) {
            Log.e(TAG, "Failed to install MessageView hook", e)
        }
    }

    fun uninstall() {
        BubbleConfig.messageViewHook?.unhook()
        BubbleConfig.messageViewHook = null
        BubbleConfig.hooksInstalled = false
        BubbleConfig.hooksEnabled = false
    }
}
