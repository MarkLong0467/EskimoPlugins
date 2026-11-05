# Haptics

Switches for the buzzing Discord makes: when a long-press menu opens, other haptic feedback, and plain vibrations.

## What you get

Three switches in the plugin's settings. All are on by default, so Discord buzzes as usual until you turn one off.

| Switch | What it controls |
| --- | --- |
| Buzz when a menu opens | The buzz when you long-press a message, server or person and a menu opens |
| Other haptic feedback | Taps, switches and other small buzzes from Discord |
| Vibrations | Longer vibrations an app asks for |

Changes apply right away. The settings screen also shows what the plugin found in Discord and lists every buzz it has
seen, so a buzz that is not caught can be tracked down. It cannot change the touch feedback of the phone itself, which
is set in Android under Sound and vibration.

## How it works

Each kind of buzz is handled differently:

- **Menus.** Discord opens long-press menus with `ActionSheetActionCreators.openLazy`, which accepts an option that
  skips the buzz (`disableHapticOnOpen`). With the switch off, the plugin adds that option. The menu is found when the
  plugin starts, and looked for once more after 4 seconds if Discord had not loaded it yet.
- **Haptic libraries.** Discord's code calls haptic functions from a few libraries. They are found by what they export,
  with `getModules`, so one that loads later is hooked when it does:
  - `impactAsync`, `notificationAsync` and `selectionAsync` (expo-haptics style),
  - `trigger` together with `HapticFeedbackTypes` (react-native-haptic-feedback style),
  - the native modules `RNHapticFeedback` and `ExpoHaptics`, looked up by exact name only.

  With the switch off the call is swallowed. Functions whose name ends in `Async` give back a resolved promise, because
  callers wait for it. The others give back nothing.
- **Vibrations.** React Native's `Vibration.vibrate` is swallowed when its switch is off.

Every buzz that goes by is counted and listed with what was done (kept, removed, allowed or swallowed). The log gets a
line the first time and then at most one every 5 seconds for the same buzz. It keeps the last 60 lines, and the list
keeps the last 30 different buzzes. **Copy the log** puts the log on the clipboard to send when something still buzzes.

A step that fails while setting up is written to the log, and the other steps still run. When the plugin stops, every
patch is removed and the second look for the menu opener is cancelled.

## Layout

```
js/
  index.tsx     the plugin: sets up the hooks and cleans up
  hooks.ts      the menu, haptic library and vibration hooks
  state.ts      the log, the list of buzzes and what was found
  config.ts     reads the saved switches
  Settings.tsx  the settings screen
  util.ts       toasts, copying, error text and other small helpers
  constants.ts  the defaults, limits and timings
  types.ts      the shapes used above
```

## Testing

`tests/haptics.test.cjs` checks each hook (menus, both library styles, native modules, vibrations) with the switches on
and off, the log and list limits, repeat throttling, the second look for the menu opener, failures during setup, the
settings screen and cleanup:

```sh
bun run build haptics
node tests/haptics.test.cjs
```
