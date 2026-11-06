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
The sheet slides in when it opens. If that lags on your phone, turn off **Opening animation** in the settings and it pops up at once.

As you type, the sheet previews the emoji that will be added, with how many and whether some characters are left out.
It also shows how full the message is: **Up to X different reactions fit on this message** and **N/20 reactions**. A text that
needs more new reactions than fit is refused with the numbers. An emoji the message already has costs no space.

## Your own emoji

In the settings you can:

- give **any character or whole word** your own emoji, one or several (`fuck` → 🍆🍑, `a` → 🍎). A mapping of a character
  applies everywhere; a word only applies as a whole word. Yours beat the built-in ones, and an emoji is never used twice on a
  message,
- **edit the emoji of any built-in character or word**: tap it in the built-in lists to see its emoji in the order they are tried (the
  first one that is not on the message yet is used), add emoji at the top or the end, remove them, put it back to the built-in list,
  or turn it off. All of them can be turned off or on at once,
- **copy all built-in lists** as text (`a: 🇦 🅰`, one key per line), edit them anywhere and **paste lists** back to apply them. Keys
  that are not built in work too, and show under *Your emoji lists*,
- **export** your settings as JSON (copied and opened in the share sheet) and **import** someone else's by pasting it. Importing
  replaces your mappings.

Letters with accents are read as their plain letter (`é` is `e`) unless you map the accented letter itself. Text React is
also found in the message menu in other languages: by its labels or icons, or, when those cannot be read, by being the box right after Reply and Forward.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. |
| `emoji.ts`, `emoji-table.ts` | Turn text into emoji, and the tables of what each character can be. |
| `menu.tsx` | Adds **Text React** to the menu of a message, and notes which message the menu is for. |
| `TextReactSheet.tsx` | The sheet that asks for the text. |
| `reactions.ts` | Adds the reactions one at a time through Discord's web API, slowing down when Discord asks. |
| `Settings.tsx`, `Mappings.tsx`, `share.ts` | The settings screen, the mappings editor and JSON export/import. |
| `custom.ts`, `config.ts`, `discord.ts`, `constants.ts`, `types.ts` | Custom mapping helpers and the rest. |

The menu of a message is drawn as boxes of rows (Reply and Forward; Copy Text, Message, Mention and Copy Message Link; ...), and some versions of Discord draw it as one list of items. The plugin handles both. The plugin finds the box that holds the copy rows by their labels (Reply, Copy Text, Add Reaction...) or, in other
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

Ideas for your own mappings, exporting and importing settings, and accented letters come from **axonyum** (Discord user 921011505263149097).

## Developing

```sh
bun install
bun run build         # builds plugins/text-react/build/js/index.js
bun run test text-react
```
