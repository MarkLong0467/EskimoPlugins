# kmmiio Library

Shared utility modules and native hooks for kmmiio99o plugins.

> **Credit.** This plugin was made by [kmmiio99o](https://kmmiio99o.dev) ([GitHub](https://github.com/kmmiio99o), Discord ID `879393496627306587`).
> This is a 1:1 port of their [Revenge Next plugin](https://git.gay/kmmiio99o/revenge-next-plugins) to Valenced, published here by MarkLong0467. The code, the ideas and the behaviour are kmmiio99o's.
> Licensed GPL-3.0, like the original.

## Native part

Its **native part** (Kotlin) is ported but not built yet, so the parts that need it are inactive: the bubble and chat-row hooks used by Chat Bubbles and Declutter, and the MediaSession bridge used by Multi Scrobbler. Everything else in the library works.

## Debugging

At the bottom of the settings are two additions that are not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings (usernames, keys, tokens and links' query strings are hidden), which patches were installed, the errors that were caught and the last events. Paste it in a chat when something breaks.
- **Run self-check** asks the plugin which of its parts were found and shows the answers on the screen.

The code for both is in [`shared/kmmiio/`](../../shared/kmmiio).

## Source

Files: [`plugins/kmmiio-lib`](.). Original: <https://git.gay/kmmiio99o/revenge-next-plugins/src/branch/main/plugins/kmmiio-lib>
