# I Remember You

Locally saves everyone you've been communicating with (including servers), in case of loss. If you lose your account, are
removed from a server or a friend changes their name, you still have a list of who they were: their name, their user ID and
the server you knew them from.

A port of [IRememberYou for Equicord](https://equicord.org/plugins/IRememberYou) by zoodogood, keircn and tt.

## Who is remembered

- **People you mention or reply to.** When you send a message, the person you reply to and everyone you @mention is saved,
  under the server of the channel (or under **dm** outside a server).
- **The owner of every server you are in**, marked **(owner)**.
- **The members of servers you own**, up to 1,000 per server.
- **Your friends**, under **Friends**, and **the people you have DMs with**, under **dm**. Each group DM is its own group,
  under its name. Equicord does not do this: there a friend is kept only once you mention or reply to them.

Bots are left out. Everything stays on your phone; nothing is sent anywhere.

## The list

Open the plugin's settings. Servers are listed with the most people first, each with its people.

- Tap a **picture** to open the profile.
- Tap an **ID** to copy it. Long press a user ID for Copy User ID and View Profile, or a server ID for Copy Server ID.
- Long press a **name** to see when that person was last seen.
- **Filter by tag, username** finds people by part of their name. It is case-sensitive, as in Equicord.

## Saving

The list is saved every three minutes, as in Equicord, and once more when the plugin stops (Equicord does not, so the last
few minutes could be lost there).

## Differences from Equicord

- Equicord hears a message before it is sent through its MessageEvents API. Discord's `sendMessage` is wrapped here instead,
  and the reply it carries is read the same way.
- The list is the plugin's settings screen, where Equicord adds a tab to its settings.
- Right-click menus are long presses, and the tooltip on a name is a long press, because a phone has neither.
- On a phone the plugin can start before Discord has your servers, so owners and members are gone through again once Discord
  connects.

- Friends, DMs and group DMs are added (see above).

## Files

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin: reads the saved list, takes the servers and wraps `sendMessage`. |
| `data.ts` | The list and how it is filled (Equicord's `components/data.tsx`). |
| `Settings.tsx` | The list on screen (Equicord's `components/ui.tsx`). |
| `discord.ts` | Discord's stores, copying with a toast and opening a profile. |
| `config.ts` | What is saved. |
| `diag.ts` | Copy logs and the self-check (counts only, no names). |
