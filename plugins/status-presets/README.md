# Status Presets

Save a status as a preset and switch to it with one tap.

## What you get

A preset is an online status (Online, Idle, Do Not Disturb, Invisible, or "keep mine"), plus a custom status with an
emoji and text, and when to switch back (never, 15 minutes up to 8 hours, or until midnight).

- **Seven starter presets**: Available, Busy, Away, Sleeping, Gaming, Invisible and Clear custom status.
- **Apply one with a tap** from the plugin's settings, from your account sheet (You tab, tap your avatar), or from the
  "Set your status" screen. The last two show the presets as an extra group of rows.
- **Undo** puts back the status you had before the last preset.
- **Make your own**: edit, rename, reorder, duplicate or delete presets, or save your current status as a preset. A
  server emoji can be pasted as `<:name:123456789012345678>`.
- **Self-check** and **report** for troubleshooting.

## How it works

Discord keeps your status in four "proto settings" (`StatusSetting`, `StatusExpiresAtSetting`, `StatusCreatedAtSetting`
and `CustomStatusSetting`, in `discord_app/modules/user_settings/UserSettings.tsx` of the decompiled app). Its own screens
call `.updateSetting(value)` on them. The plugin calls the very same functions, so the result is saved and synced exactly
like a status picked by hand. A moment after applying a preset it reads the settings back and says in the log whether
Discord took it.

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. |
| `status.ts` | Finds the four settings, reads your status now, writes to them. |
| `apply.ts` | Applies and undoes a preset, makes a preset from your status, tells if a preset is active. |
| `presets.ts` | Cleans, reads and writes the saved presets, and makes their labels. |
| `hook.tsx`, `SheetPresets.tsx` | Add the presets to the account sheet and the "Set your status" screen. |
| `Settings.tsx`, `NowCard.tsx`, `PresetList.tsx`, `EditPreset.tsx`, `components.tsx` | The settings screens. |
| `report.ts` | The report and the self-check. |
| `config.ts`, `state.ts`, `constants.ts`, `types.ts` | Helpers. |

## Credits

Found with the decompiled Discord app by Wumpus-Central (discord-mobile-datamining).

## Developing

```sh
bun install
bun run build         # builds plugins/status-presets/build/js/index.js
bun run test status-presets
```
