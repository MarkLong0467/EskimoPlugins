# Webhook Builder

Discohook inside Discord. Make messages with embeds, link buttons and polls, and send them with your webhooks. Save them,
schedule them, and change or delete them after they are sent. Its screen is in the plugin's settings.

Based on [Discohook](https://discohook.app)'s message editor. Its JSON goes both ways: paste a Discohook message or backup
here, and Discohook takes the JSON copied from here.

## What it does

**Compose**
- Send with one webhook or several at once. Each one sends its own copy.
- Set a name and avatar for the message, or leave them empty to use the webhook's own.
- Write the text (2000 characters), with a counter and Discord's limits checked before it is sent.
- Add up to 10 embeds. Each has an author with a link and icon, a title with a link, a description, and a colour (presets,
  a code, or random). It can also have up to 25 fields (inline or not), a picture, a thumbnail, a footer with an icon, and
  a time (when it is sent, or a time you choose). Embeds can be moved, copied or removed.
- Show a **gallery**: up to 4 pictures in one embed. Discord groups embeds that share a link.
- Add **link buttons**: up to 5 rows of 5, each with a label, an emoji and a link.
- Add a **poll** with up to 10 answers, open for 1 hour to 32 days, with one answer or several.
- Send into a **thread**, or make a new **forum post** with a title.
- Send it **silent** (no notification), hide link previews, have it read aloud, and choose **who gets pinged** (everyone,
  only people, or nobody).
- See a **live preview** of the message.
- Use **words that are filled in** when it is sent: `{date}`, `{time}`, `{unix}`, `{t:R}` (a Discord timestamp, also `t T d
  D f F`), `{t+1h:R}` (offset by m, h, d or w), `{random:a|b|c}` and `{webhook}`.

**Webhooks**
- Add one by pasting its address. The address is read from the clipboard when it holds one.
- **Find the webhooks** of the open server or channel, or **make a new one** in the open channel. This needs Manage
  Webhooks there.
- Change a webhook's name and avatar on Discord (from a picture link), or remove its avatar.
- Send a test message, copy its address, check it with Discord again, forget it, or delete it on Discord.

**Library**
- **Saved** messages: open, send now, send later, rename, copy, copy their JSON or delete them. "Copy all as JSON" makes one
  backup of all of them.
- **Scheduled** messages: once, or every hour, day or week. They are sent while Discord is open. Ones that came due while it
  was closed are sent when it opens, or skipped, as the options say.
- **Sent** messages: open in Discord, change (it is loaded as it is now; Save changes edits it), delete, copy the link.

**Paste JSON** takes a Discohook message, a Discohook backup with several messages, a discohook link with the message in it,
or a message as Discord's API takes it. **Copy from a message link** copies any message you can see into the editor.

**Hold a message** in chat and tap **Webhook Builder** to:
- copy it into the editor,
- send a copy with one of your webhooks,
- copy its JSON or link.

When one of your saved webhooks sent the message, you can also change it or delete it from there.

## Good to know

- A webhook's address is all anyone needs to post with it. The plugin keeps the addresses on the phone only, and leaves them
  out of Copy logs.
- Webhooks that no bot owns can send only link buttons, not other buttons or menus.
- Files cannot be attached. Link to pictures instead (embeds and avatars take `https://` links).
- A change to a sent message cannot set its name, avatar, poll or thread.

## Files

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin and the schedule. |
| `Settings.tsx` | The screen and its tabs. |
| `ComposeTab.tsx` | The message: where it goes, its parts, sending, saving and pasting. |
| `EmbedEditor.tsx` | One embed. |
| `WebhooksTab.tsx` | The webhooks and the screen of one. |
| `LibraryTab.tsx` | Saved, scheduled and sent messages. |
| `Preview.tsx` | The preview of the message. |
| `menu.tsx` | "Webhook Builder" in the menu of a held message. |
| `actions.ts` | Sending, editing, deleting, saving and scheduling. |
| `api.ts` | Talking to Discord. |
| `payload.ts` | The message as Discord's JSON and back, Discohook's JSON, and Discord's limits. |
| `state.ts` | What is kept and saved. |
| `variables.ts` | The words in braces. |
| `time.ts` | Reading and writing times. |
| `PromptSheet.tsx`, `ActionsSheet.tsx`, `ui.tsx` | The sheets and pieces of the screens. |
| `discord.ts`, `diag.ts`, `constants.ts`, `types.ts` | Helpers. |
