import type { JsonStorage } from '@valenced/json-storage'

/** Every feature has its own switch. All start on. */
export interface MediaSettings {
	/** Videos keep playing (with their sound) when Discord is left or the screen is locked. */
	backgroundVideo: boolean
	/** Audio files keep playing in the background. */
	backgroundAudio: boolean
	/** Voice messages keep playing in the background. */
	backgroundVoice: boolean
	/** A playing video goes to a floating Picture-in-Picture window when Discord is left. */
	pictureInPicture: boolean
	/** A video you leave while it plays carries on in a small player that stays while you move between chats. */
	crossChat: boolean
	/** Several videos and sounds can play at once while Discord is open. */
	simultaneous: boolean
	/** Play, pause and a seek bar in Android's notifications. */
	notification: boolean
}

export const defaults: MediaSettings = {
	backgroundVideo: true,
	backgroundAudio: true,
	backgroundVoice: true,
	pictureInPicture: true,
	crossChat: true,
	simultaneous: true,
	notification: true,
}

let storage: JsonStorage<MediaSettings> | undefined

export function setStorage(next: JsonStorage<MediaSettings> | undefined): void {
	storage = next
}

export function getStorage(): JsonStorage<MediaSettings> | undefined {
	return storage
}

/** A setting as saved, or its default. */
export function on(key: keyof MediaSettings): boolean {
	const saved = storage?.cache?.[key]
	return typeof saved === 'boolean' ? saved : defaults[key]
}

/** Every setting, saved or default. */
export function current(): MediaSettings {
	const out = { ...defaults }
	for (const key of Object.keys(defaults) as Array<keyof MediaSettings>) out[key] = on(key)
	return out
}
