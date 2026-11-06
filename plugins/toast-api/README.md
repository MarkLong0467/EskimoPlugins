# Toast API

Provides API for custom toast notifications used by other plugins.

> **Credit.** This plugin was made by [kmmiio99o](https://kmmiio99o.dev) ([GitHub](https://github.com/kmmiio99o), Discord ID `879393496627306587`).
> This is a 1:1 port of their [Revenge Next plugin](https://git.gay/kmmiio99o/revenge-next-plugins) to Valenced, published here by MarkLong0467. The code, the ideas and the behaviour are kmmiio99o's.
> Licensed GPL-3.0, like the original.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings (usernames, keys, tokens and links' query strings are hidden), which patches were installed, the errors that were caught and the last events. Paste it in a chat when something breaks.
- **Run self-check** asks the plugin which of its parts were found and shows the answers on the screen.

The code for both is in [`shared/kmmiio/`](../../shared/kmmiio).

## Source

Files: [`plugins/toast-api`](.). Original: <https://git.gay/kmmiio99o/revenge-next-plugins/src/branch/main/plugins/toast-api>
