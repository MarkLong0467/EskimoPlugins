package app.valenced.bridge;
import java.util.List; import kotlin.jvm.functions.Function1; import kotlin.jvm.functions.Function2;
/** Compile-time stand-in for Valenced's bridge (android/api ValencedBridge.kt). Not packaged. */
public interface ValencedBridge {
  boolean isReady();
  void registerMethod(String name, Function1<? super List<?>, ?> handler);
  void registerAsyncMethod(String name, Function2<? super List<?>, ? super kotlin.coroutines.Continuation<?>, ?> handler);
}
