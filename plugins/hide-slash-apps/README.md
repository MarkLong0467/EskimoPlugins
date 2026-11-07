# Hide Slash Apps

Press and hold an app's picture in the `/` menu to hide that app **everywhere**, or **only in the server you are in**.

Made for bots like MEE6 that sit in lots of servers, show up in your `/` menu, and cannot be removed or hidden from Discord's own settings.

## What you get

- **Long press to hide.** Open the `/` menu in a chat and press and hold an app's picture: the round pictures in the row at the bottom of the menu, or the small one next to the app's name above its commands. A sheet asks where to hide it:
  - **Hide everywhere**: the app is gone from the `/` menu in every server and DM.
  - **Hide in *server name***: only in the server you are in. It stays in your other servers.
  - In a DM there is no server, so only "Hide everywhere" is offered.
- **Gone at once.** The app disappears from the open menu straight away, and from what shows when you type after `/` (for example `/ra`).
- **Settings that are easy to read.** A step-by-step guide, a card for every hidden app (with its picture, the date and where it is hidden) and a **Show again** button on each. Apps hidden in one server are grouped under that server's name. **Show everything again** clears both lists (it asks you to tap twice).
- **Nothing is removed from Discord.** Only your `/` menu changes, on this phone. Commands you already sent still open their popout, and the bot stays in the server.
- **Copy logs and a self-check** at the bottom of the settings, made for finding out why it broke after a Discord update (see below).

## How it works

Discord's `/` menu is built from two hooks in its `ApplicationCommandQueryApi` module:

- `useDiscovery(options)` is the full menu. It returns the apps (`sectionDescriptors`, `activeSections`, which are also the pictures of the rail at the bottom), the commands under each app (`commandsByActiveSection`) and `commands`.
- `useQuery(context, query, options)` is what shows after typing `/ping`. It returns `commands` and `sections`.

The plugin wraps both: Discord's own hook runs, then the apps you hid are taken out of what it returned. The filtered copy is kept for as long as nothing changes, so Discord does not draw again and again. A small hook makes an open menu draw again when you hide or show an app.

The long press is added by watching Discord's components while they are drawn (the same way as in [No Suggestions](../no-suggestions)): `CategoryItem` (one picture in the rail) gets `onLongPress`, and `ApplicationSectionHeader` (the bar above an app's commands) is wrapped in a pressable. As a second way of hiding, those two components and `ApplicationCommandItem` (one command row) draw nothing for a hidden app, after Discord's own component has run so its hooks still run.

What you hide is saved as two lists: apps hidden everywhere, and apps hidden in a server (with the server's name, so the settings can show it). Only apps are hidden, never Discord's own built-in commands.

## Debugging

At the bottom of the settings:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, how many apps are hidden, and for each part of the plugin whether Discord's code was found and patched:
  - whether the module with `useDiscovery` and `useQuery` was found, and whether each hook was patched, how often it ran and how often it removed something,
  - whether the rail pictures, headers and command rows were seen, and whether the long press was added,
  - how many long presses were heard, sheets opened and hides done, and what the last press did,
  - **what Discord's results look like**: the names and kinds of the fields of what `useDiscovery` and `useQuery` return, of an app's section and of a command. If Discord renames something, this shows what it is called now,
  - the last events.

  It holds no app, server or command names and no ids.
- **Run self-check** shows which step works and which does not, with a hint for each.
- **Status** at the top of the settings says "Ready" (open the `/` menu once so the plugin can find it), "Working", or what is wrong.

## Source

Files: [`plugins/hide-slash-apps`](.). Code: `store.ts` (the hidden lists), `filter.ts` (the two hooks), `menu.tsx` (the long press), `sheet.tsx` (the sheet), `Settings.tsx`, `diag.ts`, `state.ts`, `index.ts`.
