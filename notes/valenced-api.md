# Valenced: where the docs really are, and what they say

`https://valenced.app/docs/...` is blocked from the sandbox this repo is worked on in, but the same information is public on GitHub:

- **https://github.com/Valenced/valenced** (GPL-3.0): the loader and the built-in plugins (`bundle/src/plugins/...`). Read it to see how plugins are written. Do not copy code from it into plugins here (GPL).
- **https://github.com/Valenced/valenced-types**: the full public plugin API as `.d.ts` files (`lib/modules/finders.d.ts`, `lib/patcher.d.ts`, `lib/react.d.ts`, `lib/discord/*`, `externals/*`). `git clone --depth 1` works through the proxy.
- https://github.com/Valenced/valenced-community-plugins (`gh-pages` branch): the community plugin index.

## Facts that matter when writing plugins (from the types and the built-in plugins)

- `lookupModule(filter)` returns **one** match as a tuple `[exports, id]` (or `[]`). `lookupModules(filter)` is a generator of all matches.
- `getModules(filter, callback, { max })` calls the callback for modules that are already loaded (after an event loop) **and** for modules loaded later. It returns an unsubscribe function. Use it instead of a one-time lookup: many modules are loaded only when a screen first needs them. `waitForModules` only reports modules loaded later.
- Filters: `withProps(...names)`, `withName(name)`, `withStoreName`, `withSingleProp`, `withoutProps`, `allOf`, `anyOf`, `namespaceOnly`, `withDependencies`. A filter checks the default export too, unless wrapped in `namespaceOnly`. Custom filter functions are not accepted (passing one threw "undefined is not a function").
- JSX hooks per element type: `afterJSX(type, patch)`, `beforeJSX`, `insteadJSX` (module `react/jsx-runtime`).
- `externals/react-native-community` only exposes NetInfo; there is no image-editing or screenshot library for plugins.
- Native plugins exist (Kotlin, DEX, `android/api`), which could hook Discord's native Android classes. That needs the JDK 25 + Android SDK build chain and Discord's decompiled Android code, which the sandbox does not have.

## Lessons from the plugins in this repo

- Always look modules up with `getModules`, not once at start (Show Hidden Channels and Always Animate both failed "not found" with a one-time lookup).
- Discord's chat (`DCDChat`, `DCDMessageView`) is drawn natively from one `row` attribute; plugins can change the data in the row (`generateMessageRowData(...).message`) but not how the native view plays pictures.

## Native parts (Kotlin) and the chat

- A plugin can ship a native part: `dist.android = { path: "plugin.jar", class: "<package>.<File>" }` in the manifest, and a Kotlin file with `val x = plugin { start { ... } stop { ... } }` (`@file:JvmName`). The JS side calls it with `valenced.modules.native.callNativeMethod(name, args)`; the native side registers with `registerNativeMethod(name) { args -> ... }`.
- It cannot be built in the sandbox (needs JDK 25 + Android SDK). `.github/workflows/native-build.yml` builds `app.valenced:api` and `core` from the public Valenced source into mavenLocal, then builds `lab/always-animate-native`. No token is needed.
- Inside the scope of `plugin { start { ... } }`, `enabled` is the plugin scope's own property: do not name your own variable `enabled`.
- Never do heavy work (DexKit scans, hooks) at startup without a guard: a start that hangs locks Discord. The native part writes a "starting" mark and clears it 20 seconds later; if it is still there at the next launch, it does not auto-start. Valenced's own recovery mode also turns every plugin off after 3 crashes.
- Discord's native chat (Android): `com.discord.chat.presentation.message.MessageView` binds each message (`b(Message, ...)`, `f(...)`); avatars and decorations are Fresco `SimpleDraweeView`s (`DraweeView` base names are scrambled; find the controller by what it returns: a zero-argument method that returns something with a zero-argument method returning `android.graphics.drawable.Animatable`). The animation exists but is not kept running: restarting it every ~400 ms (main thread) makes profile pictures animate in chat.
- Avatar decorations ("ears") are APNG (animated PNG) files; Fresco cannot play APNG, so they stay still in the native chat. The server returns APNG whatever the `Accept` header or `format=` says. An attempt to draw them with Discord's own decoder (`com.linecorp.apng.decoder.Apng`) over the still ear was built (Always Animate 2.1.0) and removed again before release.
