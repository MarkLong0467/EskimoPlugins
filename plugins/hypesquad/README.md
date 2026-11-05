# HypeSquad Switcher

Switch your HypeSquad house, or leave it, with one tap from the plugin's settings.

## What you get

The settings page lists the three houses: **Bravery**, **Brilliance** and **Balance**.

- Tap a house to join it. The house you are in shows **Current** under its name.
- While you are in a house, a red **Leave HypeSquad** row appears. Tap it to leave.
- A toast tells you how it went: joining, done, or what went wrong.
- The page updates at once, without waiting for Discord's profile data to catch up.

Discord allows a limited number of house changes, and may ask for a captcha. The plugin cannot solve a captcha, so it
says so and you can try again later.

## How it works

Your house is a bit in your profile flags (64 Bravery, 128 Brilliance, 256 Balance). The page reads it from Discord's
user store and listens for changes, so it also follows changes made elsewhere.

A change is one request to Discord's API:

| Action | Request |
| --- | --- |
| Join a house | `POST /hypesquad/online` with `{ "house_id": 1 \| 2 \| 3 }` |
| Leave | `DELETE /hypesquad/online` |

The request goes through **Discord's own connection** (the module with `HTTPResponseError`), which adds the right
headers. If that module cannot be found, or it breaks without Discord having answered, the plugin sends the request
straight to `https://discord.com/api/v9` with your account token. A request that takes more than 15 seconds is given up.

Only one change runs at a time. When it succeeds, the new house is remembered as the current one until Discord's own
profile data shows the same house, then the plugin goes back to reading Discord's data.

### What the toasts say

| Cause | Message |
| --- | --- |
| Took too long | Discord took too long to answer. Try again. |
| Captcha required | Discord wants a captcha for this change, which a plugin cannot do. Try again later. |
| Rate limited (429) | Discord says slow down. Try again in a minute. |
| Discord gave a message | The message, with the status: `Missing Access (403)` |
| Only a status | Discord said no (500). |
| No way to reach Discord | Could not find a way to reach Discord. |

## Layout

```
js/
  index.tsx      the plugin: shows the settings and resets state when it stops
  Settings.tsx   the settings screen
  useHouse.ts    a hook that returns your house and redraws when it changes
  change.ts      joins or leaves a house and shows the toasts
  http.ts        sends the request (Discord's connection, or directly with a token)
  explain.ts     turns a failed request into a sentence
  house.ts       reads your house from your profile flags
  state.ts       the pending change, the busy flag and the screens to redraw
  constants.ts   the houses, the toast id, the timeout and the API path
  types.ts       the shapes used above
```

## Testing

`tests/hypesquad.test.cjs` renders the settings screen and taps it. It checks each house and flag, joining, switching,
leaving, the busy lock, every error message, the direct fallback, timeouts, the live updates and cleanup:

```sh
bun run build hypesquad
node tests/hypesquad.test.cjs
```
