# Bypass Status

Get Discord's normal notification, banner and sound from people you choose (or from everyone) while your status is
**Do Not Disturb**.

## What you get

- Hold a chat, channel or server and tap **Bypass Do Not Disturb** (next to Mute) to put it on the list. Tap
  **Stop bypassing Do Not Disturb** to take it off.
- In the settings: switch on **Everyone**, or manage the list. Add people by pasting their IDs (separated by commas,
  spaces or new lines) or from the clipboard, and add chats and servers from a searchable list.
- Optionally, a banner of the plugin's own with one buzz. It switches itself on if Discord's own function is not found.
- **Copy report** puts a short report on the clipboard for troubleshooting.

Everything else Discord checks still applies: muted chats, blocked people and your notification settings.

**Limit.** Notifications Discord sends to your phone while the app is closed are decided by Discord's servers. This plugin
only works while Discord is open.

## How it works

The decompiled Discord app (version 354) handles every new message in
`discord_app/stores/native/InAppNotificationStore.tsx` and asks
`NotificationTextUtils.shouldNotify(message, channelId, includeSelectedChannel, ignoreStatus)`. That answers "no" in Do
Not Disturb unless `ignoreStatus` is true. The plugin wraps `shouldNotify` and, for a message from a chosen source, asks
again with `ignoreStatus = true`.

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts the three hooks; if one fails the others still run. |
| `notify.ts` | Wraps `shouldNotify`. |
| `rule.ts` | Who may bypass: everyone, or the author, chat or channel, or server is on the list. |
| `list.ts` | The list, kept in the plugin's storage as JSON. |
| `banner.ts` | The plugin's own banner, driven by new `MESSAGE_CREATE` events. |
| `menu.ts` | Adds the row to the menu of a chat, channel or server, found by the icon of the Mute row so it works in any language. |
| `Settings.tsx`, `report.ts` | The settings screen and the report. |
| `config.ts`, `state.ts`, `discord.ts`, `toast.ts`, `constants.ts`, `types.ts` | Helpers. |

A chat with one person is saved as that person, so they also count in group chats. Any other chat is saved as itself.

## Credits

Found with the decompiled Discord app by Wumpus-Central (discord-mobile-datamining).

## Developing

```sh
bun install
bun run build         # builds plugins/bypass-status/build/js/index.js
bun run test bypass-status
```
