/** The statuses quiet hours can switch to. */
export type QuietStatus = 'dnd' | 'idle' | 'invisible'

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

/** A time of day, in minutes since midnight (0 to 1439). */
export type MinuteOfDay = number

/** A stretch of time in which quiet hours are on. */
export interface Window {
	/** When it starts, in milliseconds. */
	start: number
	/** When it ends, in milliseconds. */
	end: number
}

/** What was changed when quiet hours began, so it can be put back. */
export interface Applied {
	/** When the window being applied ends. */
	end: number
	/** When quiet hours were switched on. */
	at: number
	/** The status quiet hours set. */
	status: QuietStatus
	/** What you had before. */
	before: StatusNow
	/** Whether the custom status was changed too. */
	custom: boolean
}

/** What the plugin saves. */
export interface QuietSettings {
	/** Whether the schedule is on. */
	enabled: boolean
	/** Which days a window starts on: Sunday first, seven entries. */
	days: boolean[]
	/** When quiet hours start, in minutes since midnight. */
	from: MinuteOfDay
	/** When they end, in minutes since midnight. Earlier than `from` means the next morning. */
	to: MinuteOfDay
	/** The status to switch to. */
	status: QuietStatus
	/** Whether to set a custom status while quiet hours are on. */
	showCustom: boolean
	/** The text of that custom status. */
	customText: string
	/** The emoji of that custom status. */
	customEmoji: string
	/** Vibrate a little when quiet hours begin or end. */
	buzz: boolean
	/** The end of the window that was skipped (milliseconds), or 0. */
	skippedEnd: number
	/** What is applied right now, as JSON text, or an empty text if quiet hours are not on. */
	appliedJson: string
}
