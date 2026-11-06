import { DEFAULT_MAX_ACTIVE, MAX_ACTIVE_LIMIT } from './constants'
import { text } from './variables'
import type { Profile, RichPresenceSettings, Standing } from './types'

/** A blank profile with the given id and name in the list. */
export function newProfile(id: string, label: string): Profile {
	return {
		id,
		label,
		enabled: false,
		name: '',
		type: 0,
		details: '',
		detailsUrl: '',
		state: '',
		stateUrl: '',
		applicationId: '',
		streamUrl: '',
		largeImage: '',
		largeUrl: '',
		largeText: '',
		smallImage: '',
		smallUrl: '',
		smallText: '',
		timestampMode: 'none',
		customStart: '',
		customEnd: '',
		countdownMinutes: '30',
		partyCurrent: '',
		partyMax: '',
		button1Label: '',
		button1Url: '',
		button2Label: '',
		button2Url: '',
		showOnlyWhen: '',
	}
}

/** The settings used until the user changes something: one empty profile, which is on. */
export const DEFAULT_SETTINGS: RichPresenceSettings = {
	enabled: true,
	applyOnStart: true,
	refreshSeconds: '0',
	maxActive: String(DEFAULT_MAX_ACTIVE),
	editing: 'default',
	profiles: [
		Object.assign(newProfile('default', 'Default'), { enabled: true }),
	],
}

/**
 * The saved settings with every missing piece filled in from the defaults, so older saves keep working: a saved profile
 * gets every field a newer version added. There is always at least one profile, and the one being edited is one of them.
 */
export function merge(
	value: Partial<RichPresenceSettings> | undefined,
): RichPresenceSettings {
	const out = Object.assign(
		{},
		DEFAULT_SETTINGS,
		value || {},
	) as RichPresenceSettings
	if (!Array.isArray(out.profiles) || !out.profiles.length)
		out.profiles = DEFAULT_SETTINGS.profiles
	out.profiles = out.profiles.map(p =>
		Object.assign(newProfile(p.id, p.label), p),
	)
	if (!out.profiles.some(p => p.id === out.editing))
		out.editing = (out.profiles[0] as Profile).id
	return out
}

/** The profile whose fields are being edited: the chosen one, else the first. */
export function currentProfile(settings: RichPresenceSettings): Profile {
	return (
		settings.profiles.find(p => p.id === settings.editing) ||
		(settings.profiles[0] as Profile)
	)
}

/** How many presences may be shown at once: the setting, kept between 1 and the most there can be. */
export function maxActive(settings: RichPresenceSettings): number {
	const n = Number.parseInt(String(settings.maxActive ?? '').trim(), 10)
	if (Number.isNaN(n)) return DEFAULT_MAX_ACTIVE
	return Math.min(MAX_ACTIVE_LIMIT, Math.max(1, n))
}

/**
 * A made-up application id for a profile that has none of its own, the same every time for the same profile.
 *
 * Rich Presence sends `0` for every profile without one. With several presences at once that would give them all the same
 * application, and Discord treats activities of the same application as one, so only one would show. A profile with its own id
 * is a different activity. The id looks like a real one (18 digits) but belongs to no application, which is also what `0` is.
 */
export function generatedAppId(profileId: string): string {
	let a = 5381
	let b = 52711
	for (let i = 0; i < profileId.length; i++) {
		const c = profileId.charCodeAt(i)
		a = ((a * 33) ^ c) >>> 0
		b = (b * 31 + c) >>> 0
	}
	return `1${String(a).padStart(10, '0')}${String(b % 10_000_000).padStart(7, '0')}`
}

/** The application id a profile is sent with: the one typed in, else its own made-up one. */
export function effectiveAppId(p: Profile): string {
	return String(p.applicationId || '').trim() || generatedAppId(p.id)
}

/** The kinds of activity in the order a new profile is given one: playing, listening, watching, competing, streaming. */
const TYPE_ORDER = [0, 2, 3, 5, 1]

/**
 * The kind of activity a new profile should start with: the first one no profile has yet. Discord's app shows only one
 * "Playing" at a time but any number of the other kinds, so a second profile that is also "Playing" would not show.
 */
export function nextFreeType(settings: RichPresenceSettings): number {
	const used = new Set(settings.profiles.map(p => Number(p.type) || 0))
	return TYPE_ORDER.find(t => !used.has(t)) ?? 2
}

/** The profiles that are shown, and for every other profile why not. */
export interface Plan {
	shown: Profile[]
	why: Map<string, Standing>
}

/**
 * Works out which profiles are shown.
 *
 * Discord's own app (`SelfPresenceStore`) keeps only **one "Playing" activity** when it has several, and keeps every other
 * kind (listening, watching, competing, streaming). It also treats activities with the same kind, application and name as
 * one. So the profiles are taken in the order of the list, and one is left out when:
 * - it is off, has no name, or its "show only when" text is empty (it would show nothing),
 * - it is "Playing" and an earlier one that is shown already is,
 * - it is the same kind, application and name as an earlier one that is shown,
 * - the limit is reached.
 *
 * Only a profile that would really show takes a place in the limit.
 */
export function plan(settings: RichPresenceSettings): Plan {
	const why = new Map<string, Standing>()
	const shown: Profile[] = []
	const limit = maxActive(settings)
	const seen = new Set<string>()
	let playing = false
	for (const p of settings.profiles) {
		if (!settings.enabled || !p.enabled) {
			why.set(p.id, 'off')
			continue
		}
		const name = text(p.name)
		if (!name) {
			why.set(p.id, 'needs a name')
			continue
		}
		const gate = String(p.showOnlyWhen || '').trim()
		if (gate && !text(gate)) {
			why.set(p.id, 'hidden by show only when')
			continue
		}
		const type = Number(p.type) || 0
		if (type === 0 && playing) {
			why.set(p.id, 'second playing')
			continue
		}
		const key = `${type}:${effectiveAppId(p)}:${name}`
		if (seen.has(key)) {
			why.set(p.id, 'duplicate')
			continue
		}
		if (shown.length >= limit) {
			why.set(p.id, 'over the limit')
			continue
		}
		if (type === 0) playing = true
		seen.add(key)
		shown.push(p)
	}
	return { shown, why }
}

/** The profiles that are shown, in the order of the list. */
export function wanted(settings: RichPresenceSettings): Profile[] {
	return plan(settings).shown
}
