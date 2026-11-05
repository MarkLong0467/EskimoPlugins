# Slowmode Extended

Discord's slowmode picker only offers a handful of values. This plugin gives it a much longer list.

## What you get

Open **Channel settings > Slowmode**. The slider now has:

| Range | Step |
| --- | --- |
| 0 (off) to 1 minute | every **second** |
| 2 minutes to 1 hour | every **minute** |
| 2 hours to 6 hours | every **hour** |

That is 125 choices. 6 hours is the longest slowmode Discord accepts. You still need permission to manage the channel.

The plugin has no options. Its settings screen shows whether the list was found and replaced, and lists every choice.

Same idea as [SlowmodeExtended for Vendetta](https://github.com/aeongdesu/vdplugins) by sapphire. This one is written
from scratch for Valenced.

## How it works

Discord keeps the picker's values in a constant named `SLOWMODE_VALUES` inside one of its modules. The plugin:

1. finds that module with `getModules`, which also reports modules that load later (Discord loads many only when a
   screen first needs them),
2. replaces the list with the longer one. If the property cannot simply be assigned, it is defined again. If that fails
   too, the settings screen says so and nothing is changed,
3. puts Discord's own list back when the plugin is turned off.

## Layout

```
js/
  index.tsx     the plugin: finds the module and swaps the list
  values.ts     builds the longer list and labels values (45s, 5m, 2h)
  replace.ts    puts a list in place and returns a function that restores the old one
  status.ts     what happened, for the settings screen
  Settings.tsx  the settings screen
  constants.ts  the 6 hour limit and the property name
  types.ts      the shapes used above
```

## Testing

`tests/slowmode-extended.test.cjs` checks the new list (its size, order, ends and steps), lists found on the module or on
its default export, read-only and frozen lists, modules that load late, restoring the original on stop, and the text of
the settings screen:

```sh
bun run build slowmode-extended
node tests/slowmode-extended.test.cjs
```
