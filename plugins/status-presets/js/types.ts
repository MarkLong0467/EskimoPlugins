/** The plugin's settings, stored as JSON. See `DEFAULT_SETTINGS` in `constants.ts` for what each one does. */
export interface PresetSettings {
	/** The presets, as JSON text (a list of `Preset`). */
	presetsJson: string
	/** The status before the last preset was applied, as JSON text, so it can be undone. Empty if there is nothing to undo. */
	undoJson: string
	/** Show the presets under the status picker of the account sheet. */
	inSheet: boolean
	/** Show the presets on the "Set your status" screen. */
	inEditor: boolean
	/** Vibrate a little when a preset is applied. */
	buzz: boolean
}

/** The online statuses, plus `keep` for "leave my status as it is". */
export type StatusValue = 'keep' | 'online' | 'idle' | 'dnd' | 'invisible'

/** What a preset does to the custom status. */
export type CustomMode = 'keep' | 'set' | 'clear'

/** When the status goes back to normal. */
export type ClearAfter =
	| 'never'
	| '15m'
	| '30m'
	| '1h'
	| '2h'
	| '4h'
	| '8h'
	| 'midnight'

/** A saved preset: a status, and a custom status with an emoji and a time it ends. */
export interface Preset {
	id: string
	name: string
	/** An emoji as typed (😴), or a server emoji (`<:name:123456789012345678>`). */
	emoji: string
	/** The text of the custom status. */
	text: string
	status: StatusValue
	custom: CustomMode
	clearAfter: ClearAfter
}

/** The custom status in the form Discord keeps it. */
export interface CustomStatus {
	text: string
	emojiId: string
	emojiName: string
	expiresAtMs: string
	createdAtMs?: string
}

/** Your status right now, read from Discord's settings. */
export interface StatusNow {
	status: string
	/** When the status ends (milliseconds as text), or `0` for never. */
	expires: string
	custom: CustomStatus | null
}

/** What is saved so the last preset can be undone. */
export interface UndoRecord extends StatusNow {
	name: string
	at: number
}

/** One of Discord's proto settings: a value that can be read and written. */
export interface ProtoSetting {
	getSetting?(): unknown
	updateSetting?(value: unknown): unknown
}

/** The four settings that hold your status. */
export interface StatusSettings {
	StatusSetting: ProtoSetting
	StatusExpiresAtSetting: ProtoSetting
	StatusCreatedAtSetting: ProtoSetting
	CustomStatusSetting: ProtoSetting
}

/** A parsed emoji: a plain one has a name, a server emoji has an id as well. */
export interface ParsedEmoji {
	id: string | null
	name: string
	custom: boolean
}

/** A line of the log of recent actions. */
export interface LogEntry {
	at: number
	text: string
	ok: boolean
}

/** One line of the self-check. */
export interface Check {
	ok: boolean
	label: string
	detail?: string
}

/** One choice in a list of radio rows. */
export interface Choice {
	v: string
	l: string
	color?: string
	ms?: number
}

/** Which screen of the settings is shown. */
export type View = { name: 'list' } | { name: 'edit'; id: string }
