import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { addLog, found } from './state'
import type {
	CustomStatus,
	ProtoSetting,
	StatusNow,
	StatusSettings,
} from './types'

/** The four settings, once found. */
let cachedSettings: StatusSettings | undefined

/** Forgets the settings that were found. Used when the plugin stops. */
export function forgetSettings(): void {
	cachedSettings = undefined
}

/**
 * The four settings from Discord's `UserSettings.tsx` that hold your status, found by their names (they may sit on
 * `.default`). They are `StatusSetting`, `StatusExpiresAtSetting`, `StatusCreatedAtSetting` and `CustomStatusSetting`.
 *
 * @returns The settings, or nothing if Discord has not loaded them.
 */
export function settingsModules(): StatusSettings | null {
	if (cachedSettings) return cachedSettings
	try {
		const module =
			(lookupModule(
				withProps('CustomStatusSetting', 'StatusSetting'),
			)[0] as unknown as Record<string, unknown> | undefined) || undefined
		const root = (module && (module.StatusSetting ? module : module.default)) as
			| Partial<StatusSettings>
			| undefined
		if (root?.StatusSetting && root.CustomStatusSetting) {
			cachedSettings = {
				StatusSetting: root.StatusSetting,
				StatusExpiresAtSetting: root.StatusExpiresAtSetting as ProtoSetting,
				StatusCreatedAtSetting: root.StatusCreatedAtSetting as ProtoSetting,
				CustomStatusSetting: root.CustomStatusSetting,
			}
			found.settings = 'found'
		}
	} catch {
		// Not loaded yet: it is looked for again next time.
	}
	return cachedSettings || null
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

/** The custom status as one line: its emoji (a plain one, or `:name:` for a server emoji) and its text. */
export const customLine = (custom: CustomStatus | null): string =>
	custom
		? `${custom.emojiName && !custom.emojiId ? `${custom.emojiName} ` : custom.emojiId ? `:${custom.emojiName}: ` : ''}${custom.text}`.trim() ||
			'Emoji only'
		: ''

/**
 * Calls one setting's `updateSetting`, the same function Discord's own screens call, so the result is saved and synced
 * like a status picked by hand. The save to Discord happens in the background, so it is not awaited; if Discord refuses
 * it, that is written to the log.
 */
export function write(
	setting: ProtoSetting | undefined,
	value: unknown,
	label: string,
): void {
	if (!setting || typeof setting.updateSetting !== 'function')
		throw new Error(`${label} cannot be changed here`)
	const result = setting.updateSetting(value) as
		| { catch?: (handler: (error: unknown) => void) => void }
		| undefined
	if (result && typeof result.catch === 'function') {
		result.catch(error =>
			addLog(
				`${label}: Discord refused (${(error as { message?: unknown } | undefined)?.message || error})`,
				false,
			),
		)
	}
}
