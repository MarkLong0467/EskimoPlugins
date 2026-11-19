# Better Medias

Better media playback for Discord on Android. Every feature has its own switch in the plugin's settings.

## What you get

- **Background playback.** Videos (with their sound), audio files and voice messages keep playing when you leave Discord or
  lock the screen. A switch for each.
- **Notification controls.** Android's media notification, like Spotify's: play/pause, back and forward 10 seconds, a seek
  bar, the position and the length. Videos can be sought; Discord's own audio player only plays and pauses.
- **Picture-in-Picture.** A playing video goes to a floating window when you leave Discord (home or recent apps). Discord's
  own Picture-in-Picture for calls is left alone while you are in a call.
- **Several at once.** While Discord is open, videos, audio and voice messages play side by side instead of pausing each
  other. When Discord goes to the background, only the newest keeps playing; the others pause and do not start again by
  themselves.
- **Videos across chats.** A video you leave while it plays (closing the viewer, going to another chat) carries on, from the
  same moment, in a small player over Discord. Drag it anywhere, tap it to pause or play, ✕ to close. It also keeps playing in
  the background and fills the Picture-in-Picture window.
- **Copy report** in the settings: what the plugin found on your phone, for when something does not work.

## How it works

- `js/videos.tsx`: Discord's video component (react-native-video 5) already has switches to play in the background and
  alongside other sound; Discord leaves them off. They are turned on, and every video is tracked (position, length, playing)
  for the notification, Picture-in-Picture and the small player.
- `js/audio.ts`: Discord pauses voice messages when the app leaves the screen; that one listener is replaced by one that does
  not. Discord's native media player reports what plays, which feeds the notification.
- `source/android/marklong/bettermedias/BetterMedias.java` (native, built to `android/better-medias.jar` with
  `sh source/android/build.sh`): the notification (Android's MediaSession), the small player (Android's MediaPlayer on top of
  Discord's own window, no permission needed), Picture-in-Picture, and hooks: players are kept out of React Native's "app went
  to the background" call, and media asking for audio focus while Discord is open is told yes without taking it from the
  others (calls are never touched).

Every hook is guarded: if Discord changes and something is not found, that part stops working, the report says why, and
Discord carries on.
