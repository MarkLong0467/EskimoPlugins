# Call Battery Saver

Uses less battery in voice calls while you are **muted** or **deafened**.

When you mute in a call, Discord only stops *sending* your voice. Your mic keeps recording, and every sound still goes through Discord's voice processing: echo cancellation, noise suppression, gain control and Krisp noise cancellation. When you deafen, other people's cameras still come in. This plugin cuts that work while you don't need it.

## What you get

- **Skip Krisp while muted** (on by default). Krisp noise cancellation is the heaviest part of the mic processing. Discord built an option into its voice engine that skips it while you are muted, but it is behind an experiment that is off for everyone (`2026-08-mute-aware-noise-cancellation`). This turns that option on. It has no downside: Krisp comes back the moment you unmute.
- **Pause all mic processing while muted** (off by default). Also turns off echo cancellation, noise suppression and gain control while muted, and puts your own settings back when you unmute. If you change one of those settings in Discord while muted, your change is what comes back. Your voice can sound slightly off for a second or two after unmuting while echo cancellation settles again.
- **Pause other people's cameras while deafened** (on by default). Receiving and showing video uses far more battery than voice. This uses Discord's own automatic video toggle (the one Discord uses when your connection is bad), so nothing is saved: the cameras come back when you undeafen. A camera you turned off yourself is left alone. Screen shares are not touched.
- **Timers** (off by default):
  - **Remind me after** 15 minutes to 3 hours deafened: a toast and a short vibration.
  - **Leave the call after** 15 minutes to 3 hours deafened.
  - **Count while muted too**: the timers also count while you are only muted.
- A **Debugging** section at the bottom: **Copy logs** and **Run self-check**.

## What it can't do (yet)

It does not switch the microphone off completely, so Android's green mic dot stays on while you are muted. That would need a native (Java) part that stops the recording inside Discord's voice engine, and it is not known yet how Discord's engine reacts to that. It needs testing on a phone first.

How much you save depends on your phone and the call. In a long call, most of the battery still goes to the screen and the network.

## Privacy

Everything stays on your phone. The report that **Copy logs** makes holds switches and counts, never who is in the call.

## How it works

From the decompiled Discord app (Wumpus-Central/discord-mobile-datamining): `MediaEngineStore.updateConnectionMuteDeaf` calls `connection.setSelfMute(...)` and `connection.setSkipNoiseCancellationIfMuted(experiment && muted)`. Each setter of `Connection.tsx` (`setEchoCancellation`, `setNoiseSuppression`, `setNoiseCancellation`, `setAutomaticGainControl`) passes a transport option to the voice engine.

- The connection class is found from a live connection (`MediaEngineStore.getMediaEngine().eachConnection`). Its `setSkipNoiseCancellationIfMuted` is patched to always ask for `true`, and while the processing is paused its setters keep what Discord asks for so it can be put back later.
- Cameras are paused with the `AUDIO_SET_LOCAL_VIDEO_DISABLED` action, with `isAutomatic: true` and `persist: false`.
- Leaving the call uses Discord's `disconnect` action, as the voice panel's button does.
- Go Live stream connections are never touched.

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin. |
| `engine.ts` | Watches the call and the mute state, patches the connection and does the saving. |
| `Settings.tsx` | The settings screen. |
| `config.ts`, `discord.ts`, `diag.ts` | Settings, toasts and icons, and the debugging report. |
