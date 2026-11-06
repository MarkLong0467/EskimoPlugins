import type { PostSettings } from './types'

/** The id of the toasts this plugin shows. */
export const TOAST_KEY = 'MARKLONG_REPO_POST'

/** How long after the plugin starts the first look happens, so Discord has finished opening (milliseconds). */
export const FIRST_CHECK_MS = 12_000

/** How often the plugin looks at the list (milliseconds). The list is a small file. */
export const CHECK_MS = 10 * 60_000

/** How long a post that already matches is trusted before Discord is asked again, in case it was edited by hand. */
export const RECHECK_MS = 6 * 3_600_000

/** How long to wait after a failed update before trying again on its own. */
export const BACKOFF_MS = 30 * 60_000

/** How long a request may take (milliseconds). */
export const TIMEOUT_MS = 20_000

/** The settings used until the user changes something. The ids are the "Mark's Repository" thread. */
export const DEFAULT_SETTINGS: PostSettings = {
	auto: true,
	postUrl:
		'https://raw.githubusercontent.com/MarkLong0467/EskimoPlugins/gh-pages/post.json',
	channelId: '1567899938896220160',
	messageId: '1567899938896220160',
	versions: true,
	limit: 'auto',
	syncedHash: '',
	syncedAt: 0,
	previousText: '',
}

/** Discord's message limits: everyone, and Nitro. */
export const LIMIT_NORMAL = 2000
export const LIMIT_NITRO = 4000

/** The longest descriptions tried, one after another, until the post fits. */
export const DESCRIPTION_STEPS = [90, 75, 62, 52, 44, 36, 28, 20, 12]

/** The Discord premium type that has the longer limit (Nitro; Nitro Basic and Classic do not). */
export const NITRO_PREMIUM_TYPE = 2
