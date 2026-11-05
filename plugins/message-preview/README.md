# Message Preview

See your message the way it will look before you send it.

## What you get

Two ways to start a preview, and two ways to show it. Pick them in the plugin's settings.

| Button type | How it works |
| --- | --- |
| Floating pill | A round button over the message box. It appears once you have typed something. |
| Send button | Hold the send button. (Without text or files nothing happens.) |

| Preview type | What you see |
| --- | --- |
| Popup | The message in a window on top of the chat, drawn by Discord's own message code. |
| Ephemeral message | The message in the chat itself, as one only you can see. |

Files you have picked to upload are shown too. If a popup cannot be opened, the message is shown in the chat instead. If
that fails as well, a toast says why.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Remembers the settings and starts the two patches. Closes the popup when the plugin stops. |
| `patches.ts` | Patches the message box (`ChatInputGuardWrapper`) and the send button's long press. |
| `decorate.tsx` | Puts the floating button into the message box. |
| `PreviewButton.tsx` | The floating button. It follows what you type by wrapping the text field's `handleTextChanged`. |
| `preview.tsx` | Builds the message and shows it as a popup or a chat message. |
| `PreviewAlert.tsx` | The popup. |
| `attachments.ts` | Lists the files you picked, written the way a sent message lists them. |
| `Settings.tsx`, `config.ts` | The settings screen and reading the settings. |
| `discord.ts`, `constants.ts`, `types.ts` | Finding Discord's code, fixed values and types. |

**Finding the send button.** It is a `Pressable` whose tap handler is named `handlePressSend`, a name that is the same in
every language. When the setting asks for it, its long press opens the preview; otherwise its own long press is kept.

**Ephemeral messages.** The message is made with Discord's `createBotMessage` (or a plain message with the same fields),
with you as the author and flag 64, and handed to Discord's `receiveMessage`. If that is not available a
`MESSAGE_CREATE` event is sent instead.

**Safe by design.** If the message box is not shaped as expected, or anything goes wrong while adding the button, the
box is drawn as Discord would.

## Credits

Based on the Message Preview plugin for Revenge by nexpid and pylix (CC BY 4.0),
<https://github.com/nexpid/RevengePlugins>. Rewritten for Valenced.

## Developing

```sh
bun install
bun run build         # builds plugins/message-preview/build/js/index.js
bun run test message-preview
```
