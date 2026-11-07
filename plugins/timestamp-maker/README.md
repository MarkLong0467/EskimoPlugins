# Timestamp Maker

Type `/timestamp` in any chat and a popup helps you build a Discord timestamp: pick the date and time, choose how it looks, add some text, then send it, add it to your message or copy it.

A Discord timestamp (`<t:1794000000:F>`) is shown to every reader in **their own time zone and language**, so "see you at 6 PM" is right for everyone.

## What you get

- **`/timestamp` in the `/` menu**, with Discord's own commands. It takes two optional pieces: `when` (for example `tomorrow 9am`) and `style`. With them the popup opens already filled in.
- **A popup that is easy to use.**
  - A big preview of how it will look in chat, with the tag that will be sent under it.
  - A **When** box that understands what you type (see below), and 24 **quick picks** that wrap onto as many lines as they need: minutes and hours from now, tonight, tomorrow, this weekend, next Monday, in 1 or 2 weeks, end or start of the month, in 1, 3 or 6 months, in a year, next year, end of the year, New Year, Halloween, Christmas.
  - **Fine tune** buttons for Year, Month, Day, Hour and Minute (the minute button moves 1, 5, 10, 15 or 30 minutes, you choose).
  - **Jump ahead or back** buttons that move the time you have by 1 hour, 6 hours, 1 day, 3 days, 1 week, 2 weeks, 1 month, 3 months, 6 months, 1 year, 5 years or 10 years. Tap more than once to go further.
  - **All seven styles** with a live preview of each: date and time, full date and time, relative (live "in 2 hours"), time, time with seconds, short date, long date.
  - **Extras**: also add the relative time (`<t:…:F> (<t:…:R>)`), show the raw tag in backticks, and a **message** with `{time}` ("Meeting starts {time}").
  - A **time zone** control, for when you are working out a time in somebody else's zone.
  - **Recent** timestamps you can pick again.
  - **Send**, **Add to message** (puts it where you are typing, so you can write more) and **Copy**. Which one is the big button is up to you.
- **`@time` in messages.** Write `@time` and it becomes a timestamp when you send. `@time(tomorrow 9am)` is a time, and `:R` (or `:t :T :d :D :f :F`) after it picks a style. Code in `backticks` and code blocks is left alone, and words it cannot read are sent exactly as typed. **It can be switched off in the settings.**
- **Settings** for every part: the two ways to make a timestamp, the style `@time` uses, the main button, quick picks, remembering your last choices, skipping the popup, the 12 or 24 hour clock, month-first or day-first dates, the minute step, the time zone, and how many recents to keep.
- **Copy logs and a self-check** at the bottom of the settings, made for finding out why it broke after a Discord update.

## What you can type

In the **When** box, in `/timestamp when:…` and in `@time(…)`, in any mix:

| You type | You get |
| --- | --- |
| `now` | this moment |
| `in 2 hours`, `+30m`, `1d12h`, `in 1 day 3 hours` | that long from now |
| `3 days ago`, `-2w` | that long before now |
| `5pm`, `5:30 pm`, `17:30`, `noon`, `midnight` | that time today |
| `tomorrow 9am`, `yesterday`, `tonight` (8 PM) | that day |
| `friday 8pm`, `next monday 9am`, `next week`, `next month`, `next year`, `this weekend` | that day |
| `in two weeks`, `a week from now`, `in a fortnight`, `in a couple of days`, `in a few hours` | number words work too |
| `half an hour`, `an hour and a half`, `in 2 and a half hours`, `in 1.5 years` | parts of a unit |
| `in a month`, `in 3 months`, `in a year`, `in 2 years`, `in a decade` | calendar months and years |
| `a year ago`, `6 months ago`, `last month`, `last year` | before now |
| `this time next week`, `this time next year` | the same time of day, a week or a year on |
| `end of the day` (`eod`), `end of the week`, `end of the month`, `end of the year` | the last moment, 23:59 |
| `start of next week`, `start of next month`, `start of next year` | the first moment, 00:00 |
| `christmas`, `christmas eve`, `new years`, `new years eve`, `halloween`, `valentines day` | the next one (add a year: `christmas 2030 6pm`) |
| `the 15th`, `the 15th at 5pm` | that day of this month, or of next month if it has passed |
| `2026-12-25 18:00`, `dec 25 2026 6pm`, `25 december 6:30pm`, `12/25/2026` | that date |
| `1794000000` | a Unix time |

A date with no time is noon. A day word with no time keeps the time of day it is now. If you type `3/4`, the settings decide whether that is March 4th or the 3rd of April.

## How it works

Discord's `ApplicationCommandBuiltIns` module has `getBuiltInCommands(commandTypes, all, textOnly)`, which gives the list of its own commands (`/shrug`, `/me`, `/roll-dice`, and so on). The plugin wraps it and adds one command to what it returns. The command is made like Discord's `/roll-dice`: a built-in command whose `execute` opens something and sends nothing. Its kind of input is copied from `/roll-dice` when that is found. The list is cached for each answer of Discord, so asking twice gives the same list and nothing draws again for no reason.

The popup is a Discord action sheet. **Send** uses Discord's `sendMessage`. **Add to message** uses the chat box (found by watching Discord's `ChatInputAppCommandManager` draw, which carries `chatInputRef`) and its `insertText`; if the chat box is not known it changes the saved draft of the open chat, and if that fails it copies. `@time` is done in `sendMessage` too, so it works for every message you send.

## Debugging

At the bottom of the settings:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the settings, and for each part whether Discord's code was found and patched:
  - whether the module with `getBuiltInCommands` was found and patched, whether the command's kind was copied from `/roll-dice`, how often Discord asked for its commands and how often `/timestamp` was in the answer,
  - how often `/timestamp` was run, with which options (only whether `when` or `style` was given),
  - whether the message module was found and patched, whether the chat box is known, how often a timestamp was sent, added to the message (and how) or copied,
  - how many `@time` messages were converted and how many were left alone because the time could not be read,
  - the last events.

  It holds no message, no time you picked, no channel and no server.
- **Run self-check** shows which step works and which does not, with a hint for each.
- **Status** at the top of the settings says "Ready" (open the `/` menu once so the plugin can find Discord's command list), "Working", or what is wrong.

## Source

Files: [`plugins/timestamp-maker`](.). Code: `time.ts` (the seven styles, reading what you type, moving a time), `command.ts` (adds `/timestamp`), `Popup.tsx` (the popup), `deliver.ts` (send, add to message, copy), `atTime.ts` (`@time`), `run.ts` (joins the command to the popup, finds the chat box), `store.ts` (settings), `Settings.tsx`, `diag.ts`, `state.ts`, `index.ts`.
