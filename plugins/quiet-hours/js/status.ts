import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type {
	CustomStatus,
	ProtoSetting,
	StatusNow,
	StatusSettings,
} from './types'

/**
 * Reading and writing your status. Discord keeps it as four "proto settings" in `UserSettings.tsx` (found by their
 * names, they may sit on `.default`):
 *
 *     StatusSetting            "online" | "idle" | "dnd" | "invisible"
 *     StatusExpiresAtSetting   milliseconds as text, "0" = never
 *     StatusCreatedAtSetting   milliseconds as text
 *     CustomStatusSetting      { text, emojiId, emojiName, expiresAtMs, createdAtMs } or undefined
 *
 * Discord's own screens call `.updateSetting(value)` on these, so this plugin calls the same functions and the result is
 * saved and synced like a status picked by hand.
 */

/** The four settings, once found. */
let cached: StatusSettings | undefined

/** Forgets the settings that were found. Used when the plugin stops. */
export function forgetSettings(): void {
	cached = undefined
}

/** Whether the settings have been found, for the report. */
export function found(): boolean {
	return cached !== undefined
}

/** The four settings, or nothing if Discord has not loaded them. */
export function settingsModules(): StatusSettings | null {
	if (cached) return cached
	try {
		const module = lookupModule(
			withProps('CustomStatusSetting', 'StatusSetting'),
		)[0] as unknown as Record<string, unknown> | undefined
		const root = (module && (module.StatusSetting ? module : module.default)) as
			| Partial<StatusSettings>
			| undefined
		if (root?.StatusSetting && root.CustomStatusSetting) {
			cached = {
				StatusSetting: root.StatusSetting,
				StatusExpiresAtSetting: root.StatusExpiresAtSetting as ProtoSetting,
				StatusCreatedAtSetting: root.StatusCreatedAtSetting as ProtoSetting,
				CustomStatusSetting: root.CustomStatusSetting,
			}
		}
	} catch {
		// Not loaded yet: it is looked for again next time.
	}
	return cached ?? null
}

/** Reads one setting, or nothing if it cannot be read. */
function readSetting(setting: ProtoSetting | undefined): unknown {
	try {
		return setting && typeof setting.getSetting === 'function'
			? setting.getSetting()
			: undefined
	} catch {
		return undefined
	}
}

/**
 * Your status right now: the status, when it ends, and the custom status.
 * An end time or custom status that is already over is left out.
 */
export function readNow(): StatusNow {
	const s = settingsModules()
	let status = (s && readSetting(s.StatusSetting)) as string | undefined
	if (typeof status !== 'string' || !status) {
		try {
			status = (
				Stores as unknown as { SelfPresenceStore: { getStatus(): string } }
			).SelfPresenceStore.getStatus()
		} catch {
			status = 'online'
		}
	}
	const expiresRaw = s && readSetting(s.StatusExpiresAtSetting)
	const expires =
		expiresRaw && expiresRaw !== '0' && Number(expiresRaw) > Date.now()
			? String(expiresRaw)
			: '0'

	const raw = (s && readSetting(s.CustomStatusSetting)) as
		| Partial<Record<keyof CustomStatus, string | number>>
		| undefined
	let custom: CustomStatus | null = null
	if (raw && typeof raw === 'object' && (raw.text || raw.emojiName)) {
		const end =
			raw.expiresAtMs && raw.expiresAtMs !== '0' ? Number(raw.expiresAtMs) : 0
		if (!end || end > Date.now()) {
			custom = {
				text: String(raw.text || ''),
				emojiName: String(raw.emojiName || ''),
				emojiId: raw.emojiId && raw.emojiId !== '0' ? String(raw.emojiId) : '',
				expiresAtMs: end ? String(end) : '0',
			}
		}
	}
	return { status: status as string, expires, custom }
}

/** Calls one setting's `updateSetting`. A refusal that arrives later is passed to `onError`. */
function write(
	setting: ProtoSetting | undefined,
	value: unknown,
	label: string,
	onError: (text: string) => void,
): void {
	if (!setting || typeof setting.updateSetting !== 'function')
		throw new Error(`${label} cannot be changed here`)
	const result = setting.updateSetting(value) as
		| { catch?: (handler: (error: unknown) => void) => void }
		| undefined
	if (result && typeof result.catch === 'function') {
		result.catch(error =>
			onError(
				`${label}: Discord refused (${(error as { message?: unknown } | undefined)?.message || error})`,
			),
		)
	}
}

/** What to write: the status and when it ends, and the custom status (`undefined` leaves it, `null` removes it). */
export interface Target {
	status: string
	/** When the status ends (milliseconds as text), or `0` for never. */
	expires: string
	custom: CustomStatus | null | undefined
}

/**
 * Writes the status, when it ends, when it started, and the custom status.
 *
 * @throws If Discord's status settings were not found.
 */
export function writeState(
	{ status, expires, custom }: Target,
	now: number,
	onError: (text: string) => void,
): void {
	const s = settingsModules()
	if (!s) throw new Error('Status settings not found')
	write(s.StatusSetting, status, 'Status', onError)
	write(
		s.StatusExpiresAtSetting,
		status === 'online' ? '0' : expires || '0',
		'Status end time',
		onError,
	)
	write(s.StatusCreatedAtSetting, String(now), 'Status start time', onError)
	if (custom === null)
		write(s.CustomStatusSetting, undefined, 'Custom status', onError)
	else if (custom)
		write(s.CustomStatusSetting, custom, 'Custom status', onError)
}

/** A plain emoji or a server emoji (`<:name:123456789012345678>`) as the parts Discord keeps. */
export function parseEmoji(text: string): { id: string; name: string } {
	const trimmed = text.trim()
	const match = /^<a?:([A-Za-z0-9_]{2,32}):(\d{15,25})>$/.exec(trimmed)
	if (match) return { id: match[2] as string, name: match[1] as string }
	return { id: '0', name: trimmed }
}
