# Mute & Deafen Bubble

Floating **mute**, **deafen**, **screen share** and **disconnect** buttons over other apps while you're in a call and
Discord is in the background.

- Buttons, top to bottom: mute, deafen, screen share, disconnect. Mute and deafen are red while on (the mic also shows
  red while deafened), screen share is blue while you're sharing, and disconnect is always red.
- Screen share opens Discord first, because Android only asks to share your screen while Discord is showing. Tap it
  again while sharing to stop.
- Settings > Buttons: a switch for each button. At least one stays on.
- Drag the bubble to move it.
- Needs Android's "Display over other apps" permission (the plugin's settings page has a shortcut to it).
- The on/off switch is in the plugin's settings and in Discord's voice settings, above "Change audio output".

Based on [Mute Bubble](https://github.com/il1ll/ValencedPlugins) 3.3.3 by coder.gg (GPL-3.0). Turn Mute Bubble off
while using this one, or you get two bubbles.

## Building

- JS: `bun run build voice-bubble` (the bundle is `build/js/index.js`).
- Native: `sh source/android/build.sh` (needs a JDK, Android's `android.jar` and `r8.jar`; see the script). The
  `compile-stubs` folder only stands in for Valenced and Kotlin while compiling and is not packaged.
