# Better Medias

Better media playback for Discord on Android. Every feature has its own switch in the plugin's settings.

## What you get

- **Background playback.** Videos (with their sound), audio files and voice messages keep playing when you leave Discord or
  lock the screen. A switch for each.
- **Notification controls.** Android's media notification, like Spotify's: play/pause, back and forward 10 seconds, a seek
  bar, the position and the length.
- **Picture-in-Picture.** A playing video goes to a floating window when you leave Discord (home or recent apps). Discord's
  own Picture-in-Picture for calls is left alone while you are in a call.
- **Videos across chats.** Discord pauses whatever plays when you open another chat; with this on it keeps playing. A video
  in the full-screen viewer that you close while it plays carries on in a small player over Discord (drag it, tap to pause,
  ✕ to close).
- **Several at once.** While Discord is open, videos in the viewer play alongside other sound instead of pausing it. (Media
  inside chats, which are audio files, voice messages and chat videos, go through Discord's one chat player, which plays one
  thing at a time.)
- **Copy report** in the settings: what the plugin found on your phone, for when something does not work.

## How it works

- `js/audio.ts`: media inside chats play through Discord's native `MediaPlayerManager`, which reports times in milliseconds.
  - Its events feed the notification.
  - Discord's "pause everything" on chat change is skipped.
  - The chat player pauses itself a moment after Discord leaves the screen. If it was playing, it is started again right
    away.
  - Voice messages' own "pause on leave" listener is replaced.
- `js/videos.tsx`: Discord's video components (`modules/media_playback/native/Video.tsx`, or react-native-video in older
  builds) get their background and play-alongside switches turned on. Each video is tracked for the notification,
  Picture-in-Picture and the small player.
- `source/android/marklong/bettermedias/BetterMedias.java` (native, built to `android/better-medias.jar` with
  `sh source/android/build.sh`):
  - The notification (Android's MediaSession).
  - The small player.
  - Picture-in-Picture.
  - Hooks:
    - Discord's chat player is kept out of React Native's "app went to the background" call.
    - Its pause-all on chat change is skipped.
    - Its player is looked for so the notification can seek.

Every hook is guarded. If Discord changes and something is not found, that part stops working, the report says why, and
Discord carries on.
