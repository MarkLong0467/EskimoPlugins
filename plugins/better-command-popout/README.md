# Better Command Popout

Adds **Copy Command Mention** and **Copy Command ID** to the popout that opens when you tap a slash command in a message.

> **Credit.** This plugin was made by [aliernfrog](https://github.com/aliernfrog) (Discord ID `459370047652102154`).
> This is a 1:1 port of their [Vendetta plugin](https://aliernfrog.github.io/vd-plugins/BetterCommandPopout/) to Valenced, published here by MarkLong0467. The idea, the rows, the texts and the behaviour are aliernfrog's.
> Licensed GPL-3.0, like the original.

## What you get

- Two rows at the top of the command popout:
  - **Copy Command Mention** copies `</name:id>`, which turns into a clickable command when you paste it in a message.
  - **Copy Command ID** copies the command's ID.
- A toast confirms each copy, with the same texts as the original.
- There is nothing to set: turn the plugin on or off.

## How it works

Discord opens the popout with `ActionSheet.openLazy(sheet, "ExecutedCommandPopout…")`. The plugin follows the same three steps as the original:

1. A `before` hook on `openLazy` catches the sheet by its tag.
2. The sheet's component is wrapped to find `CommandActionsContainer` in what it draws.
3. The container is wrapped to put the two rows in front of its list of rows (the array whose items hold a `TableRow`).

## Differences from the original

- **Wrapping instead of patching exports.** The original patched `default` of the sheet's module and the `type` of the container with `after`. Valenced hands the sheet over as a promise, so the plugin gives `openLazy` a promise of the same module with the component wrapped. The wrapped components are made once per original, so React keeps them between draws.
- **Keys.** The two rows have keys, so React does not warn about a list without them, and a list that is kept between draws does not get the rows twice.
- **Toast and clipboard** go through Valenced's own modules. The icon of the toast is `CopyIcon`, as in the original.

Nothing else is changed: same labels, same copied text, same toasts.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, whether the hook is on, how many popouts were opened, whether the container and the list of rows were found, how many rows were added and copies made, and the last events. If Discord changes the popout, it lists the names of the components Discord drew, so the new shape can be seen. It holds no command names or IDs and no message text.
- **Run self-check** shows which step works and which does not.
- **How it is going** (above it) shows the same steps with a tick or a cross, and tells you when to send the report.

## Source

Files: [`plugins/better-command-popout`](.). Original: <https://github.com/aliernfrog/vd-plugins/tree/main/plugins/BetterCommandPopout>
