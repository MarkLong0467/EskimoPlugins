# Repo Post

Keeps the plugin list in your own repository thread post up to date, with version numbers. Publish a plugin and the post gets the new list the next time Discord is open.

## What you get

- **A preview at the top of the settings** that shows exactly what the post will say, and how many characters it is.
- **Automatic updates**: every 10 minutes while Discord is open, and when you open it, the plugin looks at the list. If it changed, it edits your post. When nothing changed it does not ask Discord anything.
- **Update the post now**, **Copy the text** and **Refresh preview** buttons.
- **Restore the previous text** puts back what the post said before the last change (and turns automatic updates off, or the next update would undo it).
- **Version numbers** after each name, which you can turn off.
- **Fits the limit**: a post may have 2000 characters (4000 with Nitro). If the list is longer, the descriptions are shortened step by step, then left out, and the preview says which. A list that cannot fit even without descriptions is not sent.
- A **Debugging** section at the bottom: **Copy logs** and **Run self-check**.

## How the list is made

`tools/publish.cjs` writes `post.json` next to `index.json` every time a plugin is published, from the index itself. Every plugin on the page is listed, in alphabetical order, with the version of its latest release. The short line of each plugin and the lines above the list are in `tools/post.config.json`. A plugin with no short line there gets the first sentence of its description.

To run it by hand: `node tools/post.cjs <index-folder>`.

## Why it is a plugin

Only your own Discord can edit a message you wrote. A bot or a GitHub Action can only edit its own messages. So the edit is made by the plugin, through Discord's own server connection (the plugin never touches your login token), and only if the post was written by the account that is logged in.

## The limit to know

Valenced plugins cannot run while Discord is closed. After you publish, the post changes the next time Discord is open, within about 10 minutes (GitHub also caches the list for about 5 minutes). If someone edits the post by hand, it is put right again within 6 hours.

## Which post

The thread and message ids are in the settings (they default to the "Mark's Repository" post). The first message of a forum post has the same id as the thread.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin and ties the pieces together. |
| `post.ts` | Makes the text from the list and fits it to the limit. No Discord code. |
| `sync.ts` | Fetches the list, reads and edits the post, restores it, and looks now and then. |
| `http.ts`, `discord.ts` | Find Discord's server connection, your account and the toasts. |
| `Settings.tsx` | The settings screen, with the preview first. |
| `config.ts`, `constants.ts`, `types.ts`, `diag.ts` | Helpers. |
