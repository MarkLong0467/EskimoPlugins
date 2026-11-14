# Plugin Auditor

Scans the plugins you have installed for signs that they can reach your token, change things on your account, run downloaded code or send data out. Lists every link in their code, finds plugins that are copies of each other, and can check them on **VirusTotal**.

## Why this exists

Valenced has no permissions. A plugin runs with the same access as Discord itself: it can read your messages and your token. The only way to know what a plugin can do is to read its code. This plugin reads it for you, and **never runs it**.

## What you get

- **A summary at the top.** How many plugins need attention, a bar split into critical / high / medium / low / clean, and the number of plugins, places linked and copies.
- **Plugins tab.** Every plugin, worst first, with a risk badge. Filter by risk (Attention, Worth a look, Clean, All) and by **what the plugin can do**: *Account & token*, *Changes things*, *Network*, *Runs code*, *Phone & files*, *Other plugins*, *Hidden code*, *Suspicious places*. Tap a plugin to see each finding, why it matters and the code it matched.
- **Links tab.** Every link written in the plugins' code, grouped by place, with who uses it and a trust label (**known**, **unknown**, **risky**, or **library** noise, hidden by default). Copy all links, or tap a place for its links and the plugins that use it.
- **Copies tab.** Plugins with identical code, nearly identical code (a fork or an old version), the same name, or the same plugin id from a different author, with advice on what to remove.
  It also finds a plugin that does what an option of another plugin does: Favorite Anything is not needed when Media Utils' "Favorite anything" option is on. A plugin's name in another plugin's option labels is a likely match; a description that matches an option's explanation is a maybe.
- **VirusTotal.** Without a key, buttons open the plugin's page on VirusTotal and Hybrid Analysis by hash. With a free key, the plugin asks for you: **Check** (sends only the SHA-256), **Upload code** (asks first, every time) and **Check unknown places** (sends only the names).
- **Whitelist.** Open a plugin and tap **Whitelist**: it stops counting as needing attention and is left out of the start-up alert. It keeps its real risk badge and its findings stay listed. The **Whitelisted** chip on the Plugins tab lists them all, and Options lists them too (tap one to remove it).
- **Updates of whitelisted plugins.** The version you whitelisted is remembered. If the plugin updates to a different version and that version is **Critical**, it is shown again (in the start-up alert and on the Attention list, marked as updated) until you tap **Whitelist this version**. **Ignore new update checks** turns that off for one plugin; **Check new updates again** turns it back on.
- **A note at the bottom of the settings** (above Debugging) explains all of this in plain words.
- **Ignore a finding.** Under each finding, **Ignore this** hides just that one on that plugin (and any combination it is part of), so a different, new problem on the same plugin still shows. **Notice again** brings it back. Both lists are in Options, where a tap removes an entry.
- **Scan when Discord starts**, with a toast that names the plugins that need attention. Only **high** and **critical** plugins count, after ignored findings, and whitelisted plugins are left out.
- **Debugging** section at the bottom: **Copy logs** and **Run self-check** (see below).

## What it looks for

| Group | Examples |
| --- | --- |
| Account & token | `getToken`, `AuthenticationStore`, `TokenManager`, `setToken`, `loginToken`, an `Authorization` header, password / email / two-factor actions |
| Changes things | `HTTP.post/put/patch/del`, `method: "POST"`, sending or deleting messages, joining or leaving servers, friends, roles, synced settings |
| Network | `fetch`, `XMLHttpRequest`, WebSocket, the native bridge |
| Runs code | `eval`, `new Function` |
| Phone & files | reading the clipboard, writing or deleting files, device ids, Android permissions |
| Other plugins | installing, enabling or removing plugins, Valenced's hidden developer API |
| Hidden code | scrambled names, escape-coded text, `atob` / `fromCharCode`, very long encoded strings |
| Suspicious places | Discord webhooks, Telegram bots, IP loggers, tunnels, paste sites, link shorteners, bare IP addresses |

The names come from Discord's own client code (the [datamined mobile source](https://github.com/Wumpus-Central/discord-mobile-datamining)): `AuthenticationStore.getToken`, `TokenManager.getToken/setToken`, `AuthenticationActionCreators.loginToken`, `HTTP.post/put/patch/del`.

**How the level is decided.** Things that are rarely innocent set the level high: running downloaded code, signing you in or out, installing plugins, scrambled code, webhooks and loggers. A plugin that reads the token is **High**, and **Critical** if it can also reach a place that is not a known one (that is what a token stealer does). Routine behaviour, such as posting to Discord, sits at **Medium** or lower, so *Attention* stays short enough to mean something.

## The limits

It reads code for signs; it does not prove a plugin is safe or harmful. A plugin can build links and calls from pieces while it runs, and a native (Android) part cannot be read; it is flagged but not scanned. Many honest plugins make web requests or change things on purpose. Treat a finding as a reason to look, not a verdict.

## Privacy

- Everything is scanned on your phone.
- VirusTotal: a check sends the file's **SHA-256** only, a place check sends the **name** only, and an upload sends the **whole plugin file** (VirusTotal shares uploads with security companies), so it asks first.
- The VirusTotal key and the plugins you accepted are saved on your phone. The key is never in the copied logs.

## Copy logs

At the bottom of the settings. The report says which plugin list worked (`native list` or `hidden list + files`) and what the others said when they failed, how long the scan took, the slowest plugins, the plugins Valenced gave no code for, which rules matched how many plugins, one line per scanned plugin (risk, counts, size, short hash; never code), the last VirusTotal requests with their status codes, the settings with the key hidden, and the last events and errors. **Run self-check** tests SHA-256, the regular expressions the rules need on this phone's Hermes, that every rule is valid, that web requests exist, that Valenced lists the plugins and gives code for every one, and that the last scan and VirusTotal request worked.

## How it works

The code is in `js/`:

| File | What it does |
| --- | --- |
| `index.ts` | Starts the plugin and the automatic scan. |
| `source.ts` | Gets the installed plugins and their code from Valenced (`valenced.plugins.list`), or from the hidden list and the plugin folders. |
| `rules.ts` | The rules, the combinations that are worse together, and the words shown for them. |
| `links.ts` | Finds links in code and judges them. |
| `scan.ts` | Scans one plugin: rules, links, combinations, risk and score. |
| `duplicates.ts` | Finds plugins that are copies of each other, or that do what an option of another plugin does. |
| `hash.ts` | SHA-256 and base64 without anything from the phone. |
| `virustotal.ts` | The VirusTotal API v3 client: file and domain look-ups, upload, rate pacing. |
| `store.ts` | Runs scans and VirusTotal checks, keeps the results, builds the reports and self-checks. |
| `Settings.tsx`, `Hero.tsx`, `PluginsTab.tsx`, `LinksTab.tsx`, `CopiesTab.tsx`, `OptionsTab.tsx` | The settings screen. |
| `PluginSheet.tsx`, `HostSheet.tsx`, `VtBlock.tsx` | The sheets for one plugin and one place, and the VirusTotal part of both. |
| `config.ts`, `discord.ts`, `constants.ts`, `components.tsx`, `format.ts`, `types.ts`, `diag.ts` | Helpers. |

The Debugging section is the one in [`shared/kmmiio`](../../shared/kmmiio). Tests: `tests/plugin-auditor.test.cjs`.
