# Colorful Channels

Gives channel icons that have a symbol colors, and adds a red **NSFW** tag next to the names of NSFW channels.

Based on the Colorful Channels module of **NexxUtils for Revenge** by nexpid
([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), <https://github.com/nexpid/RevengePlugins>). The channel icon
pictures are from that plugin. Rewritten for Valenced. Version 1.1 added following icon packs, made with **Duckie**.

## What you get

- **Colored icon symbols.** A locked channel gets a yellow lock, an NSFW channel a red warning, and a channel that has a
  game gets a green controller. Text, voice, announcement, forum, stage and image channels are covered.
- **NSFW tag.** A small red `NSFW` label in front of the channel name.
- **Follow icon packs.** The channel symbol is drawn from the icon pack in use, with the lock, warning or controller from the pack's own icons. It falls back to the built-in pictures when the pack has no match.
- Four switches in the plugin's settings. A changed setting applies the next time the chat list is drawn, so open the
  chat list again to see it.

| Setting | Default | What it does |
| --- | --- | --- |
| NSFW tag | on | The red tag next to NSFW channel names |
| Colored icon symbols | on | Colors the lock, warning and controller marks |
| Fallback colors for icon symbols | off | Uses fixed yellow, red and green instead of the colors of Discord's current theme |
| Follow icon packs | on | Draws the icon and its symbol from the icon pack in use |

## How it works

**Icons.** Discord draws every channel icon with a component called `BaseChannelIcon`. The plugin patches it. After
Discord has drawn an icon, the plugin looks up the icon's **asset name** and works out which icon it is, so it keeps
working when Discord spells names differently (`TextLockIcon`, `ic_channel_text_locked`, `channel-text-lock`...):

1. What is the mark? A name with `lock` is a lock. `warning` or `nsfw` is a warning. `controller`, `gamepad` or `game` is
   a controller.
2. What kind of channel? `announcement` or `news`, `forum`, `stage`, `image`/`media`/`photo`, `voice`/`audio`/`speaker`,
   or `text`/`channel`.

If both are known and the pair is one of the twelve supported icons, the icon is redrawn as the plain symbol picture with
the colored mark on top. Anything else is left exactly as Discord drew it.

**Colors.** Each mark has a theme color (`STATUS_WARNING`, `STATUS_DANGER`, `STATUS_POSITIVE`), resolved for the current
theme (light, dark, amoled) when Discord can do that. A fixed color (`#f0b232`, `#f23f43`, `#23a55a`) is used when the
theme color cannot be found, or when the fallback colors are chosen. The symbol keeps the tint Discord gave it.

**NSFW tag.** Discord draws a channel's name row with a component named `ChannelInfo`. The plugin adds the red tag in
front of it when the channel is NSFW (the field is `nsfw_` in some Discord versions and `nsfw` in others).

Both patches are found with `getModules`, because this part of Discord loads when the chat list first draws, which on a
fresh start is after the plugin starts. If anything goes wrong while decorating, the channel is drawn as Discord would
draw it. When the plugin stops, both patches are removed.

## Layout

```
js/
  index.tsx        the plugin: finds the two modules and patches them
  patches.tsx      the ChannelInfo (NSFW tag) and BaseChannelIcon (colored icons) patches
  decorateIcon.tsx draws a colored icon
  NsfwBadge.tsx    the red NSFW tag
  glyph.ts         works out which icon a name is
  assets.ts        finds an icon's asset id and name
  color.ts         turns a theme color into a color for the current theme
  config.ts        reads the saved settings
  Settings.tsx     the settings screen
  images.ts        the icon pictures (PNG data links)
  constants.ts     the defaults, the icon table and the colors
  types.ts         the shapes used above
```

## Testing

`tests/colorful-channels.test.cjs` checks every supported icon name and mark, sizes and styles, the three color
modes, icons that must not change, the NSFW tag, the settings screen, error safety and cleanup:

```sh
bun run build colorful-channels
node tests/colorful-channels.test.cjs
```
