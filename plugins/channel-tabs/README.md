# Channel Tabs

Keep channels, DMs, threads and forum posts open as **tabs**, like a browser, and split the screen to read two at once.

## Using it

- A bar of tabs sits above the chat (or on the left; pick in the settings).
- **＋** on the bar saves the channel you are in as a tab. A thread or a forum post is a channel, so it works for those too.
- **Tap** a tab to switch to it. The open one is highlighted.
- **✕** on a tab closes just that tab. **✕ all** closes every tab.
- **Split**, or **holding** a tab, shows a second channel next to the one you are in (one above the other, or side by side; pick in the settings). Tap the tab of the second half to swap the two halves. Tap **Unsplit** to go back to one.

Tabs are remembered when you close Discord. A split is not.

## How it works

Discord draws a channel (header, messages, message box) with one component, `StandaloneChannelScreen`. The plugin finds it by its source path and puts a hook before each of its elements that swaps it for a frame: the bar, then the screen itself with the same props. For a split the frame draws the screen a second time with the other channel's id. A channel is opened the way a tap in the channel list does (`transitionToChannel`). Nothing of Discord is replaced, and the hook is taken off when the plugin stops.

The settings have a **What it found** section: `channel screens` says how many screens were framed, `split panes` how many times a second half was drawn. **Copy logs** has the same counts.

## Limits

- Discord was not made to show two chats at once. The second half uses Discord's own channel screen, so its messages, replies and message box work, but anything that follows "the channel you are in" (such as marking as read or typing indicators) may follow the first half only.
- The keyboard moves both message boxes. If that is in the way, use **Top and bottom** and tap the half you write in.
