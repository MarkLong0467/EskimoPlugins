# Auto Show All Channels

Turns on **Show All Channels** by itself in every server you join, so community servers never hide channels from you.

## What you get

- **Automatic**: when you join a server, Show All Channels is turned on in it, once. If you turn it off in that server later, it stays off.
- **Your servers**: the settings count your servers and how many community servers still hide channels, with a button that turns it on in all of them (it asks first, and does them one after another).
- **Recently dealt with**: the last servers the plugin changed, with what it did and when.
- A switch to turn the automatic part off.
- A **Debugging** section at the bottom: **Copy logs** and **Run self-check**.

## What "Show All Channels" is

In a community server, Discord can hide channels until you opt in to them (the server's channel opt-in mode). The **Show All Channels** switch in a server's menu turns that mode off, so every channel you can see shows in the list. Only community servers have the switch; other servers always show everything, and the plugin leaves them alone.

## How it works

The switch in Discord's server menu calls `OptInOnboardingUtils.toggleShowAllChannels`, which ends in `OptInChannelsActionCreators.setGuildOptIn(guildId, false)`. The plugin calls the same `setGuildOptIn` when Discord has loaded it.

Discord only loads that function the first time it is used, which is often after you join a server. So when it is not there, the plugin makes the same change that `setGuildOptIn` ends in: it turns off the opt-in bit (`OPT_IN_CHANNELS_ON`, 16384) in the server's notification flags, keeping every other bit, tells Discord's stores (`USER_GUILD_SETTINGS_GUILD_UPDATE`) so the app shows it at once, and saves it with `PATCH /users/@me/guilds/<id>/settings`.

It learns about a join from two events:

- `GUILD_JOIN`, which Discord sends when you accept an invite or join from Discover. A server you only preview (a "lurker") is ignored until you really join it.
- `GUILD_CREATE`, which the server itself is sent in. Discord also sends this for every server each time it connects, so it counts as a join only if Discord did not already know the server and has finished connecting (about 20 seconds after it connects).

A moment after a join the plugin looks at the server, and again every couple of seconds if Discord has not loaded it yet. It checks afterwards that Discord took the setting.

## The limit to know

Valenced plugins cannot run while Discord is closed. A server you join on another device while this phone's Discord is closed is not changed when you join it. Use the **Show all channels** button in the settings for those.

## Privacy

What was dealt with is saved on your phone only. The report that **Copy logs** makes holds counts, never server names.

## How the code is laid out

| File | What it does |
| --- | --- |
| `src/index.ts` | Starts the plugin and ties the pieces together. |
| `src/join.ts` | Watches the Flux events for joins. |
| `src/apply.ts` | Turns the option on for one server or for all, and checks that Discord took it. |
| `src/discord.ts` | Finds Discord's stores and `setGuildOptIn`. |
| `src/Settings.tsx` | The settings screen. |
| `src/config.ts`, `src/state.ts`, `src/diag.ts` | Settings, counters and the debugging report. |
