# Better Folders

A port of **BetterFolders** by [fres](https://github.com/fres621) ([fres621/vendetta-plugins](https://github.com/fres621/vendetta-plugins)) for Valenced.

Two small things for the server bar:

- **Hide icons.** A collapsed folder shows the plain folder icon, in the folder's colour, instead of little pictures of the servers inside it.
- **Auto collapse.** Opening a folder closes the other open folders.

Both start off, like the original, and both apply as soon as you switch them. You do not have to leave the settings first.

## What you get

- The same two options with the same words as the original.
- **Settings that are easy to read.** A status line, the two switches, how many folders you have and how many are open.
- **Copy logs and a self-check** at the bottom of the settings, made for finding out why it broke after a Discord update (see below).

## How it works

**Auto collapse** is the original's logic. Opening or closing a folder dispatches `TOGGLE_GUILD_FOLDER_EXPAND` with the folder's id. The plugin listens to it. When the folder that was toggled is now open, it toggles every other open folder (from `UserSettingsProtoStore.getGuildFolders()` and `ExpandedGuildFolderStore.isFolderExpanded()`), which closes them.

**Hide icons** does the same thing as the original, in the way Discord draws folders now. The original replaced the children of Discord's old `GuildContainer`, which no longer exists. Discord's `GuildsBarGuildFolder` now draws its folder through a `TransitionGroup` whose `items` are `[{ type: 'icon', tintStyle }]` for an open folder (the folder icon) or `[{ type: 'preview', guilds }]` for a closed one (the small server pictures). The plugin finds the component by name while it is drawn (see [`shared/palmdevs/jsxFind.ts`](../../shared/palmdevs/jsxFind.ts)), gives React a stand-in that runs Discord's own component, and when the folder is closed and the switch is on, swaps the `preview` item for the `icon` item with the folder's colour. The `icon` item has the same key an open folder uses, so opening and closing still animates. A small hook makes a folder that is already on screen draw again when you switch Hide icons, so it changes at once.

Nothing about your folders is changed: their servers, names and colours stay as they are.

## Debugging

At the bottom of the settings:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings, and:
  - how many folders are in the server bar and how many are open,
  - whether Discord's folder component was drawn and found, how many collapsed folders were drawn, how many had their server pictures swapped, and how many were drawn in a shape the plugin did not expect,
  - whether Discord's module that works out folder colours was found,
  - for Auto collapse: whether the dispatcher is listening, whether Discord's folder stores can be read, how many folder toggles were seen and how many other folders were closed,
  - **what Discord's folder drawing looks like**: the names and kinds of the fields of what a folder draws and of its items. If Discord renames something, this shows what it is called now,
  - the last events.

  It holds no folder or server names.
- **Run self-check** shows which step works and which does not, with a hint for each.
- **Status** at the top of the settings says "Ready" (look at the server bar once so the plugin can find your folders), "Working", or what is wrong.

## Source

Files: [`plugins/better-folders`](.). Code: `icons.tsx` (Hide icons), `collapse.ts` (Auto collapse), `folders.ts` (reads Discord's folder stores), `store.ts` (settings), `Settings.tsx`, `diag.ts`, `state.ts`, `index.ts`.
