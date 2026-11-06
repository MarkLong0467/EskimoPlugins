import { createStore } from '../../../shared/palmdevs/storage'

/** What the plugin saves. */
export interface LocaleSettings {
	/** The locale timestamps are shown in, such as `en-gb`. */
	locale: string
}

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: LocaleSettings = { locale: 'en-gb' }

/** The plugin's settings. */
export const store = createStore<LocaleSettings>(DEFAULT_SETTINGS)
