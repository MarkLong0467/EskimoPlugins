# Hide Slash Apps

Press and hold an app's picture in the `/` menu to hide that app **everywhere**, or **only in the server you are in**.

Made for bots like MEE6 that sit in lots of servers, show up in your `/` menu, and cannot be removed or hidden from Discord's own settings.

## What you get

- **Long press to hide.** Open the `/` menu in a chat and press and hold an app's picture: the round pictures in the row at the bottom of the menu, or the small one next to the app's name above its commands. A sheet asks where to hide it:
  - **Hide everywhere**: the app is gone from the `/` menu in every server and DM.
  - **Hide in *server name***: only in the server you are in. It stays in your other servers.
  - In a DM there is no server, so only "Hide everywhere" is offered.
- **Gone at once.** The app disappears from the open menu straight away, and from what shows when you type after `/` (for example `/ra`).
- **Hide single commands.** Press and hold a command in the list (also in what shows when you type after `/`). The sheet offers **Hide this command everywhere**, **Hide this command in *server name*** and **Hide all of *app*** (the whole app). The command is gone from the `/` menu; the app's other commands stay. If you hide every command of an app, the app's picture and header go too, so you never see an app that says it has no commands.
- **Switch off Discord's own commands.** The settings list every built-in command (`/shrug`, `/tableflip`, `/unflip`, `/tts`, `/me`, `/spoiler`, `/nick`, `/thread`, `/kick`, `/ban`, `/timeout`, `/msg`, `/leave`, `/roll-dice`, and any other Discord returns) with a switch each and a few words on what it does. Off means hidden everywhere. To hide a built-in command in just one server, press and hold it in the `/` menu.
- **Settings that are easy to read.** A step-by-step guide, the built-in switches, a card for every hidden app (with its picture, the date and where it is hidden) and a card for every hidden command (grouped under its app), each with a **Show again** button. Things hidden in one server are labelled with that server's name. **Show everything again** clears every list (it asks you to tap twice).
- **Nothing is removed from Discord.** Only your `/` menu changes, on this phone. Commands you already sent still open their popout, and the bot stays in the server.
- **Copy logs and a self-check** at the bottom of the settings, made for finding out why it broke after a Discord update (see below).

## How it works

Discord's `/` menu is built from two hooks in its `ApplicationCommandQueryApi` module:

- `useDiscovery(options)` is the full menu. It returns the apps (`sectionDescriptors`, `activeSections`, which are also the pictures of the rail at the bottom), the commands under each app (`commandsByActiveSection`) and `commands`.
- `useQuery(context, query, options)` is what shows after typing `/ping`. It returns `commands` and `sections`.

The plugin wraps both: Discord's own hook runs, then the apps you hid are taken out of what it returned. The filtered copy is kept for as long as nothing changes, so Discord does not draw again and again. A small hook makes an open menu draw again when you hide or show an app.

The long press is added by watching Discord's components while they are drawn (the same way as in [No Suggestions](../no-suggestions)): `CategoryItem` (one picture in the rail) gets `onLongPress`, and `ApplicationSectionHeader` (the bar above an app's commands) is wrapped in a pressable. As a second way of hiding, those two components and `ApplicationCommandItem` (one command row) draw nothing for a hidden app, after Discord's own component has run so its hooks still run.

Single commands are hidden in the same two hooks: a command is hidden when its app is hidden or its own id is. Built-in commands have small negative ids (`-1` is `/shrug`) and belong to the built-in section `-1`. `commandsByActiveSection` is a list of groups, one for each app, with the commands under it; the hidden commands are taken out of each group, and a group that had commands and has none left is dropped together with its app's picture. The long press on a command row is added to `ApplicationCommandItem` the same way as on the pictures. A row's own `guildId` is the server the *command* was made for (empty for most), not the server of the chat, so the server for "hide in this server" is the one the open menu's hooks were called for.

What you hide is saved as three lists: apps hidden everywhere, apps hidden in a server, and commands (each with its id, name, app and, if it is for one server, the server's name and id, so the settings can show them). Lists saved by version 1.0.0 keep working.

## Debugging

At the bottom of the settings:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, how many apps and commands are hidden, and for each part of the plugin whether Discord's code was found and patched:
  - whether the module with `useDiscovery` and `useQuery` was found, and whether each hook was patched, how often it ran and how often it removed something,
  - whether the rail pictures, headers and command rows were seen, and whether the long press was added to each,
  - how many lists were dropped because every command in them was hidden, which built-in commands Discord returned (by id), and whether the open menu is in a server or a DM,
  - how many long presses were heard, sheets opened and hides done, and what the last press did,
  - **what Discord's results look like**: the names and kinds of the fields of what `useDiscovery` and `useQuery` return, of an app's section and of a command. If Discord renames something, this shows what it is called now,
  - the last events.

  It holds no app, server or command names and no ids.
- **Run self-check** shows which step works and which does not, with a hint for each.
- **Status** at the top of the settings says "Ready" (open the `/` menu once so the plugin can find it), "Working", or what is wrong.

## Source

Files: [`plugins/hide-slash-apps`](.). Code: `store.ts` (the hidden lists), `builtins.ts` (Discord's built-in commands), `filter.ts` (the two hooks), `menu.tsx` (the long press), `sheet.tsx` (the sheet), `Settings.tsx`, `diag.ts`, `state.ts`, `index.ts`.
