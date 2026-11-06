import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { setting } from './config'
import { currentUser } from './discord'
import { discordHttp } from './http'
import { isBusy, lastList, lastRender, lastResult } from './sync'

/** `3 min ago` for a time in milliseconds. */
function ago(at: number): string {
	if (!at) return 'never'
	const minutes = Math.round((Date.now() - at) / 60_000)
	if (minutes < 1) return 'just now'
	if (minutes < 120) return `${minutes} min ago`
	return `${Math.round(minutes / 60)} h ago`
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds the ids, counts and lengths, never the text of the post.
 */
export const diag = createDiagnostics('Repo Post', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => ({
		auto: setting('auto'),
		postUrl: setting('postUrl'),
		channelId: setting('channelId'),
		messageId: setting('messageId'),
		versions: setting('versions'),
		limit: setting('limit'),
		syncedAt: ago(Number(setting('syncedAt'))),
		hasPreviousText: !!setting('previousText'),
	}),
	extra: () => {
		const result = lastResult()
		const list = lastList()
		const rendered = lastRender()
		const lines = [`Updating now: ${isBusy() ? 'yes' : 'no'}`]
		if (list) lines.push(`List: ${list.plugins.length} plugins`)
		if (rendered)
			lines.push(
				`Text: ${rendered.text.length} of ${rendered.limit} characters, ${rendered.level}`,
			)
		if (result)
			lines.push(
				`Last result: ${result.status} (${ago(result.at)}): ${result.detail}`,
			)
		return lines
	},
	checks: () => [
		{
			ok: !!discordHttp(),
			label: 'Discord’s server connection found',
		},
		{
			ok: !!currentUser()?.id,
			label: 'Your account is known',
		},
		{
			ok: lastList() !== null,
			label: 'The list was fetched',
			detail: lastList() ? undefined : 'Open the settings or press Update now',
		},
		{
			ok: lastRender()?.fits !== false,
			label: 'The text fits the limit',
		},
		{
			ok: lastResult()?.status !== 'error',
			label: 'The last update worked',
			detail:
				lastResult()?.status === 'error' ? lastResult()?.detail : undefined,
		},
	],
	consolePrefixes: ['[repo-post'],
})
