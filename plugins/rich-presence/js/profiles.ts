import type { Profile, RichPresenceSettings } from './types'

/** A blank profile with the given id and name in the list. */
export function newProfile(id: string, label: string): Profile {
	return {
		id,
		label,
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

/** The settings used until the user changes something: one empty profile. */
export const DEFAULT_SETTINGS: RichPresenceSettings = {
	enabled: true,
	applyOnStart: true,
	refreshSeconds: '0',
	activeProfile: 'default',
	profiles: [newProfile('default', 'Default')],
}

/**
 * The saved settings with every missing piece filled in from the defaults, so older saves keep working: a saved profile
 * gets every field a newer version added. There is always at least one profile.
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
	return out
}

/** The profile in use: the active one, else the first. */
export function currentProfile(settings: RichPresenceSettings): Profile {
	return (
		settings.profiles.find(p => p.id === settings.activeProfile) ||
		settings.profiles[0]
	)
}
