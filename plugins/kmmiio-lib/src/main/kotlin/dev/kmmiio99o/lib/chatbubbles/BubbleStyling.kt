package dev.kmmiio99o.lib.chatbubbles

import android.graphics.Outline
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.InsetDrawable
import android.view.View
import android.view.ViewGroup
import android.view.ViewGroup.MarginLayoutParams
import android.view.ViewOutlineProvider
import android.widget.ImageView
import android.widget.LinearLayout
import dev.kmmiio99o.lib.firstChildOrNull
import dev.kmmiio99o.lib.hasChild
import dev.kmmiio99o.lib.px
import java.lang.reflect.Field
import java.util.Collections
import java.util.WeakHashMap

private val styledViews: MutableSet<ViewGroup> =
    Collections.synchronizedSet(Collections.newSetFromMap(WeakHashMap<ViewGroup, Boolean>()))

internal fun registerStyledView(view: ViewGroup) {
    styledViews.add(view)
}

internal fun reapplyToAll() {
    val views = synchronized(styledViews) { styledViews.toList() }
    for (view in views) {
        if (view.isAttachedToWindow) {
            applyRoundedSquareProfilePicture(view)
            applyBubbleChat(view)
        } else {
            styledViews.remove(view)
        }
    }
}

internal fun adjustMarginsForAccessories(view: ViewGroup) {
    val marginLayoutParams = view.layoutParams as MarginLayoutParams
    val topMargin = marginLayoutParams.topMargin
    marginLayoutParams.setMargins(marginLayoutParams.leftMargin, 0, marginLayoutParams.rightMargin, marginLayoutParams.bottomMargin)
    view.layoutParams = marginLayoutParams
    view.setPadding(view.paddingLeft, topMargin + view.paddingTop, view.paddingRight, view.paddingBottom)
}

internal fun applyRoundedSquareProfilePicture(viewGroup: ViewGroup) {
    val imageView = viewGroup.firstChildOrNull { it is ImageView } as? ImageView ?: return
    imageView.apply {
        clipToOutline = true
        outlineProvider = object : ViewOutlineProvider() {
            override fun getOutline(view: View?, outline: Outline?) {
                outline?.setRoundRect(0, 0, view!!.width, view.height, BubbleConfig.avatarCurveRadius)
            }
        }
        translationY = 4f.px
    }
}

internal fun applyBubbleChat(viewGroup: ViewGroup) {
    val linearLayout = viewGroup.firstChildOrNull { v ->
        v is LinearLayout && v.hasChild { c -> c.javaClass.simpleName == "ConstraintLayout" }
    } as? LinearLayout ?: return
    applyBubbleBackground(linearLayout, findAccessoriesView(viewGroup))
}

internal fun findAccessoriesView(view: ViewGroup): ViewGroup? =
    view.firstChildOrNull { it.javaClass.simpleName == "MessageAccessoriesView" } as? ViewGroup
        ?: readObjectField(view, "binding")
            ?.let { readObjectField(it, "accessoriesView") as? ViewGroup }

private fun applyBubbleBackground(linearLayout: ViewGroup, accessoriesView: ViewGroup?) {
    val messageHeader = linearLayout.firstChildOrNull { c -> c.javaClass.simpleName == "ConstraintLayout" }
    val isGroupStart = messageHeader != null && (messageHeader as? ViewGroup)?.hasChild { it.visibility == View.VISIBLE } == true

    if (isGroupStart) {
        linearLayout.setBubbleBackground(0, start = true, end = accessoriesView == null, rightInset = 0)
        linearLayout.setPadding(BubbleConfig.PADDING_LARGE, BubbleConfig.PADDING_MEDIUM, 0, if (accessoriesView == null) BubbleConfig.PADDING_MEDIUM else 0)
        linearLayout.translationX = -BubbleConfig.PADDING_SMALL.toFloat()
    } else {
        linearLayout.background = null
        linearLayout.setPadding(0, 0, 0, 0)
        linearLayout.translationX = 0f
    }

    accessoriesView?.let { setAccessoryBubbleBackground(it, !isGroupStart) }
}

private fun setAccessoryBubbleBackground(accessoriesView: ViewGroup, start: Boolean) {
    val leftMarginPx = readObjectField(accessoriesView, "k1")
        ?.let { readIntField(it, "a") }
        ?: readObjectField(accessoriesView, "messageAccessoriesDecoration")?.let { decoration ->
            readIntField(decoration, "leftMarginPx")
                ?: readIntField(decoration, "leftMargin")
                ?: readIntField(decoration, "startMargin")
                ?: readObjectField(decoration, "margins")?.let { readIntField(it, "leftMarginPx") }
        }
        ?: return

    accessoriesView.setBubbleBackground(leftMarginPx, start, true, rightInset = 0)
    accessoriesView.setPadding(BubbleConfig.PADDING_LARGE, if (start) BubbleConfig.PADDING_MEDIUM else 0, 0, BubbleConfig.PADDING_MEDIUM)
    accessoriesView.translationX = -BubbleConfig.PADDING_SMALL.toFloat()
    accessoriesView.clipToOutline = true
}

private fun findField(cls: Class<*>?, name: String): Field? {
    var current = cls
    while (current != null) {
        val field = current.declaredFields.firstOrNull { it.name == name }
        if (field != null) {
            field.isAccessible = true
            return field
        }
        current = current.superclass
    }
    return null
}

private fun readObjectField(owner: Any?, name: String): Any? =
    findField(owner?.javaClass, name)?.get(owner)

private fun readIntField(owner: Any?, name: String): Int? =
    findField(owner?.javaClass, name)?.takeIf { it.type == Integer.TYPE }?.getInt(owner)

private fun ViewGroup.setBubbleBackground(leftMargin: Int, start: Boolean, end: Boolean, rightInset: Int = BubbleConfig.PADDING_SMALL) {
    val bubble = GradientDrawable().apply {
        shape = GradientDrawable.RECTANGLE
        setColor(BubbleConfig.chatBubbleColor)
        cornerRadii = FloatArray(8) { i ->
            when {
                start && end -> BubbleConfig.bubbleCurveRadius
                start && i < 4 -> BubbleConfig.bubbleCurveRadius
                !start && i >= 4 -> BubbleConfig.bubbleCurveRadius
                else -> 0f
            }
        }
    }
    background = InsetDrawable(bubble, leftMargin, 0, rightInset, 0)
}
