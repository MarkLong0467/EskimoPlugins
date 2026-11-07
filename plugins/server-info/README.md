# Server Info

Hold down a server icon and tap **Server Info** to see what the server is made of.

## What you get

A sheet with a **Server info** title and an X to close it, then:

- **The server**: its banner (if it has one), icon, name and description, a **Community** badge (and Verified or Partnered
  when it is), and how many members are online and in the server.
- **Stat tiles**: channels (with how many are text and how many are voice), roles, emojis and stickers.
- **Boosts**: the boost level and how many boosts, a bar that shows how far it is to the next level, and how many more
  boosts that needs.
- **Friends**: how many of your friends are in the server, with their pictures. Tap it to see them and tap a friend to open
  their profile.
- **Owner**: their picture with an online dot, name and @name. Tap to open their profile.
- **Details**: the day the server was made and how long ago, the day you joined and how long ago, its verification level
  and language, its vanity link (tap to copy) and its server ID (tap to copy).

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Patches the code that builds a server icon's menu (`getGuildsBarGuildMenuItems`) and cleans up when the plugin stops. |
| `menu.tsx` | Adds the **Server Info** item, a copy of the first item of the menu so it looks the same, and opens the sheet. |
| `ServerInfoSheet.tsx` | The sheet. It redraws when Discord's stores change. |
| `FriendsSheet.tsx` | The list of friends. |
| `friends.ts` | Finds your friends in a server. |
| `format.ts` | Dates, "how long ago", boost levels, language names, numbers and picture links. |
| `parts.tsx` | The building blocks: cards, tiles, badges, the boost bar, rows and icons. |
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
