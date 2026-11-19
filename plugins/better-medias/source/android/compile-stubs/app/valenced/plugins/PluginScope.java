package app.valenced.plugins;
/** Compile-time stand-in for Valenced's PluginScope. Not packaged. */
public interface PluginScope extends app.valenced.xposed.api.HostScope {
  java.io.File getStorageDir(); boolean getStartedLate(); void requireReload();
}
