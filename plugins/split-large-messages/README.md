# Split Large Messages

Discord refuses to send a message longer than **2000 characters** (**4000** with Nitro). This plugin removes that
limit: when you send something longer, it is cut into several messages that are sent one after another.

## What you get

- Long messages go out as a series of normal messages, in order.
- The cuts are made on line breaks first, then on spaces, so words and lines are not broken in the middle where it can
  be avoided.
- A reply is attached to the **first** message only.
- Files are uploaded with the **last** message, so they appear after all of the text.
- The plugin has no settings. Install it and it works.

## Limits

| Account | Longest single message |
| --- | --- |
| No Nitro, or Nitro Basic | 2000 characters |
| Nitro Classic or Nitro | 4000 characters |

Messages at or below the limit are never touched.

## How it works

Sending a message goes through one Discord function, `sendMessage`. The plugin replaces it. For a message that fits,
it calls the original unchanged. For a longer one it:

1. cuts the text into pieces of at most the limit,
2. sends the first piece with the original reply and nonce, and no files,
3. sends each following piece after the previous one has gone out, each with a fresh nonce,
4. attaches the files to the last piece.

The function returns the result of the last message, as a single send would.

Discord's message module is found with `getModules`, which also sees modules that load later. When the plugin stops,
the patch and the module subscription are both removed and Discord's own `sendMessage` is back.

## Layout

```
js/
  index.ts   the plugin: starts the patch
  patch.ts   replaces sendMessage and splits the options between the messages
  limit.ts   the 2000 / 4000 limit for the current account
  split.ts   cuts text on line breaks and spaces
  types.ts   the Discord shapes the plugin uses
```

## Testing

`tests/split-large-messages.test.cjs` loads the built plugin into a fake Discord and checks the limits, where text is
cut, replies, files, nonces, ordering and cleanup:

```sh
bun run build split-large-messages
node tests/split-large-messages.test.cjs
```
