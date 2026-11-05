# Rich Presence

Set your own Discord presence ("Playing ...", "Listening to ...") from profiles you write in the settings.

## What you get

- **Profiles.** Keep several; switch with one tap. New, duplicate, delete, and copy or paste one as JSON.
- **Text with variables.** `{time}` `{time12}` `{seconds}` `{date}` `{day}` `{month}` `{year}` `{user}` `{username}`
  `{uptime}`, and `{sc_title}` `{sc_artist}` `{sc_url}` `{sc_art}` `{sc_button}` from the SoundCloud Presence plugin.
- **Images** from a direct link, an Imgur link, a page with a picture, or an asset key from your own Discord application.
- **A timer**: elapsed, same as the clock, countdown, custom (loops when both start and end are set), or from another plugin.
- **A party size** and up to **two buttons**.
- **Show only when** hides the presence while a text comes out empty, for example `{sc_title}` with nothing playing.
- **A live preview** at the top that follows what you type, and tells you if an image could not be sent.
- **Refresh every N seconds** (at least 15) to keep variables fresh.
- **Use for SoundCloud** adds a ready profile that shows the track from the SoundCloud Presence plugin.

## How it works

The presence is sent as a local activity (`LOCAL_ACTIVITY_UPDATE`) under a made-up process, the way a game would report it. It
is sent again when Discord reconnects, because Discord drops local activities then.

Other plugins can work with it through three globals:

| Global | Use |
| --- | --- |
| `globalThis.eskimoRichPresence.apply()` | Ask for the presence to be sent again. |
| `globalThis.eskimoVars` | Add variables (a name and a value). |
| `globalThis.eskimoTimestamps` | Give a `start` and `end` for a profile whose timer is "From another plugin". |

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts, stops, and sends again on reconnect. |
| `activity.ts` | Builds the activity from a profile and sends it. |
| `images.ts` | Turns image links and asset keys into asset ids. |
| `apply.ts` | Sends on a schedule, refreshes, and loops a custom timer. |
| `variables.ts` | Fills in variables and reads times and numbers. |
| `profiles.ts` | The shape of a profile, defaults, and filling in older saves. |
| `Settings.tsx`, `Preview.tsx`, `Field.tsx` | The settings screen, live preview, and a text box that saves when typing pauses. |
| `state.ts`, `constants.ts`, `types.ts` | Shared state, fixed values, and types. |

## Developing

```sh
bun install
bun run build         # builds plugins/rich-presence/build/js/index.js
bun run test rich-presence
```
