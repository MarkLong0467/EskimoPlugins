/** The message the menu on screen is for, as noticed when the menu was drawn. */
export interface Target {
	channelId: string
	messageId: string
	/** When it was noticed, in milliseconds. */
	at: number
	/** Who wrote it, as far as the menu showed. */
	author: string
	/** The start of what it says. */
	preview: string
}

/** One reminder. */
export interface Reminder {
	id: string
	channelId: string
	messageId: string
	/** The server the channel is in, or `null` for a direct message. */
	guildId: string | null
	author: string
	preview: string
	/** When it is due, in milliseconds. */
	at: number
	/** When it was made, in milliseconds. */
	createdAt: number
	/** How many times it was snoozed. */
	snoozes: number
}

/** What the plugin saves. */
export interface ReminderSettings {
	/** Whether "Remind Me" is in the message menu. */
	menu: boolean
	/** Whether a sheet opens when a reminder is due (a toast is always shown). */
	sheet: boolean
	/** How many minutes "Snooze" adds. */
	snoozeMinutes: number
	reminders: Reminder[]
}

/** A time the picker offers. */
export interface Choice {
	label: string
	/** When it is, in milliseconds. */
	at: number
}

/** An item of Discord's message menu, as far as used here. */
export type MenuItem = Record<string, unknown> & { label?: unknown }
