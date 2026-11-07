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
- with some, it clears them and still draws nothing (on some Discord versions the section shows channels from Discord's own stores whatever list it is given).

Clearing does what Discord's own "Clear" option on the Suggested header does (from Discord's source, `OptInChannelsUtils.clearRecentChannels`): it saves that you dismissed the section (`guildRecentsDismissedAt` in your server settings), sends `BULK_CLEAR_RECENTS`, and marks the channels read (`bulkAck`). The rows of the section are channels that are new, unread, mention you or were visited lately, so sending the event alone leaves most of them on the screen. The plugin looks for Discord's function by name and by the path of its file. If it cannot be found it calls `bulkClearRecents` and `bulkAck` itself, and only then falls back to the event alone. The clear runs a moment after the draw, not in the middle of it.

## Differences from the original

- **Finding the section.** The original found Discord's module with `findByProps`. Valenced's finders only see modules Discord has already loaded, so the plugin watches for `SuggestedCategory` to be drawn and swaps in its own version for that element. The module is patched too if it is found, and the two never do the work twice.
- **Hooks.** Discord's own component is always run, even when the section is drawn empty, so its hooks run on every draw.
- The same suggestions are not cleared again for a few seconds, since Discord can draw the section more than once before it has updated.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, what was found and patched, the counts and the last events. It holds no channel or server names.
- **Run self-check** shows which parts were found.

## Source

Files: [`plugins/no-suggestions`](.). Original: <https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/no-suggestions>
