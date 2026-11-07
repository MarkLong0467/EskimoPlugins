# Silence Users

A port of **SilenceUsers** for Equicord by dka (GPL-3.0), made for Valenced.

Silences **@mention pings and server badge counts** from people you choose. Their messages still arrive and read like any other; only the part that pings you is taken out. Direct messages are not changed.

## How it works (the same as Equicord)

Before Discord's stores see a new or edited message, the plugin looks at who wrote it. If the author is on your list it sets `mention_everyone` to false and empties `mention_roles` and `mentions`. With nothing in them the message pings nobody, so it adds nothing to a server's red badge number and makes no in-app pop-up. A notification event for a message from a silenced person is stopped too.

## What you get

- **A list of silenced people** in the settings, with their pictures and names. Tap one to copy their ID, tap **Remove** to let them ping you again.
- **Add people** by pasting User IDs (several at once, separated by commas, spaces or lines) or `<@id>` mentions. It says what was added, what was already there and what it could not understand.
- **`/silence user:@someone`** in the `/` menu. It uses Discord's own user picker, and running it again for the same person lets them ping you again.
- **Pinged you recently**: people who @mention you, reply to you or use @everyone since Discord started, so you can silence them with one tap and without knowing their ID.
- **Extras, if you would rather not pick people**:
  - **Silence everyone's pings.**
  - **Silence @everyone and @here** from anyone.
  - **Silence role pings** from anyone.
- **Copy logs and a self-check** at the bottom of the settings, made for finding out why it broke after a Discord update. The self-check runs the filter on a made-up message and says whether messages and their mention fields reach the plugin. The report has counts, yes/no answers and settings, and never an ID, name, picture or message.

## Limits

- Only new messages are changed. A number already on a server badge stays until you read the chat.
- Notifications that Discord's servers send to your phone while the app is closed cannot be stopped by a plugin. Muting the chat or the person in Discord does that.
- Discord's phone app may never send the `NOTIFICATION_CREATE` event the desktop app uses. The report counts how many were seen.
