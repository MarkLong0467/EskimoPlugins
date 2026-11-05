# Role Options

Adds **Copy Role Name**, **Copy Role Color** and **Copy Role Icon** to the role menu, and copies a role's color when you
hold its chip on a profile.

## What you get

Open a role's menu (the one with **Copy Role ID**). Three items appear under it:

| Item | What it copies |
| --- | --- |
| Copy Role Name | The role's name. |
| Copy Role Color | The role's color as a hex code such as `#ff8800`. A gradient role copies all its colors, separated by commas. |
| Copy Role Icon | The role's icon picture on iOS. On Android, or anywhere the picture cannot be copied, the link to the picture. |

Hold a role chip on a profile to copy its color. A toast tells you what was copied, or why nothing was (the role has no
color or no icon, or it could not be found).

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | The entry point. Starts the two patches below. |
| `patches.ts` | Patches the JSX runtime (to see the role menu being drawn) and the `ThemedRolePill` component (the role chip). |
| `decorate.ts` | Adds the items to a menu, whether the menu is a list of items or a set of rows. |
| `options.ts` | The three items and what they do. |
| `roles.ts` | Finds a role from its id in Discord's role store. |
| `clipboard.ts` | Copies text or a picture, and learns the role's id. |
| `color.ts` | Turns Discord's color numbers into hex codes, and finds a chip's color. |
| `tree.ts`, `state.ts`, `toast.ts`, `constants.ts`, `types.ts` | Small helpers. |

**Finding the role.** The menu does not say which role it is about. So when you tap one of the new items, the plugin
runs Discord's own **Copy Role ID** action but catches the id it tries to copy, then looks that id up in the role store.
If that gives nothing, it uses the role the last menu was about, if that was less than a minute ago.

**Not adding twice.** Discord draws a menu several times. The items are added at most once every 400 ms and never to a
menu that already has them.

**Safe by design.** Every patch returns what Discord drew if anything goes wrong, so a problem here cannot break a menu.

## Credits

The long press to copy a role color is based on CopyRoleColor for Vendetta by MSMA (public domain),
<https://github.com/Martinz64/vendetta-plugins>.

## Developing

```sh
bun install
bun run build         # builds plugins/role-options/build/js/index.js
bun run test role-options
```
