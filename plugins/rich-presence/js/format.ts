import { LINK_RE } from './constants'
import { sc } from './scstate'
import { pad } from './timers'

/** " · checked 4s ago" for the preview, so you can see the plugin is keeping up. */
export function checkedAgo(): string {
	return sc.lastPollAt
		? ` · checked ${Math.max(0, Math.round((Date.now() - sc.lastPollAt) / 1000))}s ago`
		: ''
}

/** A length in milliseconds as `3:33` or `1:05:07`. */
export function fmt(ms: number): string {
	const s = Math.max(0, Math.round(ms / 1000))
	const h = Math.floor(s / 3600)
	const m = Math.floor((s % 3600) / 60)
	return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}

/** Turns the few HTML entities that appear in page titles back into characters. */
export function decode(s: unknown): string {
	return String(s == null ? '' : s)
		.replace(/&quot;/g, '"')
		.replace(/&#0?39;/g, "'")
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&amp;/g, '&')
}

/** Finds the first SoundCloud link in any text, including the text SoundCloud's Share button copies. */
export function parseLink(text: unknown): string | null {
	const m = LINK_RE.exec(typeof text === 'string' ? text : '')
	return m ? m[0].replace(/[.,;!?]+$/, '') : null
}

/** A length in the ISO form (`PT03M33S`) as milliseconds, or 0. */
export function isoDuration(value: unknown): number {
	const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(value || ''))
	if (!m) return 0
	return (
		((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) *
		1000
	)
}

/** The content of a `<meta>` tag of a page, by its property or name. Empty if there is none. */
export function meta(html: string, prop: string): string {
	const re = new RegExp(
		`<meta[^>]+(?:property|name)="${prop}"[^>]+content="([^"]*)"`,
		'i',
	)
	const m = re.exec(html)
	return m ? decode(m[1]) : ''
}

/** A link that searches SoundCloud for a song, used for tracks that have no link of their own. */
export function searchLink(artist: string, title: string): string {
	return `https://soundcloud.com/search/sounds?q=${encodeURIComponent((artist ? `${artist} ` : '') + title)}`
}
