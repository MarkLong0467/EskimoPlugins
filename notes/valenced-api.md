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
