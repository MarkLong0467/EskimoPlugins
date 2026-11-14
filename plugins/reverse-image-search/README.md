# Reverse Image Search

Adds ImageSearch to image context menus. Find where a picture comes from, or bigger copies of it, with Google Lens, Yandex,
SauceNAO, IQDB, Bing, TinEye or ImgOps.

A port of [ReverseImageSearch for Equicord](https://equicord.org/plugins/ReverseImageSearch) by Ven and Nuckyz, with the same
engines and the same search addresses.

## How to use it

- **Hold a picture** in chat, then tap **Search Image** (it is next to Copy Media Link). This is Equicord's right click on a
  picture in a message.
- Or **open the picture**, tap the viewer's menu, then **Search Image**. This is Equicord's right click on a picture anywhere
  else.

A sheet then lists the engines, each with its own icon, and **All**. Tapping one opens its search for the picture in your
browser.

## Differences from Equicord

- Equicord's "Search Image" is a submenu. A phone's menus have none, so it opens a sheet with the engines instead.
- **All** opens the engines one after another, 0.4 seconds apart, so the browser takes every one (Equicord opens them all at
  once).
- Only pictures get the row, as in Equicord: not videos or files.

## Files

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin. |
| `menu.ts` | Adds "Search Image" to the menu of a held picture and to the picture viewer's menu. |
| `EngineSheet.tsx` | The sheet of engines (Equicord's submenu). |
| `engines.ts` | The engines and how a search is opened (Equicord's `Engines` and `search`). |
| `discord.ts` | Discord's sheets and icons. |
| `diag.ts` | Copy logs and the self-check (no addresses). |
| `Settings.tsx` | What the plugin does, and its logs. |
