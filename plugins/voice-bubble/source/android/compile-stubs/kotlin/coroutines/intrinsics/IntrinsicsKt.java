package kotlin.coroutines.intrinsics;
/** Compile-time stand-in for the Kotlin standard library's coroutine intrinsics (provided by Valenced at runtime). */
public final class IntrinsicsKt {
  public static Object getCOROUTINE_SUSPENDED() { return null; }
  public static <T> kotlin.coroutines.Continuation<T> intercepted(kotlin.coroutines.Continuation<T> c) { return c; }
}
