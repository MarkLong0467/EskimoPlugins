import { clearProfile, restartRefresh, scheduleApply } from './apply'
import { PROFILE_KEYS } from './constants'
import { newProfile, nextFreeType, soundCloudProfile } from './profiles'
import { syncSoundCloud } from './soundcloud'
import { read, runtimeOf, save, saveSoundCloud } from './state'
import type { Profile, RichPresenceSettings, SoundCloudSettings } from './types'

/** A new id for a profile. Ids made in the same millisecond get a different ending. */
let lastId = ''
export function newId(): string {
	let id = Date.now().toString(36)
	if (id === lastId) id += Math.random().toString(36).slice(2, 5)
	lastId = id
	return id
}

/**
 * Saves the settings and sends the presences soon.
 *
 * @param patch The settings to change.
 * @param reset True to restart the timers.
 * @param ids The only profiles to send, when the change is to those alone. Leave it out to send every profile that is shown.
 */
export function commit(
	patch: Partial<RichPresenceSettings>,
	reset?: boolean,
	ids?: string[],
): Promise<void> {
	return save(patch).then(() => {
		scheduleApply(!!reset, ids)
		restartRefresh()
	})
}

/** Changes some fields of one profile. */
export function updateProfile(
	id: string,
	patch: Partial<Profile>,
	reset?: boolean,
): Promise<void> {
	return commit(
		{
			profiles: read().profiles.map(p =>
				p.id === id ? Object.assign({}, p, patch) : p,
			),
		},
		reset,
		[id],
	)
}

/** Switches a profile on or off. Switching on starts its timers from now. SoundCloud starts or stops its checks too. */
export function toggleProfile(id: string, enabled: boolean): Promise<void> {
	if (enabled) {
		const rt = runtimeOf(id)
		rt.appliedAt = Date.now()
		rt.loopAnchor = rt.appliedAt
	}
	return commit({
		profiles: read().profiles.map(p =>
			p.id === id ? Object.assign({}, p, { enabled }) : p,
		),
	}).then(() => {
		if (soundCloudProfile(read())?.id === id) syncSoundCloud()
	})
}

/** Adds a profile to the list. It starts switched off, so adding one never goes over the limit. */
export function addProfile(added: Profile): Promise<void> {
	return commit(
		{
			profiles: read().profiles.concat(
				Object.assign({}, added, { enabled: false }),
			),
		},
		true,
		[],
	)
}

/** A new blank profile with the next free kind of activity. */
export function blankProfile(): Profile {
	const settings = read()
	return Object.assign(
		newProfile(newId(), `Presence ${settings.profiles.length + 1}`),
		{ type: nextFreeType(settings) },
	)
}

/** A copy of a profile with a new id and the next free kind of activity. */
export function copyOf(source: Profile): Profile {
	return Object.assign({}, source, {
		id: newId(),
		label: `${source.label || 'Presence'} copy`,
		type: nextFreeType(read()),
	})
}

/** A profile made from copied JSON, or nothing if it is not one. Only the known fields are taken. */
export function profileFromJson(raw: string): Profile | undefined {
	try {
		const data = JSON.parse(raw)
		if (!data || typeof data !== 'object' || Array.isArray(data))
			return undefined
		const imported = newProfile(
			newId(),
			data.label || 'Imported',
		) as unknown as Record<string, unknown>
		for (const k of PROFILE_KEYS) {
			if (k in data && (typeof data[k] !== 'object' || k === 'scheduleDays'))
				imported[k] = data[k]
		}
		imported.kind = 'custom'
		return imported as unknown as Profile
	} catch {
		return undefined
	}
}

/** The fields of a profile that are copied, as JSON. */
export function profileToJson(p: Profile): string {
	const out: Record<string, unknown> = {}
	for (const k of PROFILE_KEYS) out[k] = p[k]
	return JSON.stringify(out)
}

/** Removes a profile. Its presence is taken away from Discord first. At least one profile is kept. */
export function deleteProfile(id: string): Promise<boolean> {
	const latest = read()
	if (latest.profiles.length < 2) return Promise.resolve(false)
	clearProfile(runtimeOf(id))
	return commit(
		{ profiles: latest.profiles.filter(p => p.id !== id) },
		true,
	).then(() => {
		syncSoundCloud()
		return true
	})
}

/** Changes some SoundCloud settings, then re-reads the Last.fm settings and updates what is shown. */
export function setSoundCloud(
	patch: Partial<SoundCloudSettings>,
): Promise<void> {
	return saveSoundCloud(patch).then(() => {
		syncSoundCloud()
	})
}
