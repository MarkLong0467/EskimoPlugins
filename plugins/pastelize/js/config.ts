import { createStore } from '../../../shared/palmdevs/storage'

/** What the plugin saves. */
export interface PastelSettings {
	/** Whether names that already have a role colour get a pastel colour too. */
	everyone: boolean
	/** Whether a webhook's colour comes from the name it posts under (so each name has its own), not from the webhook's ID. */
	webhookName: boolean
	/** Whether mentions of people with no role colour are coloured too. */
	mentions: boolean
}

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: PastelSettings = {
	everyone: false,
	webhookName: true,
	mentions: true,
}

/** The plugin's settings. */
export const store = createStore<PastelSettings>(DEFAULT_SETTINGS)
