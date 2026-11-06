# Shared code for the kmmiio99o ports

The plugins ported from [kmmiio99o](https://kmmiio99o.dev)'s Revenge Next repository use these files for what the ports add to the originals. They are
bundled into each plugin; nothing here is a plugin of its own.

| File | What it does |
| --- | --- |
| `credits.ts` | Names and licence of the original author and of the porter, used in the log report. Credits are shown from each plugin's manifest, not in settings. |
| `diagnostics.ts` | A per-plugin log, patch and check recorder, and the report builder behind **Copy logs**. |
| `redact.ts` | Hides secrets, cuts long values and strips link queries before settings go in a report. |
| `Debug.tsx` | The debugging section: Copy logs, Run self-check, recent events, Clear events. |
| `Footer.tsx` | The debugging section; what each plugin puts at the bottom of its settings. |
| `Intro.tsx` | The short card at the top of settings screens that had none. |
| `toast.ts` | Opens a toast on any Discord build (see below). |

## Why `toast.ts`

Discord 350204 and newer open a toast with `open(key, { text, icon })`. The Revenge Next plugins call the older `open({ key, content })`, which on a new
Discord passes the whole object as the key and no toast at all. Plugins that show toasts go through `openToast` instead.

The ports are licensed GPL-3.0 like the originals.
