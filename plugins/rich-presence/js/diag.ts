import { Stores } from '@valenced/discord/flux'
import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { lastSent } from './activity'
import { planNow } from './apply'
import { effectiveAppId, maxActive, soundCloudProfile } from './profiles'
import { sc } from './scstate'
import { allRuntimes, read } from './state'
import { warnings } from './warnings'

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

/** The kind, name and application of each activity in one of Discord's lists, for the report. */
function describeList(store: string, method: string): string {
	try {
		const list = (
			Stores as unknown as Record<
				string,
				Record<string, (() => unknown) | undefined> | undefined
			>
		)[store]?.[method]?.()
		if (!Array.isArray(list)) return 'n/a'
		return (
			list
				.map(
					(a: { type?: number; name?: string; application_id?: unknown }) =>
						`[type ${a?.type}, "${a?.name}", app ${a?.application_id}]`,
				)
				.join(' ') || 'empty'
		)
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
 * The report holds every setting (the Last.fm key is hidden), what was last sent for each profile, and what Discord's lists hold.
 */
export const diag = createDiagnostics('Rich Presence', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: () => {
		const settings = read()
		return {
			enabled: settings.enabled,
			applyOnStart: settings.applyOnStart,
			refreshSeconds: settings.refreshSeconds,
			maxActive: maxActive(settings),
			soundcloud: Object.assign({}, settings.soundcloud, {
				lfmKey: settings.soundcloud.lfmKey ? '(set)' : '',
				recents: `${settings.soundcloud.recents.length} tracks`,
			}),
			profiles: settings.profiles,
		}
	},
	extra: () => {
		const settings = read()
		const { shown, why } = planNow(settings)
		const live = allRuntimes().filter(rt => rt.live).length
		const lists = discordLists()
		const lines = [
			`Profiles: ${settings.profiles.length}, switched on: ${settings.profiles.filter(p => p.enabled).length}, shown: ${shown.length} (limit ${maxActive(settings)}), sent now: ${live}`,
			`SoundCloud: ${soundCloudProfile(settings) ? 'profile added' : 'no profile'}, Last.fm ${settings.soundcloud.autoEnabled ? 'on' : 'off'} (${settings.soundcloud.lfmUser && settings.soundcloud.lfmKey ? 'name and key set' : 'name or key missing'}), track ${sc.auto || settings.soundcloud.current ? 'known' : 'none'}, status ${sc.status.state}`,
			`Discord's lists: local store ${lists.local}, kept by its filter ${lists.filtered}, before its filter ${lists.unfiltered}`,
		]
		settings.profiles.forEach((p, i) => {
			const rt = allRuntimes().find(r => r.id === p.id)
			lines.push(
				`Profile ${i + 1}: ${p.kind === 'soundcloud' ? 'SoundCloud' : `type ${Number(p.type) || 0}, timer ${p.timestampMode}`}, application ${String(p.applicationId || '').trim() ? 'set' : 'made up'}, ${why.get(p.id) ?? 'shown'}, ${rt?.live ? 'sent' : 'not sent'}`,
			)
		})
		const now = Date.now()
		lines.push(
			`Application ids sent: ${shown.map(p => `${p.label || p.id}=${effectiveAppId(p)}`).join(', ') || 'none'}`,
		)
		for (const rt of allRuntimes()) {
			const last = lastSent.get(rt.id)
			lines.push(
				`Runtime ${rt.id}: socket ${rt.socket}, pid ${rt.pid}, live ${rt.live}, applied ${Math.round((now - rt.appliedAt) / 1000)}s ago, next change ${rt.changeAt ? `in ${Math.round((rt.changeAt - now) / 1000)}s` : 'none'}, last sent ${last ? `${Math.round((now - last.at) / 1000)}s ago: ${JSON.stringify(last.activity)}` : 'never'}`,
			)
		}
		for (const [store, method] of [
			['LocalActivityStore', 'getActivities'],
			['SelfPresenceStore', 'getUnfilteredActivities'],
			['SelfPresenceStore', 'getActivities'],
		] as const) {
			lines.push(`${store}.${method}: ${describeList(store, method)}`)
		}
		return lines
	},
	checks: () => {
		const settings = read()
		const { shown } = planNow(settings)
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
				ok: new Set(shown.map(effectiveAppId)).size === shown.length,
				label: 'Every profile that is shown has its own Application ID',
				detail: 'Discord merges presences that share one into a single card',
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
					typeof lists.local !== 'number' ||
					lists.filtered >= lists.local,
				label: 'Discord’s filter keeps every activity this plugin sent',
				detail: `${lists.filtered} kept, ${lists.local} in the local store (the list before the filter also holds things like your custom status: ${lists.unfiltered})`,
			},
		]
	},
	consolePrefixes: ['[rich-presence'],
})
