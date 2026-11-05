# SoundCloud Presence

Show the SoundCloud track you are listening to as a "Listening to" status on your Discord profile.

## Where the track comes from

Discord cannot see what another app is playing, so the track comes from one of two places:

- **Automatic (Last.fm).** A scrobbler app such as Pano Scrobbler reads the SoundCloud app's media notification and reports
  it to Last.fm. This plugin reads your Last.fm "now playing" every few seconds (5 to 60, you choose), so the status
  changes by itself with each song. You need your Last.fm name and a free API key (last.fm/api/account/create).
- **A link.** Paste a SoundCloud link, pick one from Recent, or copy one in SoundCloud (Share, then Copy link) and let the
  plugin check the clipboard when Discord opens. A link gives the exact track, cover and length.

When both exist, automatic mode wins while a song is playing.

## What you get

- Title, artist, cover, a progress bar or elapsed time, and a button (a link's own button, or a SoundCloud search for
  automatic tracks).
- The status text after "Listening to": SoundCloud, the artist, or the title.
- Missing covers are looked up in Apple Music's public search (only an exact title and artist match is used), then a
  default SoundCloud cover is shown rather than an empty box.
- It steps aside while another app, such as Spotify, shows its own "Listening to" card.
- It clears when the track ends, and picks up the next song as soon as the last one ends.
- A live preview at the top of the settings.
- **Show it with**: this plugin, or hand the track to the **Rich Presence** plugin as `{sc_title}` `{sc_artist}` `{sc_url}`
  `{sc_art}` `{sc_button}` so your own profile can show it. (In Rich Presence tap "Use for SoundCloud".)

Discord allows 5 presence updates per 20 seconds. The plugin sends at most 4, drops repeats, and lets only the newest wait.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts checking, and listens for Discord reconnecting, the app coming back and Spotify. |
| `lastfm.ts` | Follows Last.fm: checks now playing, looks up the length and cover, and gives a second look before clearing. |
| `lookup.ts` | Reads a pasted link from the page and SoundCloud's oEmbed. |
| `apply.ts` | Puts the right status on the profile; shows a link; stops; checks the clipboard. |
| `present.ts` | Builds the activity and sends it within Discord's limits. |
| `rich.ts` | Hands the track to Rich Presence. |
| `images.ts` | Has Discord host the cover. |
| `Settings.tsx`, `Preview.tsx`, `Field.tsx` | The settings screen. |
| `state.ts`, `format.ts`, `constants.ts`, `types.ts` | Helpers. |

`cover.png` is the default cover. Published versions load it from this repository's `main` branch, so keep it at
`plugins/soundcloud-presence/cover.png`.

## Developing

```sh
bun install
bun run build         # builds plugins/soundcloud-presence/build/js/index.js
bun run test soundcloud-presence
```

The test runs the plugin on a clock that goes 25 times faster than the real one, so seconds-long timers take a moment.
