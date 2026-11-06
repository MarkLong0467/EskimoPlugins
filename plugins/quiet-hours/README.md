# Quiet Hours

Switches your status to **Do Not Disturb** (or Idle, or Invisible) on a schedule you set, such as weeknights from 11 PM to 7 AM, and puts your old status back afterwards. One tap skips tonight.

## What you get

- **A schedule**: pick the days a night starts on, and the start and end times (every 15 minutes, with AM/PM). An end time earlier than the start means the next morning. A night belongs to the day it starts on, so Friday with 11 PM to 7 AM ends Saturday morning.
- **The status to use**: Do Not Disturb, Idle or Invisible.
- **An optional custom status** for the night (an emoji and some text, for example "🌙 Quiet hours"). Your old custom status comes back afterwards.
- **Skip tonight**: a button on the card at the top of the settings. During a night it reads **End now and skip tonight**. A skipped night shows **Undo skip**. Only that one night is skipped.
- **Your old status comes back** at the end. If you changed your status yourself during the night (to Invisible, say), the plugin does not fight you and leaves your choice alone at the end.
- A **Debugging** section at the bottom: **Copy logs** and **Run self-check**.

## The limit to know

Valenced plugins cannot run while Discord is closed. If a night begins while Discord is closed, it starts a few seconds after you next open Discord. The end is safer: when quiet hours begin, the status is given an end time equal to the end of the night, so **Discord itself** ends it on time even if the app is closed. The next time you open Discord, the plugin puts your old status back.

## Privacy

Everything is saved on your phone only. The report that **Copy logs** makes holds the schedule and what was applied, never the text of your custom status.

## How it works

The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) keeps your status as four proto settings in `UserSettings.tsx`: the status, when it ends, when it started, and the custom status. The plugin writes them with the same `updateSetting` calls Discord's own screens use, so the result is saved and synced like a status picked by hand.

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin and ties the pieces together. |
| `schedule.ts` | Works out the windows from the days and times, and the texts that describe them. No Discord code. |
| `engine.ts` | Looks at the clock every 15 seconds, when Discord comes to the front and when a setting is saved. Begins and ends quiet hours and skips a night. |
| `status.ts` | Finds, reads and writes Discord's status settings. |
| `Settings.tsx` | The settings screen: the card, the schedule, the days, the status and the debugging section. |
| `TimeSheet.tsx` | The sheet that picks a time of day. |
| `config.ts`, `constants.ts`, `discord.ts`, `types.ts`, `diag.ts` | Helpers. |
