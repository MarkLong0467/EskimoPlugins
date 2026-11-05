# Valid User

Discord draws a mention as **@unknown-user** when it has never seen that user, and only looks the user up when you tap
the mention. This plugin does the lookup for you, in the background, and draws the message again. The mention turns
into the real name on its own.

## What you get

- Mentions in **message text** resolve without a tap.
- Mentions inside **embeds** resolve too: title, description, author name, footer and every field.
- Mentions in **forwarded messages** resolve, including inside the forwarded embeds.
- It works for messages that arrive live, for edited messages, and for messages loaded with a channel, with pinned
  messages and with your recent mentions.
- The plugin has no settings. Install it and it works.

## How it works

1. **Listen.** The plugin watches the Flux events that carry messages: `MESSAGE_CREATE`, `MESSAGE_UPDATE` and the
   events that load lists of messages.
2. **Scan.** Each message is searched for `<@id>` and `<@!id>` mentions (an id is 17 to 20 digits). Only users Discord
   does not know yet are kept.
3. **Queue.** Each unknown user is queued once, however many messages mention them. Messages that mention the same
   user are remembered together.
4. **Fetch.** Users are fetched one at a time with Discord's own `getUser`, with a short pause between two lookups
   (300 ms) so a long message list does not flood Discord's API.
5. **Redraw.** When a user arrives, every message that mentioned them is sent through Discord as a `MESSAGE_UPDATE`
   with its stored content. Discord draws it again, and the name is now known.

### Limits and edge cases

| Situation | What happens |
| --- | --- |
| The user is already known | Nothing is fetched |
| The user cannot be fetched (deleted, blocked) | They are skipped and not asked for again until Discord reloads |
| More than 200 different unknown users at once | New ones are ignored until the queue has room |
| Discord's user actions are not loaded yet | Users wait in the queue and are fetched as soon as the module appears |
| A lookup throws immediately | It counts as a failed lookup, and the queue carries on |
| The plugin is stopped | The queue is emptied and lookups that finish later are ignored |
| A message has no id, or no channel | It is skipped |

## Layout

```
js/
  index.ts      the plugin: listens to Flux events and finds Discord's user actions
  scan.ts       finds mentions of unknown users in a message, snapshots included
  texts.ts      lists every string in a message that can hold a mention
  lookup.ts     the queue that fetches users and redraws messages
  discord.ts    typed access to Discord's user store, message store and dispatcher
  constants.ts  the mention pattern, timings, limits and event names
  types.ts      the Discord shapes the plugin uses
```

## Testing

`tests/valid-user.test.cjs` loads the built plugin into a fake Discord and checks every place a mention can be, how
mentions are recognised, de-duplication, failures, the queue limit, waiting for Discord's module and shutdown:

```sh
bun run build valid-user
node tests/valid-user.test.cjs
```
