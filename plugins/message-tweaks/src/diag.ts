import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { getStorage } from './lib/state'
import type { MessageTweaksStorage } from './types'

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The messages the plugin writes with its own `dbg` helper start with `[MESSAGE-TWEAKS]` and are copied into the log.
 */
export const diag = createDiagnostics('Message Tweaks', {
	// The hidden messages the plugin keeps are private, so only how many there are is reported.
	settings: () => {
		const cache = (getStorage()?.cache ?? {}) as Partial<MessageTweaksStorage>
		const { persisted, ...rest } = cache
		let hidden = 0
		for (const channel of Object.values(persisted?.hidden ?? {}))
			hidden += Object.keys(channel).length
		return { ...rest, hiddenMessages: hidden }
	},
	consolePrefixes: ['[MESSAGE-TWEAKS]'],
})
