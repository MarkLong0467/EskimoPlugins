# Message Reminders

Hold a message, tap **Remind Me** and pick a time. When it comes, a sheet shows the message with **Jump**, **Snooze** and **Done**.

## What you get

- **Remind Me** in the message menu, next to the copy rows. It opens a list of times: 10 minutes, 30 minutes, 1 hour, 3 hours,
  this evening (8 PM, only when it is more than two hours away), tomorrow morning (9 AM) and in a week. Or type a number of
  minutes.
- A message has one reminder. Picking again moves it, and the picker can remove it.
- When a reminder is due, a toast shows and a sheet opens with who wrote the message and the start of it:
  - **Jump to message** opens the message in Discord (and removes the reminder),
  - **Snooze** moves it later (5, 10, 15, 30 or 60 minutes, you pick in the settings),
  - **Done** removes it.
- The settings list every reminder, split into **Due now** and **Coming up**. Tap one to jump, snooze or remove it.
- A **Debugging** section at the bottom: **Copy logs** and **Run self-check**.

## The limit to know

Valenced plugins cannot run while Discord is closed, so a reminder can only come while Discord is open. A reminder that came
due while it was closed is shown a few seconds after you next open Discord, and every reminder stays in the list until you
deal with it. For a reminder that has to ring at an exact time, use your phone's clock.

## Privacy

Reminders are saved on your phone only. The report that **Copy logs** makes holds counts and times, never what a message says
or who wrote it.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin and ties the pieces together. |
| `menu.tsx` | Adds **Remind Me** to the message menu and notes which message the menu is for, with its writer and the start of its text. |
| `PickSheet.tsx` | The sheet that picks the time. |
| `DueSheet.tsx` | The sheet shown when reminders are due. |
| `ItemSheet.tsx` | The sheet for one reminder, opened from the settings. |
| `reminders.ts` | The list of reminders: add, move, snooze, remove, and saving it. |
| `scheduler.ts` | Looks for due reminders every 15 seconds, soon after start, and whenever Discord comes to the front. |
| `time.ts` | The times the picker offers and how times are shown. |
| `Settings.tsx` | The settings screen. |
| `config.ts`, `discord.ts`, `constants.ts`, `components.tsx`, `types.ts`, `diag.ts` | Helpers. |

The message menu code is the same approach as Text React's, which finds the menu by its labels and, in other languages, by its
icons. The Debugging section is the one in [`shared/kmmiio`](../../shared/kmmiio).
