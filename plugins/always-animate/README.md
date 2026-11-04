# Always Animate

Keeps animated pictures playing in Discord for Valenced: profile pictures, banners, server icons, avatar decorations (ears),
emoji, stickers, GIFs and nameplates, including in the native chat.

## Where it comes from

Version 4.0.0 merges two projects, both GPL-3.0-or-later:

- **fluttershy_simper67, Always Animate for Valenced 1.0.0-beta16** is the implementation: the picture, emoji, sticker and
  cosmetic animation in `index.js`, the chat bridge, and the native frame player (`android/always-animate.jar`, source in
  `source/android/`) that plays avatar decorations.
- **MarkLong0467** added the GIF and "Reduce motion" switches, "Refresh pictures", the settings screen rows for them, and
  the plugin's identity. Earlier versions (1.x to 3.x) of this plugin were a separate implementation and are in the git history.

Where the two overlapped, the beta16 code is used.

## Files

- `index.js` is the plugin, `manifest.json` its manifest, `android/always-animate.jar` the compiled native part.
- `source/android/` is the Java source of the jar plus the stubs and `build.sh` to rebuild it (needs a JDK and Android's `dx.jar`).
- `source/THEIR-README.md` is the original beta16 README (change log and test notes).
- Tests: `node tests/always-animate/smoke.cjs`, `node tests/always-animate/apng-gate.cjs` (from beta16) and
  `node tests/always-animate/extras.cjs` (the additions).

## Settings

Avatars & frames, Emoji, Stickers, Nameplates & roles, GIFs, Ignore "Reduce motion". Settings saved by 3.x (`pictures`, `emoji`, ...)
are not read any more; every switch starts on.
