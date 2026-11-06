# Force Timestamp Locale

Shows every timestamp in one language, whatever language Discord is in.

> **Credit.** This plugin was made by [PalmDevs](https://github.com/PalmDevs) (Discord ID `629368283354628116`).
> This is a 1:1 port of their [Revenge plugin](https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/force-timestamp-locale) to Valenced, published here by MarkLong0467. The idea, the code and the behaviour are PalmDevs'.
> Licensed GPL-3.0-or-later, like the original.

## What you get

- Dates and times in the locale you pick. The default is `en-gb`, which gives 24-hour times and day/month/year dates.
- A list of every locale Discord ships, to pick from. Discord's own attempts to change the locale are ignored while the plugin is on.
- Added in the port: a **preview** at the top of the settings that shows how a date, a time, "3 hours ago" and "2 days ago" look in the chosen locale, a **search** box for the list, and the language's name under each code.
- A change shows the next time Discord draws a date: open another chat, or scroll.

## How it works

Discord draws its dates with the moment library, which has one locale for the whole app. The plugin:

1. replaces moment's `locale` and `lang`, so a change that does not carry the plugin's own symbol is ignored,
2. loads every locale Discord ships (`momentLocales`),
3. sets the chosen locale with that symbol.

When the plugin stops, the patches come off and the locale Discord had is put back.

## Debugging

At the bottom of the settings is a debugging section that is not in the original:

- **Copy logs** puts a report on the clipboard: the plugin and Discord versions, your phone, the chosen locale, how many locales loaded (and how many failed), how many changes of Discord's were blocked and the last events.
- **Run self-check** shows which parts were found.

## Source

Files: [`plugins/force-timestamp-locale`](.). Original: <https://github.com/PalmDevs/revenge-plugins/tree/main/plugins/force-timestamp-locale>
