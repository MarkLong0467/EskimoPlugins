import { apiGet } from './discord'

/** What Discord's web API answers when it is asked about a server with its counts. */
interface Counts {
	approximate_presence_count?: unknown
}

/** The words for an error from Discord's connection: its status or message. */
function why(error: unknown): string {
	const e = error as
		| { status?: unknown; body?: { message?: unknown }; message?: unknown }
		| undefined
	const text = e?.body?.message || e?.message
	return e?.status != null
		? `${e.status}${text ? ` ${String(text).slice(0, 40)}` : ''}`
		: String(text || error).slice(0, 60)
}

/**
 * How many members of a server are online, asked from Discord's web API.
 *
 * Two answers are tried: the server itself with its counts (`with_counts`), and its preview. Discord rounds the number.
 *
 * @returns The count.
 * @throws An error that says what each try answered, so the sheet can show why there is no number.
 */
export async function fetchOnline(guildId: string): Promise<number> {
	const tries: Array<
		[string, { url: string; query?: Record<string, unknown> }]
	> = [
		['server', { url: `/guilds/${guildId}`, query: { with_counts: true } }],
		['preview', { url: `/guilds/${guildId}/preview` }],
	]
	const failures: string[] = []
	for (const [name, options] of tries) {
		try {
			const body = await apiGet(options.url, options.query)
			const n = (body as Counts | undefined)?.approximate_presence_count
			if (typeof n === 'number') return n
			failures.push(`${name}: no count`)
		} catch (error) {
			failures.push(`${name}: ${why(error)}`)
		}
	}
	throw new Error(failures.join('; '))
}
