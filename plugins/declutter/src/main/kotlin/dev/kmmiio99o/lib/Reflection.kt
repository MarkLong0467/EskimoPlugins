package dev.kmmiio99o.lib

import android.content.res.Resources
import android.view.View
import android.view.ViewGroup

internal val Int.px: Int
    get() = (this * Resources.getSystem().displayMetrics.density).toInt()

internal val Float.px: Float
    get() = this * Resources.getSystem().displayMetrics.density

internal fun ViewGroup.firstChildOrNull(predicate: (View) -> Boolean): View? {
    for (i in 0 until childCount) {
        val child = getChildAt(i)
        if (predicate(child)) return child
    }
    return null
}

internal fun ViewGroup.hasChild(predicate: (View) -> Boolean): Boolean {
    for (i in 0 until childCount) {
        if (predicate(getChildAt(i))) return true
    }
    return false
}
