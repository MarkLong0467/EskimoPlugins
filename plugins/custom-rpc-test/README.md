# CustomRPC Test

A test version of [Rich Presence](../rich-presence) that can show **several presences at once**.

It is a separate plugin on purpose: Rich Presence is untouched, and the two can run together (they use different fake sockets and a different global). When this works well, the idea can move into Rich Presence.

## What is different from Rich Presence

- **Each profile has its own switch** under **Showing now**. Every profile that is on is sent to Discord as its own activity, so each one appears as an activity of its own on your profile.
- **A limit** (**Most presences at once**, 1 to 5, 3 by default). The first profiles that are on, in the order of the list, are shown. One that is on but over the limit waits, and the list says so.
- **A status under every switch**: shown, off, over the limit, needs an Activity name, hidden because its "show only when" text is empty, a second Playing, or a duplicate.
- **Separate timers.** Each profile has its own start time and its own looping countdown, so a looping timer on one does not restart the others. `{uptime}` counts from when that profile was applied.
- **Edit profile** chooses which profile's fields are below, apart from which are shown.
- **Three actions**: apply everything, apply only the profile being edited, and clear every presence.
- **Copy logs and a self-check** at the bottom of the settings. The report has numbers and kinds only, never names or texts.

Everything else is the same as Rich Presence: variables (`{time}`, `{date}`, `{uptime}`, the SoundCloud ones and so on), images from links or asset keys, a timer, a party size, up to two buttons, "show only when", a live preview of the profile being edited, and refreshing every N seconds.

## How it works

Discord's local activity store keeps one activity **for each socket id** (`LOCAL_ACTIVITY_UPDATE` carries `socketId`, `pid` and the activity) and merges all of them into the list it shows and sends. Rich Presence sends everything under one socket, so there can only be one. This plugin gives each profile its own socket (`EskimoCustomRpcTest:<profile id>`) and its own process number, and sends each one separately. Switching a profile off sends `null` for only its socket.

The profiles are sent one after another, 0.4 seconds apart, so Discord is not given a burst of presence updates. They are sent again when Discord reconnects, because Discord drops local activities then.

## Two rules of Discord's that decide what shows

Found in Discord's code (`SelfPresenceStore`), and the plugin works with both:

1. **Only one "Playing" at a time.** Discord's app keeps one Playing activity when there are several, and keeps every other kind. So make the others **Listening to**, **Watching**, **Competing in** or **Streaming**, which can all show together next to one Playing. The plugin sends only the first Playing profile and tells you why the others are left out. A new profile starts as the next free kind, so it can show.
2. **Activities of the same application are one activity.** Rich Presence sends application id `0` for every profile with none of its own. Here, a profile with no Application ID gets its own made-up one (the same every time), so each profile is a different activity. If you type the same Application ID, kind and name in two profiles, one is left out.

## Things to know while testing

- **Discord's servers decide.** The app has no limit beyond the two rules above that I found, but the servers may show fewer activities than are sent, and your member-list status shows only one. Your profile can show several. The report from Copy logs shows how many activities Discord's own lists hold, to tell where one is lost.
- **SoundCloud Presence** asks Rich Presence, not this plugin, to resend when the track changes. Here the track shows on the next refresh, so set **Refresh every (seconds)** to 15 or more for a SoundCloud profile.
- Discord doesn't show buttons on your own profile, and your presence only shows if Discord may share your activity in your privacy settings.

## Other plugins can use

| Global | Use |
| --- | --- |
| `globalThis.eskimoCustomRpcTest.apply()` | Ask for the presences to be sent again. |
| `globalThis.eskimoVars` | Variables (shared with Rich Presence). |
| `globalThis.eskimoTimestamps` | The start and end for a profile whose timer is "From another plugin" (shared with Rich Presence). |

## The code

In `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts, stops, and sends again on reconnect. |
| `activity.ts` | Builds the activity of one profile and sends it under that profile's socket. |
| `apply.ts` | Sends every profile that is shown, takes away the others, refreshes, and loops the custom timers. |
| `state.ts` | What each profile needs: its socket, its process and its timers. |
| `profiles.ts` | The shape of a profile, the defaults, the limit and which profiles are shown. |
| `images.ts`, `variables.ts` | Image links and asset keys, and the text variables (the same as Rich Presence). |
| `Settings.tsx`, `Preview.tsx`, `Field.tsx` | The settings screen, the live preview and a text box that saves when typing pauses. |
| `constants.ts`, `types.ts` | Fixed values and types. |
