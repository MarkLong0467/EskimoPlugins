# Server Info

Hold down a server icon and tap **Server Info** to see what the server is made of.

## What you get

A sheet with:

- The server's banner, icon, name and description.
- **Overview**: members, how many are online, your friends in the server, roles, channels and boost status.
- **Server details**: the owner (tap to open their profile), the vanity link, the day the server was created, and the
  server ID (tap to copy it).

Tap **Friends in this server** to see which of your friends are in it. Tap a friend to open their profile.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Patches the code that builds a server icon's menu (`getGuildsBarGuildMenuItems`) and cleans up when the plugin stops. |
| `menu.tsx` | Adds the **Server Info** item, a copy of the first item of the menu so it looks the same, and opens the sheet. |
| `ServerInfoSheet.tsx` | The sheet. It redraws when Discord's stores change. |
| `FriendsSheet.tsx` | The list of friends. |
| `friends.ts` | Finds your friends in a server. |
| `format.ts` | Dates, numbers and picture links. |
| `discord.ts`, `state.ts`, `constants.ts`, `types.ts`, `ActionSheetBody.tsx`, `Chevron.tsx` | Helpers. |

**Friends.** Discord only knows the members it has loaded. The plugin asks for the members who are your friends
(`requestMembersById`), waits for the answer (up to 1.5 seconds), then lists the friends who are members.

**The owner.** Many servers do not say who owns them. Then the plugin asks Discord's web API for the server, then for the
owner, and remembers the answer while the plugin runs so the next look is instant.

**Creation date.** A Discord ID holds the time it was made, so the date comes from the ID itself.

## Credits

Based on the Server Info plugin for Revenge by fshin, published in
<https://github.com/kmmiio99o/revenge-plugins> under CC0 (public domain). Rewritten for Valenced.

## Developing

```sh
bun install
bun run build         # builds plugins/server-info/build/js/index.js
bun run test server-info
```
