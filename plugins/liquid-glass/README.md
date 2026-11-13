# Liquid Glass

A port of [callstack/liquid-glass](https://github.com/callstack/liquid-glass) (MIT, by Oskar Kwaśniewski and Callstack) as a **library plugin** for Valenced. It has no settings. Other plugins use it.

## The API

Same names and props as the original:

- `LiquidGlassView`: `interactive`, `effect` (`'clear' | 'regular' | 'none'`), `animated`, `animationDuration` (milliseconds), `tintColor`, `colorScheme` (`'light' | 'dark' | 'system'`).
- `LiquidGlassContainerView`: `spacing`.
- `isLiquidGlassSupported`.

A plugin that depends on `marklong.liquid-glass` gets them on `unscoped.liquidGlass` or from `start({ liquidGlass })`:

```json
"dependencies": { "marklong.liquid-glass": { "version": ">=1 <2" } }
```

```tsx
start({ liquidGlass }) {
    const { LiquidGlassView, isLiquidGlassSupported } = liquidGlass
}
```

## What it does to Discord

A frosted glass look, made of one see-through fill, a hairline edge and a brighter top edge, in one function so every part matches. It follows Discord's theme (dark or light). Four switches, all on by default:

- **Buttons**: a glass rim on quiet (secondary) buttons and round icon buttons, such as Search: a bright top edge, a warmer bottom edge and a faint line down the sides. It goes on the rounded layer inside the button (`pillStyle`), so the shape and fill stay as Discord draws them.
- **Profile bar**: a glass rim around the bar at the bottom of the channel list (found by its test id `you_bar_profile_button`).
- **Cards**: the boxes on settings pages are white glass with a faint 5% fill, with the colour only in their edge.
- **Text fields**: search boxes and inputs.
- **Sheets and menus**: the panels that slide up from the bottom and the pop-up menus (`Menu`) get a see-through, tinted background and an edge.

And two choices: **Strength** (Clear, Regular, Strong) and **Colour** (White, Blue, Violet, Rose, Mint).

Sheets are made see-through at the source: the opacity of the colour behind a sheet's background (`MOBILE_ACTIONSHEET_BACKGROUND`) is lowered in Discord's own colour table, and the colour function gives the tinted fill. Discord's own values come back when the plugin stops. The report says how often it was used (`Frost on sheet colour`, `Frost on sheet table`).

It works by a hook before each element of Discord's design-system components (`Design.Button`, `IconButton`, `Card`, `TextInput`, `TextField`, `TextArea`, `ActionSheet`, `BottomSheet`, `Menu`) that adds the frost to the style the caller gave, with the caller's own style after it. Nothing is replaced. The report from **Copy logs** says how many of each part were drawn and how many were frosted.

It cannot blur what is behind a surface. Discord's own blur view on Android needs a native blur target wrapped around everything behind it, which a plugin cannot add.

## What you see on each phone

- **iOS 26 with the native views in the app:** the real glass, used as it is.
- **Android and everything else:** the original draws a plain `View` and `isLiquidGlassSupported` is `false`. The one change in this port: that `View` gets a faint white, see-through fill and a hairline edge (stronger for `regular` than `clear`, none for `none`), so a surface looks frosted. `tintColor` is used as the fill. Styles the caller gives win. It cannot blur what is behind it, because the real effect is a native iOS material.

Android has no liquid glass, and a Valenced plugin cannot add native iOS code to Discord. The frosted look is the closest a JS plugin can do.
