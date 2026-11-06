# Better Chat Buttons

Hides the chat bar buttons that get in the way, or makes them never collapse, all configurable.

> **Credit.** This plugin was made by [PalmDevs](https://github.com/PalmDevs) (Discord ID `629368283354628116`).
> This is a 1:1 port of their [Revenge plugin](https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/better-chat-buttons) to Valenced, published here by MarkLong0467. The idea, the code and the behaviour are PalmDevs'.
> Licensed GPL-3.0-or-later, like the original.

## What you get

- **Hide Action Buttons**: switches for **Apps & Commands**, **Gift**, **New Thread** and **Voice Message**. All four are hidden by default, as in the original.
- **Send Button Collapse Behavior**: *Never collapse* (the default) or *Collapse when no text*.
- **Action Buttons Collapse Behavior (Legacy)**: *Collapse while typing* (the default) or *Never collapse*.
- Changes show the next time the chat bar is drawn: switch to another chat and back if one does not.

## How it works

The chat bar parts `ChatInputSendButton`, `ChatInputActions` and `ChatInputRightActions` get their buttons from props such as `canSendVoiceMessage`, `isAppLauncherEnabled`, `canStartThreads` and `shouldShowGiftButton`. The plugin changes those props just before the parts draw. For collapsing, it wraps what the parts give out through their refs (`setHasText` of the send button, `onDismissActions` of the action buttons).

## Differences from the original

These are fixes for how Valenced works, not changes to what the plugin does:

- Valenced's patcher needs a hook to return the arguments or the result, so each hook returns them.
- The original wrapped the refs again every time the bar was drawn. Each ref is wrapped once.
- With *Collapse when no text*, the send button is hidden only while that setting is on. In the original it stayed hidden after switching the setting off, until you typed.
- The old settings migrations from Vendetta are left out, since a new install has nothing to migrate.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings, which chat bar parts were found and the last events.
- **Run self-check** shows which of the three parts were found. A chat bar part is only found once you have opened a chat.

## Source

Files: [`plugins/better-chat-buttons`](.). Original: <https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/better-chat-buttons>
