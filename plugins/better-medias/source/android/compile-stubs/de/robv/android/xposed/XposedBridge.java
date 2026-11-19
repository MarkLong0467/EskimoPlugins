package de.robv.android.xposed;

import java.lang.reflect.Member;

/** Compile-time stand-in for the Xposed API that Valenced provides at run time. Not packaged. */
public final class XposedBridge {
    private XposedBridge() {}

    public static XC_MethodHook.Unhook hookMethod(Member hookMethod, XC_MethodHook callback) { return null; }

    public static void log(String text) {}
}
