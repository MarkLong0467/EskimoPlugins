# RTL Chat

Read Discord from right to left in English, the way it looks in Arabic.

## Styles

| Style | What it does |
| --- | --- |
| **Right to left** (default) | Asks the phone for the layout Discord has in Arabic: profile pictures on the right, text lined up on the right. Applies after a restart of Discord. |
| **Right-aligned text only** | Message text lines up on the right. Nothing else moves, no restart needed. |
| **Mirror everything** | The whole app is flipped sideways. Optionally letters and pictures face the normal way ("readable"). |
| **Off** | Normal. |

**Before you uninstall**, set the style to Off and restart Discord, or the phone can stay right to left.

## How it works

Discord draws messages natively, so the only way to move them is the phone's own layout direction. The plugin asks for it
through React Native's `I18nManager`. It remembers that it did, so Off only gives the direction back when this plugin was
the one that changed it.

Text is lined up by marking it. The rows Discord sends to its native chat (`DCDChatManager.updateRows`) are rewritten so each
paragraph starts with an invisible right-to-left mark, and the words sit inside a left-to-right embedding. That makes the
paragraph right-to-left while English keeps its word order and its full stops stay at the end of the sentence.

The mirror finds the root of the app in several places, in order: React Native's registry of apps, `renderApplication`, the
root element, the navigation container and `AppContainer`. The first to answer flips the app, so it is never flipped twice.

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Asks for the direction and installs every hook. |
| `direction.ts` | The layout direction and restarting the app. |
| `align.ts` | Lines message text up on the right. |
| `mirror.tsx` | Flips the whole app and counter-flips letters and pictures. |
| `Settings.tsx` | The settings screen. |
| `state.ts`, `constants.ts`, `types.ts` | Helpers. |

## Developing

```sh
bun install
bun run build         # builds plugins/rtl-chat/build/js/index.js
bun run test rtl-chat
```
