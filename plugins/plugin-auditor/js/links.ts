/**
 * Finds the links in a plugin's code and says how much to trust each one.
 *
 * Only links that are written out in the file can be found. A plugin that builds a link from pieces while it runs, or
 * decodes it first, hides it from this list: that is what the "decodes text" finding is for.
 */

import type { LinkHit, LinkKind } from './types'

/** Links in a minified file end at a quote, a space, a bracket or a backslash. */
const LINK = /\b(?:https?|wss?):\/\/[^\s"'`<>\\)\]}]+/gi

/** The most links kept for one plugin. */
const MAX_LINKS = 400

/**
 * Places that are normal to find in a plugin. Matched against the end of the host, so `cdn.discordapp.com` is
 * `discordapp.com`.
 */
const KNOWN_HOSTS: readonly string[] = [
	'discord.com',
	'discordapp.com',
	'discordapp.net',
	'discord.gg',
	'discord.media',
	'github.com',
	'githubusercontent.com',
	'github.io',
	'valenced.app',
	'spotify.com',
	'scdn.co',
	'soundcloud.com',
	'sndcdn.com',
	'youtube.com',
	'youtu.be',
	'google.com',
	'googleapis.com',
	'gstatic.com',
	'wikipedia.org',
	'twitch.tv',
	'steampowered.com',
	'tenor.com',
	'giphy.com',
	'imgur.com',
	'last.fm',
	'listenbrainz.org',
	'musicbrainz.org',
	'coverartarchive.org',
	'mcstatus.io',
	'mcsrvstat.us',
	'apple.com',
	'audioscrobbler.com',
	'openstreetmap.org',
	'virustotal.com',
	'hybrid-analysis.com',
	'crowdin.com',
	'kmmiio99o.dev',
	'git.gay',
]

/** Links that appear inside libraries and comments: namespaces, error pages and documentation. Hidden unless asked for. */
const NOISE: readonly RegExp[] = [
	/^https?:\/\/(?:www\.)?w3\.org\//i,
	/^https?:\/\/(?:www\.)?(?:reactjs\.org|react\.dev|fb\.me|reactnative\.dev|facebook\.github\.io)\b/i,
	/^https?:\/\/(?:www\.)?(?:developer\.mozilla\.org|tc39\.es|ecma-international\.org|schema\.org|json-schema\.org)\b/i,
	/^https?:\/\/(?:www\.)?(?:npmjs\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)\b/i,
	/^https?:\/\/(?:www\.)?(?:example\.(?:com|org|net)|localhost|127\.0\.0\.1)\b/i,
	/^https?:\/\/(?:www\.)?(?:xmlpull\.org|apache\.org|opensource\.org|creativecommons\.org|mozilla\.org)\b/i,
]

/** Places that are risky to talk to, with the reason shown to the user. */
const RISKY: readonly { pattern: RegExp; reason: string }[] = [
	{
		pattern:
			/^https?:\/\/(?:[\w-]+\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\//i,
		reason:
			'A Discord webhook. Anyone with this link can post into a channel, and a plugin can use it to send your data out without an account.',
	},
	{
		pattern: /^https?:\/\/api\.telegram\.org\/bot/i,
		reason:
			'A Telegram bot link. Often used to send stolen data to the author.',
	},
	{
		pattern:
			/^https?:\/\/(?:[\w-]+\.)?(?:grabify\.link|iplogger\.\w+|2no\.co|yip\.su|ipgrabber\.\w+|blasze\.\w+|leancoding\.co|stopify\.co|gyazo\.nl|joinmy\.site|curiouscat\.club)\b/i,
		reason: 'An IP logger: it records the address of whoever opens it.',
	},
	{
		pattern:
			/^https?:\/\/(?:[\w-]+\.)?(?:ngrok(?:-free)?\.(?:io|app|dev)|trycloudflare\.com|serveo\.net|loca\.lt|localtunnel\.me|pagekite\.me|lhr\.life|localhost\.run|tunnelmole\.net)\b/i,
		reason:
			'A tunnel. It points to a computer at home, which can change without notice.',
	},
	{
		pattern:
			/^https?:\/\/(?:[\w-]+\.)?(?:pastebin\.com|paste\.ee|hastebin\.com|rentry\.(?:co|org)|ghostbin\.\w+|controlc\.com|justpaste\.it|privatebin\.\w+|pastes\.io|dpaste\.\w+)\b/i,
		reason:
			'A paste site. Text there can be changed at any time, so code or settings loaded from it can change after you installed the plugin.',
	},
	{
		pattern:
			/^https?:\/\/(?:[\w-]+\.)?(?:bit\.ly|tinyurl\.com|t\.co|is\.gd|cutt\.ly|rb\.gy|goo\.gl|ow\.ly|shorturl\.at|v\.gd|tiny\.cc)\//i,
		reason: 'A link shortener hides where the link really goes.',
	},
	{
		pattern: /^https?:\/\/(?:\d{1,3}\.){3}\d{1,3}(?::\d+)?(?:\/|$)/,
		reason: 'A bare IP address instead of a name: no owner can be looked up.',
	},
]

/** Private network addresses, which are not an outside place. */
const PRIVATE_IP =
	/^https?:\/\/(?:127\.|10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/

/** The host of a link, lower case and without a port, or an empty string. */
export function hostOf(url: string): string {
	const match = /^[a-z]+:\/\/([^/?#:]+)/i.exec(url)
	return match?.[1] ? match[1].toLowerCase().replace(/^www\./, '') : ''
}

/** Whether the host is a known place or a subdomain of one. */
function isKnown(host: string): boolean {
	return KNOWN_HOSTS.some(known => host === known || host.endsWith(`.${known}`))
}

/** What to make of one link. */
export function classify(url: string): { kind: LinkKind; reason?: string } {
	for (const risky of RISKY) {
		if (risky.pattern.test(url)) {
			if (PRIVATE_IP.test(url)) break
			return { kind: 'risky', reason: risky.reason }
		}
	}
	if (NOISE.some(n => n.test(url))) return { kind: 'noise' }
	if (isKnown(hostOf(url))) return { kind: 'known' }
	return { kind: 'unknown' }
}

/** Cuts the end of a link that is really the end of a sentence or of a template placeholder. */
function tidy(raw: string): { url: string; dynamic: boolean } {
	const dollar = raw.indexOf('${')
	const dynamic = dollar >= 0
	const cut = dynamic ? raw.slice(0, dollar) : raw
	return { url: cut.replace(/[.,;:!?]+$/, ''), dynamic }
}

/**
 * Every different link in some code.
 *
 * @param source The plugin's code.
 * @returns The links, risky ones first, then unknown, known and noise; each only once.
 */
export function findLinks(source: string): LinkHit[] {
	const seen = new Map<string, LinkHit>()
	for (const match of source.matchAll(LINK)) {
		const { url, dynamic } = tidy(match[0])
		const host = hostOf(url)
		if (!host?.includes('.')) continue
		if (seen.has(url)) continue
		const { kind, reason } = classify(url)
		seen.set(url, { url, host, kind, reason, dynamic })
		if (seen.size >= MAX_LINKS) break
	}
	const order: Record<LinkKind, number> = {
		risky: 0,
		unknown: 1,
		known: 2,
		noise: 3,
	}
	return [...seen.values()].sort(
		(a, b) => order[a.kind] - order[b.kind] || a.host.localeCompare(b.host),
	)
}
