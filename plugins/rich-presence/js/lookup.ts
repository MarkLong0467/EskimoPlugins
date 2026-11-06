import { decode, isoDuration, meta } from './format'
import type { Track } from './types'

/**
 * Reads a track or playlist link.
 *
 * The page gives the real link (short links redirect) and the length; SoundCloud's public oEmbed gives the title, artist and
 * artwork. Either one alone is enough to show the track.
 *
 * @param link A SoundCloud link.
 * @returns The track, without a start time.
 * @throws If neither the page nor oEmbed gave a title (the track may be private).
 */
export async function lookup(link: string): Promise<Omit<Track, 'startedAt'>> {
	let html = ''
	let canonical = link
	try {
		const page = await fetch(link, { headers: { Accept: 'text/html' } })
		if (page.ok) {
			html = await page.text()
			if (page.url && /(^|\.)soundcloud\.com\//i.test(page.url))
				canonical = page.url.split('?')[0]
			const c = /<link rel="canonical" href="([^"]+)"/i.exec(html)
			if (c) canonical = decode(c[1])
		}
	} catch {
		// The page is optional: oEmbed below may still know the track.
	}

	let data:
		| {
				author_name?: string
				title?: string
				author_url?: string
				thumbnail_url?: string
		  }
		| undefined
	try {
		const res = await fetch(
			`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(canonical)}`,
		)
		if (res.ok) data = await res.json()
	} catch {
		// The page above may be enough.
	}

	const artist = data?.author_name || ''
	let title = data?.title ? String(data.title) : decode(meta(html, 'og:title'))
	if (artist && title.slice(-(artist.length + 4)) === ` by ${artist}`)
		title = title.slice(0, -(artist.length + 4))
	if (!title)
		throw new Error('Could not read this SoundCloud link. Is the track public?')

	const kind = /\/sets\//.test(canonical) ? 'playlist' : 'track'
	let duration = 0
	if (kind === 'track') {
		const iso = /itemprop="duration"[^>]*content="([^"]+)"/i.exec(html)
		const full = /"full_duration":(\d+)/.exec(html)
		duration = full ? Number(full[1]) : iso ? isoDuration(iso[1]) : 0
	}
	return {
		url: canonical,
		kind,
		title,
		artist,
		artistUrl: data?.author_url || '',
		artwork: data?.thumbnail_url || meta(html, 'og:image'),
		duration,
	}
}
