import {
	DEFAULT_MAX_ACTIVE,
	DEFAULT_SOUNDCLOUD,
	MAX_ACTIVE_LIMIT,
} from './constants'
import { scheduleAllows } from './timers'
import { text } from './variables'
import type {
	Profile,
	ProfileKind,
	RichPresenceSettings,
	Standing,
} from './types'

/** All seven days on, Sunday first. */
const EVERY_DAY = (): boolean[] => [true, true, true, true, true, true, true]

/** A blank profile with the given id and name in the list. It starts switched off. */
export function newProfile(
	id: string,
	label: string,
	kind: ProfileKind = 'custom',
): Profile {
	return {
		id,
		kind,
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
		countdownLoop: false,
		timerDate: '',
		timerRepeat: 'none',
		dailyFrom: '09:00',
		dailyTo: '17:00',
		partyCurrent: '',
		partyMax: '',
		button1Label: '',
		button1Url: '',
		button2Label: '',
		button2Url: '',
		showOnlyWhen: '',
		scheduleOn: false,
		scheduleDays: EVERY_DAY(),
		scheduleFrom: '09:00',
		scheduleTo: '17:00',
	}
}

/** The profile that shows the SoundCloud track. It is "Listening to SoundCloud"; its settings are the plugin's SoundCloud ones. */
export function newSoundCloudProfile(id: string): Profile {
	return Object.assign(newProfile(id, 'SoundCloud', 'soundcloud'), {
		name: 'SoundCloud',
		type: 2,
	})
}

/** The settings used until the user changes something: one empty profile, which is on. */
export const DEFAULT_SETTINGS: RichPresenceSettings = {
	enabled: true,
	applyOnStart: true,
	refreshSeconds: '0',
	maxActive: String(DEFAULT_MAX_ACTIVE),
	profiles: [
		Object.assign(newProfile('default', 'Default'), { enabled: true }),
	],
	soundcloud: DEFAULT_SOUNDCLOUD,
}

/**
 * The saved settings with every missing piece filled in from the defaults, so older saves keep working: a saved profile
 * gets every field a newer version added.
 *
 * A save from version 1 had one profile in use (`activeProfile`) and no switches. That profile is the one that is switched on.
 * There is always at least one profile.
 */
export function merge(
	value: Partial<RichPresenceSettings> | undefined,
): RichPresenceSettings {
	const saved = (value || {}) as Partial<RichPresenceSettings> & {
		activeProfile?: string
	}
	const out = Object.assign({}, DEFAULT_SETTINGS, saved) as RichPresenceSettings
	delete (out as { activeProfile?: string }).activeProfile
	if (!Array.isArray(out.profiles) || !out.profiles.length)
		out.profiles = DEFAULT_SETTINGS.profiles
	const firstId = (out.profiles[0] as Profile).id
	out.profiles = out.profiles.map(p => {
		const merged = Object.assign(newProfile(p.id, p.label), p)
		if (p.enabled === undefined)
			merged.enabled = p.id === (saved.activeProfile || firstId)
		if (merged.kind !== 'soundcloud') merged.kind = 'custom'
		if (!Array.isArray(merged.scheduleDays) || merged.scheduleDays.length !== 7)
			merged.scheduleDays = EVERY_DAY()
		return merged
	})
	out.soundcloud = Object.assign({}, DEFAULT_SOUNDCLOUD, saved.soundcloud || {})
	if (!Array.isArray(out.soundcloud.recents)) out.soundcloud.recents = []
	return out
}

/**
 * A made-up application id for a profile that has none of its own, the same every time for the same profile.
 *
 * Without one, every profile would be sent with the same application, and Discord treats activities of the same application
 * as one, so only one would show. A profile with its own id is a different activity. The id looks like a real one (18 digits)
 * but belongs to no application, which is also what `0` is.
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

/** How many presences may be shown at once: the setting, kept between 1 and the most there can be (3). */
export function maxActive(settings: RichPresenceSettings): number {
	const n = Number.parseInt(String(settings.maxActive ?? '').trim(), 10)
	if (Number.isNaN(n)) return DEFAULT_MAX_ACTIVE
	return Math.min(MAX_ACTIVE_LIMIT, Math.max(1, n))
}

/** The profiles that are shown, and for every other profile why not. */
export interface Plan {
	shown: Profile[]
	why: Map<string, Standing>
}

/** Says why the SoundCloud profile shows nothing right now, or nothing if it has something to show. */
export type SoundCloudCheck = (
	settings: RichPresenceSettings,
) => Standing | undefined

/**
 * Works out which profiles are shown.
 *
 * Discord's own app (`SelfPresenceStore`) keeps only **one "Playing" activity** when it has several, and keeps every other
 * kind (listening, watching, competing, streaming). It also treats activities with the same kind, application and name as
 * one. So the profiles are taken in the order of the list, and one is left out when:
 * - it is off, has no name (or, for SoundCloud, no track), or its "show only when" text is empty (it would show nothing),
 * - it is outside its schedule,
 * - it is "Playing" and an earlier one that is shown already is,
 * - it is the same kind, application and name as an earlier one that is shown,
 * - the limit is reached.
 *
 * Only a profile that would really show takes a place in the limit.
 *
 * @param settings The settings.
 * @param soundcloud Says why the SoundCloud profile has nothing to show. Without it, a SoundCloud profile always counts.
 * @param now The time, for the schedules.
 */
export function plan(
	settings: RichPresenceSettings,
	soundcloud?: SoundCloudCheck,
	now = Date.now(),
): Plan {
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
		const isSoundCloud = p.kind === 'soundcloud'
		const name = isSoundCloud ? 'SoundCloud' : text(p.name)
		if (isSoundCloud) {
			const problem = soundcloud?.(settings)
			if (problem) {
				why.set(p.id, problem)
				continue
			}
		} else {
			if (!name) {
				why.set(p.id, 'needs a name')
				continue
			}
			const gate = String(p.showOnlyWhen || '').trim()
			if (gate && !text(gate)) {
				why.set(p.id, 'hidden by show only when')
				continue
			}
			if (!scheduleAllows(p, now)) {
				why.set(p.id, 'outside its schedule')
				continue
			}
		}
		const type = isSoundCloud ? 2 : Number(p.type) || 0
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

/** The SoundCloud profile, if the list has one. There is at most one. */
export function soundCloudProfile(
	settings: RichPresenceSettings,
): Profile | undefined {
	return settings.profiles.find(p => p.kind === 'soundcloud')
}

/** Whether the SoundCloud profile is switched on and the plugin as a whole is on. Its checks and timers only run then. */
export function soundCloudOn(settings: RichPresenceSettings): boolean {
	return settings.enabled && !!soundCloudProfile(settings)?.enabled
}

/** Whether a custom profile uses the SoundCloud track: in its texts (`{sc_title}` and friends) or as its timer. */
export function usesSoundCloud(p: Profile): boolean {
	if (p.kind === 'soundcloud') return false
	if (p.timestampMode === 'external') return true
	return [
		p.name,
		p.details,
		p.state,
		p.largeImage,
		p.smallImage,
		p.largeText,
		p.smallText,
		p.button1Label,
		p.button1Url,
		p.button2Label,
		p.button2Url,
		p.detailsUrl,
		p.stateUrl,
		p.showOnlyWhen,
	].some(v => /\{sc_\w+\}/.test(String(v || '')))
}
