import { DEFAULT_MAX_ACTIVE, MAX_ACTIVE_LIMIT } from './constants'
import type { Profile, RichPresenceSettings } from './types'

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
 * The profiles that are switched on and fit the limit, in the order of the list. The first ones are shown; a profile that is
 * on but past the limit waits until there is room.
 */
export function wanted(settings: RichPresenceSettings): Profile[] {
	if (!settings.enabled) return []
	return settings.profiles.filter(p => p.enabled).slice(0, maxActive(settings))
}
