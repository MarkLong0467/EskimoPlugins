# Crop Plus

Crop pictures much smaller than Discord allows, by cropping the result again and again.

## The problem

Discord's picture cropper (Edit image, then Scale and Crop) has a smallest frame and a biggest zoom. No plugin can change
those, so one crop can only go so small.

## What you get

After each crop a sheet offers to crop **the result** again. Each crop starts from the picture you just made, so the
passes add up and the picture keeps getting smaller.

- **Ask me after each crop** shows a sheet: *Crop smaller*, *Use this one*, *Go back* to the crop before, or *Cancel*.
- **Keep going until it is small** opens the cropper again at once until the longest side is at most the size you pick.
  Cancel in the cropper keeps the last result.
- **Set up for the smallest crop** is one tap: automatic mode, no starting shape, down to 32 px, up to 15 crops.
- It can also set the cropper's starting shape (a ratio or free), grid, frame border and two-finger rotation, and shrink
  the result (widest, tallest, quality).
- A **self-check** and a **report** (copied to the clipboard) show what the plugin found and what it did.

Tip: pinch to zoom into the picture first, so the frame covers less, then tap the check mark.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts the hook and cleans up. |
| `hook.ts` | Wraps `openCropper` of Discord's image picker, the native cropper (react-native-image-crop-picker). |
| `crop.ts` | The loop of passes: runs the cropper, asks or goes on at once, undoes, cancels, deletes the pictures of earlier passes. |
| `options.ts` | Changes the options Discord gives the cropper, on a copy. |
| `ask.tsx` | The "crop again" sheet. |
| `Settings.tsx`, `components.tsx` | The settings screen. |
| `report.ts` | The self-check and the report. |
| `config.ts`, `state.ts`, `format.ts`, `constants.ts`, `types.ts` | Settings, counters and log, helpers, fixed values, types. |

Discord opens the cropper with `ImagePicker.launchCropper({ uri, freeStyleCropEnabled: true, width, height })`, which
becomes `openCropper({ path, width, height, freeStyleCropEnabled, ... })`. The plugin changes the options on the way in
and, when the cropper returns a picture, may open it again on that picture. The picture that goes back to Discord is the
last pass, in the form Discord expects (`path`, `width`, `height`, `mime`, `size`, `cropRect`).

Cancelling the **first** crop is a normal cancel. Cancelling a **later** one keeps the last result.

## Credits

Found with the decompiled Discord app by Wumpus-Central (discord-mobile-datamining).

## Developing

```sh
bun install
bun run build         # builds plugins/crop-plus/build/js/index.js
bun run test crop-plus
```
