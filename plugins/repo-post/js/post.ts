import { DESCRIPTION_STEPS } from './constants'
import type { PostData, PostPlugin, Rendered } from './types'

/** Cuts a text to at most `max` characters at a word, with an ellipsis. A text that fits is returned as it is. */
export function shorten(text: string, max: number): string {
	if (text.length <= max) return text
	const cut = text.slice(0, Math.max(1, max - 1))
	const space = cut.lastIndexOf(' ')
	return `${(space > max * 0.5 ? cut.slice(0, space) : cut).replace(/[\s,;:(]+$/, '')}…`
}

/** One line of the list: `• **Name** `1.0.4`: what it does`. */
export function lineOf(
	plugin: PostPlugin,
	versions: boolean,
	maxDescription: number,
): string {
	const suffix = plugin.suffix ? ` ${plugin.suffix}` : ''
	const version = versions && plugin.version ? ` \`${plugin.version}\`` : ''
	const short =
		maxDescription > 0 && plugin.short
			? `: ${shorten(plugin.short, maxDescription)}`
			: ''
	return `• **${plugin.name}**${suffix}${version}${short}`
}

/** The whole post for one choice of the longest description (0 for none, `Infinity` for all of them). */
function build(
	data: PostData,
	versions: boolean,
	maxDescription: number,
): string {
	const lines = [
		...data.header,
		...data.plugins.map(p => lineOf(p, versions, maxDescription)),
		...data.footer,
	]
	return lines.join('\n')
}

/**
 * Makes the text of the post from the list.
 *
 * The full descriptions are used if they fit. If not, they are cut shorter and shorter, then left out, until the post is
 * within the limit. A post that does not fit even without them is reported as too long, and is not meant to be sent.
 */
export function render(
	data: PostData,
	options: { versions: boolean; limit: number },
): Rendered {
	const { versions, limit } = options
	const full = build(data, versions, Number.POSITIVE_INFINITY)
	if (full.length <= limit)
		return {
			text: full,
			fits: true,
			level: 'full',
			maxDescription: Number.POSITIVE_INFINITY,
			limit,
		}
	for (const step of DESCRIPTION_STEPS) {
		const text = build(data, versions, step)
		if (text.length <= limit)
			return {
				text,
				fits: true,
				level: 'shortened',
				maxDescription: step,
				limit,
			}
	}
	const names = build(data, versions, 0)
	return {
		text: names,
		fits: names.length <= limit,
		level: names.length <= limit ? 'names only' : 'too long',
		maxDescription: 0,
		limit,
	}
}

/** A short fingerprint of a text, to tell whether it changed (not for security). */
export function fingerprint(text: string): string {
	let hash = 5381
	for (let i = 0; i < text.length; i++)
		hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0
	return `${hash.toString(36)}:${text.length}`
}

/** Whether something fetched looks like a `post.json`. */
export function isPostData(value: unknown): value is PostData {
	const v = value as Partial<PostData> | null
	return (
		!!v &&
		typeof v === 'object' &&
		Array.isArray(v.header) &&
		v.header.every(l => typeof l === 'string') &&
		Array.isArray(v.plugins) &&
		v.plugins.length > 0 &&
		v.plugins.every(
			p =>
				!!p &&
				typeof p.name === 'string' &&
				typeof p.version === 'string' &&
				typeof p.short === 'string',
		)
	)
}

/** Fills in what a `post.json` may leave out. */
export function cleanPostData(data: PostData): PostData {
	return {
		format: data.format,
		header: data.header,
		footer: Array.isArray(data.footer) ? data.footer : [],
		plugins: data.plugins.map(p => ({
			id: String(p.id || p.name),
			name: p.name,
			version: p.version,
			short: p.short,
			suffix: typeof p.suffix === 'string' ? p.suffix : '',
		})),
	}
}
