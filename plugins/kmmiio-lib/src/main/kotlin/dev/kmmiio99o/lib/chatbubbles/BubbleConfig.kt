package dev.kmmiio99o.lib.chatbubbles

import de.robv.android.xposed.XC_MethodHook
import dev.kmmiio99o.lib.px

internal object BubbleConfig {
    val DEFAULT_AVATAR_CURVE_RADIUS = 12f.px
    val DEFAULT_BUBBLE_CURVE_RADIUS = 12f.px
    val DEFAULT_BUBBLE_COLOR = 0x66000000.toInt()
    val PADDING_SMALL = 6.px
    val PADDING_MEDIUM = 8.px
    val PADDING_LARGE = 12.px

    var avatarCurveRadius = DEFAULT_AVATAR_CURVE_RADIUS
    var bubbleCurveRadius = DEFAULT_BUBBLE_CURVE_RADIUS
    var chatBubbleColor = DEFAULT_BUBBLE_COLOR

    var hooksEnabled = false
    var hooksInstalled = false
    var messageViewHook: XC_MethodHook.Unhook? = null
}
