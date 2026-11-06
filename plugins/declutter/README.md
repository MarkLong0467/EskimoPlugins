# Declutter

Hide profile clutter: avatar decorations, nameplates, profile effects, profile frames, server tags, and badges. Aswell as Nitro/Payment settings.

> **Credit.** This plugin was made by [kmmiio99o](https://kmmiio99o.dev) ([GitHub](https://github.com/kmmiio99o), Discord ID `879393496627306587`).
> This is a 1:1 port of their [Revenge Next plugin](https://git.gay/kmmiio99o/revenge-next-plugins) to Valenced, published here by MarkLong0467. The code, the ideas and the behaviour are kmmiio99o's.
> Licensed GPL-3.0, like the original.

## Needs

Install and turn on **kmmiio Library** first.

## Native part

The two chat-row toggles (avatar decorations and server tags in chat) need the native part of **kmmiio Library**, which is not built yet. The other toggles work without it.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings (usernames, keys, tokens and links' query strings are hidden), which patches were installed, the errors that were caught and the last events. Paste it in a chat when something breaks.
- **Run self-check** asks the plugin which of its parts were found and shows the answers on the screen.

The code for both is in [`shared/kmmiio/`](../../shared/kmmiio).

## Source

Files: [`plugins/declutter`](.). Original: <https://git.gay/kmmiio99o/revenge-next-plugins/src/branch/main/plugins/declutter>
