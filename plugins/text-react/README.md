# Text React

Write text on a message using reactions.

## What you get

Hold a message and tap **Text React**. Type some text and it is added to the message as reactions, one at a time:

- Letters become regional indicator emoji (🇭 🇮). When a letter is used twice, the second one is a look-alike (🅰️ for a second `a`),
  because a message can only hold each emoji once.
- Digits become keycaps (1️⃣), and a few symbols (`? ! + - * # $` and the space) have emoji too.
- Words and runs with an emoji of their own are used first: `ok` 🆗, `cool` 🆒, `new` 🆕, `free` 🆓, `sos` 🆘, `100` 💯, `18` 🔞, `abc` 🔤,
  `top` 🔝, `back` 🔙, `end` 🔚 and more.

A message holds at most 20 different reactions, so longer text is refused. If part of the text has no emoji, the sheet asks
before leaving it out (this can be switched off). Reactions are added one second apart by default, because Discord limits how
fast they can be added; you can pick a different pause in the settings.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. |
| `emoji.ts`, `emoji-table.ts` | Turn text into emoji, and the tables of what each character can be. |
| `menu.tsx` | Adds **Text React** to the menu of a message, and notes which message the menu is for. |
| `TextReactSheet.tsx` | The sheet that asks for the text. |
| `reactions.ts` | Adds the reactions one at a time through Discord's web API, slowing down when Discord asks. |
| `Settings.tsx`, `config.ts`, `discord.ts`, `constants.ts`, `types.ts` | Settings and helpers. |

The menu of a message is a list of items. The plugin finds it by its labels (Reply, Copy Text, Add Reaction...) or, in other
languages, by the names of its icons, and adds one more item that is a copy of an existing one.

### Differences from the Aliucord plugin

- The Aliucord plugin used up each emoji for good the first time a text was reacted, so later texts ran out of letters. Here
  every text starts with all the emoji available.
- Longer words are matched first, so `100` is 💯 (not 🔟 and a zero) and `abc` is 🔤.
- A word whose emoji is already used falls back to its letters instead of being dropped.
- Reactions are added through Discord's web API instead of a call into the app's internals.

## Credits

Ported from **TextReact for Aliucord** by ArjixWasTaken (<https://github.com/ArjixWasTaken/aliucord-plugins>, Open Software
License 3.0), which is based on **text-react** by Juby210 (<https://github.com/Juby210/text-react>). The emoji tables come from
those plugins. The code is written again for Valenced.

## Developing

```sh
bun install
bun run build         # builds plugins/text-react/build/js/index.js
bun run test text-react
```
