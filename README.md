# EskimoPlugins

Mark's plugin repository for [Valenced](https://valenced.app) on Discord Android. Add the repository once and every plugin
below shows up in **Browse**, and updates arrive by themselves.

## Install

### From link (recommended)

1. In Discord, go to **Settings** > **Plugins** > **Advanced**.
2. Paste this link into **Repository URL**, then tap **Add repository**:

   ```
   https://raw.githubusercontent.com/MarkLong0467/EskimoPlugins/gh-pages/index.json
   ```

3. Go back to **Plugins**, open **Browse**, and install any plugin.
4. Turn the plugin on, then reload Discord.

Updates arrive through the same link.

### From file

1. Download a plugin's ZIP from the `pool` folder on the `gh-pages` branch.
2. In Discord, go to **Settings** > **Plugins** > **Advanced**.
3. Tap **Install from file** and pick the ZIP.
4. Turn the plugin on, then reload Discord.

## Plugins

<!-- plugins:start -->
37 plugins. Tap a name for what it does and how it works.

| Plugin | Version | What it does |
| ------ | ------- | ------------ |
| [AltMaster](plugins/altmaster) | 1.0.4 | check linked alt accounts, report a new alt, and appeal false positives from a profile menu |
| [Always Animate](plugins/always-animate) | 3.1.0 | animates profile pictures, banners, server icons, decorations, emoji, stickers and GIFs |
| [Always Trust](plugins/alwaystrust) | 1.0.2 | removes the untrusted link confirmation |
| [Auto Show All Channels](plugins/auto-show-all-channels) | 1.0.2 | turns on Show All Channels by itself in every server you join |
| [Better Calls](plugins/better-calls) | 1.1.2 | silent calls with a bell button in DMs, and remembers your audio output device |
| [Better Command Popout](plugins/better-command-popout) | 1.0.0 | copy a slash command's mention or ID from its popout |
| [Better Devices](plugins/better-devices) | 1.0.4 | multi-select logout, new-device alerts and clearer device details |
| [Bypass Status](plugins/bypass-status) | 3.0.1 | get notifications from chosen people (or everyone) while on Do Not Disturb |
| [Chat Bubbles](plugins/chatbubbles) | 1.1.5 | customizable chat bubbles with rounded corners and your own color |
| [Chatbox Avatar](plugins/chatbox-avatar) | 1.2.6 | a button in the chatbox to view your profile or open your account sheet |
| [Colorful Channels](plugins/colorful-channels) | 1.1.5 | colored channel icons for locked and NSFW channels, plus a red NSFW tag |
| [Crop Plus](plugins/crop-plus) | 1.3.1 | crop pictures much smaller than Discord allows by cropping the result again |
| [Custom Sounds](plugins/custom-sounds) | 0.1.34 | replace any Discord sound with your own link, with seasonal packs |
| [Force Timestamp Locale](plugins/force-timestamp-locale) | 1.0.1 | show every timestamp in one language, such as en-gb 24-hour times |
| [Haptics](plugins/haptics) | 0.1.3 | turn Discord's buzzing on or off, with a log of what buzzed |
| [Hide Slash Apps](plugins/hide-slash-apps) | 1.1.0 | long press an app or command in the / menu to hide it everywhere or in one server, switch off built-in commands (for bots like MEE6) |
| [HypeSquad Switcher](plugins/hypesquad) | 1.1.2 | change your HypeSquad house, or leave it, in one tap |
| [Markdown Toolbar](plugins/markdown-toolbar) | 1.2.4 | a floating formatting bar under the chat input that pops up with the keyboard |
| [Message Preview](plugins/message-preview) | 1.0.3 | preview your message before sending it |
| [Message Reminders](plugins/message-reminders) | 1.0.0 | hold a message, tap Remind Me, and get a Jump / Snooze / Done sheet when it's due |
| [Minecraft Servers](plugins/minecraft-servers) | 1.5.1 | see if your servers are online, who is playing, and the ping |
| [No Suggestions](plugins/no-suggestions) | 1.3.2 | removes the Suggested channels section that keeps coming back |
| [Pin DMs](plugins/pin-dms) | 1.15.4 | pin DMs and group chats to the top, in sections you can fold |
| [Quiet Hours](plugins/quiet-hours) | 1.0.0 | switches your status to Do Not Disturb on a schedule and puts it back, with one-tap skip tonight |
| [Raw Viewer](plugins/nef-viewer) | 1.1.2 | shows RAW photos (Nikon, Canon, Sony, Fujifilm and more) in chat, with a photo info sheet |
| [Repo Post](plugins/repo-post) | 1.0.1 | keeps your repository thread post up to date with the plugin list and versions |
| [Rich Presence](plugins/rich-presence) | 2.1.0 | up to 3 presences at once, many timers and schedules, SoundCloud built in |
| [Role Options](plugins/role-options) | 1.0.2 | copy a role's name, color or icon from the role menu |
| [Server Drawer](plugins/server-drawer) | 1.1.8 | manage your servers from a drawer above the YouBar |
| [Server Info](plugins/server-info) | 1.0.6 | members, roles, channels, boosts, owner and friends for any server |
| [Slowmode Extended](plugins/slowmode-extended) | 1.0.1 | more slowmode choices, from every second up to 6 hours |
| [Split Large Messages](plugins/split-large-messages) | 1.0.2 | automatically splits messages over the character limit |
| [Spotify Tools](plugins/spotify-tools) | 2.3.3 | Listen Along button, plus send your song or album from the + menu |
| [Status Presets](plugins/status-presets) | 1.1.1 | save statuses as presets and switch with one tap, with Undo |
| [Text React](plugins/text-react) | 1.3.3 | hold a message and add text as reactions, like letters, numbers and words such as "ok" |
| [Timestamp Maker](plugins/timestamp-maker) | 1.1.0 | a /timestamp command with a popup to build a Discord timestamp (all 7 styles, quick picks, time zones), plus @time in messages |
| [Valid User](plugins/valid-user) | 1.0.1 | resolves @unknown-user mentions automatically |
<!-- plugins:end -->

Several of these are ports of plugins by other people. Each plugin's README and manifest credit the original author and link
to the source.

## Developing the plugins

Every plugin lives in `plugins/<name>/` with the same layout: `manifest.json`, `tsconfig.json`, a `README.md` and the
TypeScript and React source in `js/` (`js/index.ts` is the entry point). Each plugin's README says what it does and how its
files fit together.

```sh
bun install
bun run build                # every plugin -> plugins/<name>/build/js/index.js
bun run lint                 # Biome
bun run lint:types           # TypeScript, every plugin
bun run test                 # builds, then runs every test in tests/
bun run test role-options    # one plugin's test
```

The tests run a plugin against a small fake of Discord (`tests/lib/harness.cjs`), so what can be checked without a phone is
checked. Setting `BUNDLE_DIR` to another build runs the same checks against that build, which is how a rewrite is shown to
behave like the version it replaced.

Not yet converted to the layout above (they still ship a handwritten `index.js`): Always Animate, Custom Sounds,
Minecraft Servers, Pin DMs and Show Hidden Channels. `bun run build` reports them as having no default export until they are.

## License

GPL-3.0, same as the Revenge plugin template this repository is based on.
