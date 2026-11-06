# No Suggestions

Removes the annoying "Suggested" channel section of a server's channel list, which comes back even after you remove it.

> **Credit.** This plugin was made by [PalmDevs](https://github.com/PalmDevs) (Discord ID `629368283354628116`).
> This is a 1:1 port of their [Revenge plugin](https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/no-suggestions) to Valenced, published here by MarkLong0467. The idea, the code and the behaviour are PalmDevs'.
> Licensed GPL-3.0-or-later, like the original.

## What you get

- The "Suggested" section no longer shows. There is nothing to set: turn the plugin on or off.
- The settings show whether the section was found and how many times suggestions were cleared.
- You may need to switch to another server and back for it to take effect.

## How it works

Discord draws the section with `SuggestedCategory({ guildId, channelIds, withMarginTop })`. The plugin replaces it:

- with no suggestions, it draws nothing,
- with some, it asks Discord to clear them (`clearRecentChannels`, the same request the section's own "clear" option sends) and draws the section with none.

More than one file has the section in Discord (the one that defines it and the one that re-exports it), so every copy is patched, including a copy that loads later.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, what was found and patched, the counts and the last events. It holds no channel or server names.
- **Run self-check** shows which parts were found.

## Source

Files: [`plugins/no-suggestions`](.). Original: <https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/no-suggestions>
