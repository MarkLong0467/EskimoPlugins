# Spotify Tools

Listen along with friends on Spotify, and send what you are playing from the **+** menu.

## What you get

- **Listen along button.** A button next to **Play on Spotify** on other people's Spotify activity. Tap it to join their
  session. The plugin then follows them: when their song changes, yours does too.
- **Send listen along.** Sends the invite card for the song you are playing. What you typed in the message box becomes its
  message.
- **Send song link.** Sends a link to the song you are playing.
- **Send playing album.** Sends a link to its album.

The three send options appear in the **+** menu next to the message box. Each feature has its own switch in the settings.

You need Spotify linked to Discord. Listening along needs Spotify Premium and Spotify open on your phone.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Finds the Play on Spotify button, Discord's Spotify controls and the menu, and listens to presence changes. |
| `ListenButton.tsx` | The Listen along button, drawn beside Discord's own. It is dimmed, with a reason, when it cannot be used. |
| `listen.ts` | Starts listening and follows the other person's songs. |
| `web.ts` | Plays through Spotify's web API when Discord's own controls cannot be found. |
| `menu.ts` | Adds the send options to the **+** menu. |
| `send.ts` | Sends the invite and the links to the chat you have open. |
| `activity.ts` | Reads what is playing, from Discord's Spotify store or, if that is empty, from your own presence. |
| `patchComponent.ts` | Patches a component of any shape: a class, a function, or a memo or forwardRef wrapper. |
| `Settings.tsx`, `config.ts`, `discord.ts`, `constants.ts`, `types.ts` | Settings screen and helpers. |

**Listening along.** With Discord's own controls, the plugin starts Spotify (`play`) and joins the session (`sync`). If
they cannot be found it uses Spotify's web API with the sign-in Discord holds, and starts the track *inside its album*
at the other person's position, because asking for the bare track can stop your song and play nothing.

**The + menu.** Discord's menus are data driven: a list of items goes in, and the menu draws it. The plugin adds items
to that list. It finds the menu by its labels (Camera, Photos, Poll, Files, Apps) or, in any language, by the names of
its icons.

## Credits

Based on the "Add Listen Along" and "Send Spotify invite" modules of nexpid's NexxUtils for Revenge (CC BY 4.0),
<https://github.com/nexpid/RevengePlugins>. Native listen along sync and song-change following by DEVILS1NGH.

## Developing

```sh
bun install
bun run build         # builds plugins/spotify-tools/build/js/index.js
bun run test spotify-tools
```
