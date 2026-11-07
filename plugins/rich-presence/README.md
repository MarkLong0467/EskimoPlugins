# Rich Presence

Show up to three presences at once on your Discord profile, and the SoundCloud track you are listening to.

## What you get

- **Several at once.** Switch on up to 3 presences. Each is its own card. Discord keeps only one "Playing", so make the others
  Listening to, Watching, Competing in or Streaming. Each needs its own Application ID (left empty, one is made up).
- **Easy settings.** A list with a switch for each presence; tap one to open its editor. The editor is one page you scroll
  down, like Kizzy's, with a big heading for each part: Basics, Text, Group size, Images, Timer, Buttons, Schedule,
  Application ID, Variables and Manage. Options that depend on a choice (the dates of a timer, the days of a schedule)
  appear when you choose it. Add, duplicate, delete, copy and paste presences.
- **Big group sizes.** Any whole number up to 2147483647, such as `999999999 of 999999999`, with Kizzy's checks under the
  boxes (digits only, more than 0, and the number in the group cannot be more than the size).
- **SoundCloud built in.** Add a SoundCloud presence; its editor shows only the SoundCloud settings (Last.fm now playing via
  Pano Scrobbler, a pasted or copied link, cover lookup, progress bar, Spotify hiding, button).
- **Many timers.** Since switched on, since Discord opened, since a date, until a date (repeating daily, weekly, monthly or
  yearly), countdown (can start over), until midnight, time of day, a progress bar between two times each day, your own start
  and end (loops when both are set), or from the SoundCloud track. Date fields say how they read what you typed.
- **Schedule.** Show a presence only on chosen days and between two times; it appears and goes by itself.
- **Text with variables.** `{time}` `{time12}` `{seconds}` `{date}` `{day}` `{month}` `{year}` `{user}` `{username}`
  `{uptime}` and `{sc_title}` `{sc_artist}` `{sc_url}` `{sc_art}` `{sc_button}`.
- **Images** from a direct link, an Imgur link, a page with a picture, or an asset key. Party size, two buttons, and
  **show only when**.
- **A live preview** that follows what you type.

## How it works

Each presence is sent as its own local activity (`LOCAL_ACTIVITY_UPDATE`) under its own made-up socket and process, the way a
game would report it, and sent again when Discord reconnects. A watcher checks the clock once a second for timers that change
by themselves and for schedules starting or ending.

Globals: `globalThis.eskimoRichPresence.apply()` (send again), `globalThis.eskimoVars` (variables), `globalThis.eskimoTimestamps`
(start and end for "From the SoundCloud track").

The code is in `js/`: `index.ts` (entry), `apply.ts` (sending, watcher), `activity.ts` (builds an activity and its timer),
`timers.ts` (time rules), `profiles.ts` (profiles and which are shown), `soundcloud.ts`, `present.ts`, `lastfm.ts`,
`lookup.ts`, `scstate.ts`, `format.ts` (SoundCloud), `images.ts`, `variables.ts`, `actions.ts`, and the screens `Settings.tsx`,
`EditProfile.tsx`, `SoundCloudEditor.tsx`, `Preview.tsx`, `Field.tsx`, `ui.tsx`.

## Developing

```sh
bun install
bun run build
bun run test rich-presence
```
