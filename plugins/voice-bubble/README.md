# Mute & Deafen Bubble

Floating **mute** and **deafen** buttons over other apps while you're in a call and Discord is in the background.

- Top button: mute. Bottom button: deafen. A button is red while it is on; the mic also shows red while deafened.
- Settings > Buttons: **Mute and deafen** (both, the default), **Mute only** or **Deafen only**.
- Drag the bubble to move it.
- Needs Android's "Display over other apps" permission (the plugin's settings page has a shortcut to it).
- The on/off switch is in the plugin's settings and in Discord's voice settings, above "Change audio output".

Based on [Mute Bubble](https://github.com/il1ll/ValencedPlugins) 3.3.3 by coder.gg (GPL-3.0). Turn Mute Bubble off
while using this one, or you get two bubbles.

## Building

- JS: `bun run build voice-bubble` (the bundle is `build/js/index.js`).
- Native: `sh source/android/build.sh` (needs a JDK, Android's `android.jar` and `r8.jar`; see the script). The
  `compile-stubs` folder only stands in for Valenced and Kotlin while compiling and is not packaged.
