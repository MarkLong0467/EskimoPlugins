package app.valenced.xposed.api;
import kotlin.Unit; import kotlin.jvm.functions.Function1;
/** Compile-time stand-in for Valenced's HostScope. Not packaged. */
public interface HostScope {
  ClassLoader getClassLoader();
  app.valenced.bridge.ValencedBridge getBridge();
  void withAppContext(Function1<? super android.content.Context, Unit> block);
  void withAppActivity(Function1<? super android.app.Activity, Unit> block);
}
