package app.valenced.plugins;
import kotlin.Unit; import kotlin.jvm.functions.Function1;
/** Compile-time stand-in for Valenced's PluginBuilder. Not packaged. */
public final class PluginBuilder {
  public final void start(Function1<? super PluginScope, Unit> block) {}
  public final void stop(Function1<? super PluginScope, Unit> block) {}
}
