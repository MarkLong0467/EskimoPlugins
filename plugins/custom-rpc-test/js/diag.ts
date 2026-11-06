import { Stores } from '@valenced/discord/flux'
import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { maxActive, plan } from './profiles'
import { allRuntimes, read } from './state'

/** How many activities one of Discord's stores holds, or `n/a` if the store or the method is not there. */
function count(store: string, method: string): number | 'n/a' {
	try {
		const list = (
			Stores as unknown as Record<
				string,
				Record<string, (() => unknown) | undefined> | undefined
			>
		)[store]?.[method]?.()
		return Array.isArray(list) ? list.length : 'n/a'
	} catch {
		return 'n/a'
	}
}

/**
 * What Discord's own stores hold. Discord's app keeps one "Playing" activity out of several (`SelfPresenceStore`), so the
 * three numbers show where activities are lost: sent by this plugin, kept by Discord's local store, and what is left after its
 * filter.
 */
function discordLists() {
	return {
		local: count('LocalActivityStore', 'getActivities'),
		unfiltered: count('SelfPresenceStore', 'getUnfilteredActivities'),
		filtered: count('SelfPresenceStore', 'getActivities'),
	}
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds numbers and kinds only: no profile names, texts, links or images.
 */
export const diag = createDiagnostics('CustomRPC Test', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => {
		const settings = read()
		return {
			enabled: settings.enabled,
			applyOnStart: settings.applyOnStart,
			refreshSeconds: settings.refreshSeconds,
			maxActive: maxActive(settings),
			profiles: settings.profiles.length,
		}
	},
	extra: () => {
		const settings = read()
		const { shown, why } = plan(settings)
		const live = allRuntimes().filter(rt => rt.live).length
		const lists = discordLists()
		const lines = [
			`Profiles: ${settings.profiles.length}, switched on: ${settings.profiles.filter(p => p.enabled).length}, shown: ${shown.length} (limit ${maxActive(settings)}), sent now: ${live}`,
			`Discord's lists: local store ${lists.local}, kept by its filter ${lists.filtered}, before its filter ${lists.unfiltered}`,
		]
		settings.profiles.forEach((p, i) => {
			const rt = allRuntimes().find(r => r.id === p.id)
			lines.push(
				`Profile ${i + 1}: type ${Number(p.type) || 0}, application ${String(p.applicationId || '').trim() ? 'set' : 'made up'}, ${why.get(p.id) ?? 'shown'}, ${rt?.live ? 'sent' : 'not sent'}`,
			)
		})
		return lines
	},
	checks: () => {
		const settings = read()
		const { shown } = plan(settings)
		const live = allRuntimes().filter(rt => rt.live).length
		const lists = discordLists()
		const playing = shown.filter(p => (Number(p.type) || 0) === 0).length
		return [
			{
				ok: live === shown.length,
				label: 'Every profile that is shown has been sent',
				detail:
					live === shown.length ? undefined : `${live} sent of ${shown.length}`,
			},
			{
				ok: playing <= 1,
				label: 'At most one profile is "Playing"',
				detail:
					playing <= 1
						? undefined
						: 'Discord’s app keeps only one Playing activity',
			},
			{
				ok: typeof lists.local !== 'number' || lists.local >= live,
				label: 'Discord’s local store holds what was sent',
				detail: `${lists.local} held, ${live} sent`,
			},
			{
				ok:
					typeof lists.filtered !== 'number' ||
					typeof lists.unfiltered !== 'number' ||
					lists.filtered >= lists.unfiltered,
				label: 'Discord’s filter keeps every activity',
				detail: `${lists.filtered} kept of ${lists.unfiltered}`,
			},
		]
	},
	consolePrefixes: ['[custom-rpc-test'],
})
