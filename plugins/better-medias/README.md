# Better Medias

Better media playback for Discord on Android. Every feature has its own switch in the plugin's settings.

## What you get

- **Background playback.** Videos (with their sound), audio files and voice messages keep playing when you leave Discord or
  lock the screen. A switch for each.
- **Notification controls.** Android's media notification, like Spotify's: play/pause, back and forward 10 seconds, a seek
  bar, the position and the length. Pausing inside Discord removes the notification, and so does Discord stopping a video
  by itself (scrolled past, or its chat left); it stays for media paused while Discord is in the background (from the
  notification or the lock screen).
- **Picture-in-Picture.** When you leave Discord while a video plays, it goes to a floating window. Chat videos are shown
  there by the plugin's own small player, because Discord's floating window only shows calls. Discord's Picture-in-Picture
  for calls is left alone while you are in a call.
- **Videos across chats.** Discord pauses whatever plays when you open another chat. With this on, audio keeps playing, and a
  chat video carries on in a small player over Discord, from the same moment. Drag it, tap to pause, or ✕ to close.
- **Several at once.** Discord's chat player plays one thing at a time. With this on, whatever was playing when you start
  something else carries on in the small player: a song next to a voice message, for example. Very short clips (GIF-like
  videos) are left alone.
- **Seek bar.** The notification's seek bar and its ±10 s buttons move Discord's chat player.
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
