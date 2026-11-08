import type { AuditorSettings, Risk } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_PLUGIN_AUDITOR'

/** The id of the sheet that shows one plugin. */
export const PLUGIN_SHEET_KEY = 'marklong.plugin-auditor.plugin'

/** The id of the sheet that shows one place that plugins link to. */
export const HOST_SHEET_KEY = 'marklong.plugin-auditor.host'

/** This plugin's id, which it leaves out of its own scan unless asked. */
export const SELF_ID = 'marklong.plugin-auditor'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: AuditorSettings = {
	includeBuiltIn: false,
	includeSelf: false,
	autoScan: true,
	notify: true,
	hideNoise: true,
	vtKey: '',
	vtDomains: false,
	vtFast: false,
	whitelist: {},
	ignored: {},
	vtCache: {},
}

/** How long after the plugin starts the automatic scan runs, so Discord has finished opening (milliseconds). */
export const AUTO_SCAN_DELAY_MS = 9000

/** How long a VirusTotal answer is used before it is asked again (milliseconds). */
export const VT_CACHE_MS = 24 * 60 * 60 * 1000

/** The most VirusTotal answers kept. */
export const VT_CACHE_MAX = 120

/** The most domains looked up in one go. */
export const VT_DOMAINS_PER_RUN = 20

/** The colours of the risk levels. The soft colour is see-through, so it suits a dark or a light theme. */
export const RISK_COLOR: Record<Risk, { solid: string; soft: string }> = {
	critical: { solid: '#ED4245', soft: 'rgba(237,66,69,0.18)' },
	high: { solid: '#F0813C', soft: 'rgba(240,129,60,0.18)' },
	medium: { solid: '#E8B339', soft: 'rgba(232,179,57,0.18)' },
	low: { solid: '#5B9BF0', soft: 'rgba(91,155,240,0.18)' },
	clean: { solid: '#3BA55D', soft: 'rgba(59,165,93,0.18)' },
}

/** The colour of a link that is none of the above, and of grey text on a tinted background. */
export const NEUTRAL = {
	solid: '#8A8F98',
	soft: 'rgba(138,143,152,0.2)',
}

/** The raised surface behind cards, as see-through grey, so it looks right on a dark or a light theme. */
export const SURFACE = 'rgba(128,128,128,0.15)'
