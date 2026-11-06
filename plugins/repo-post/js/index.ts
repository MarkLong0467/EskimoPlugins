/**
 * Repo Post.
 *
 * Keeps the plugin list in your own repository thread post up to date. When you publish a plugin, `tools/publish.cjs`
 * writes `post.json` next to `index.json`; this plugin fetches it, makes the text of the post and edits the post if it
 * differs, whenever Discord is open.
 *
 * Only your own Discord can edit a message you wrote, which is why this is a plugin and not a bot or a GitHub Action.
 * The edit goes through Discord's own server connection, so the plugin never touches your login token, and it is only
 * sent if the message was written by the account that is logged in.
 *
 * How it is put together:
 * - `post.ts` makes the text from the list and fits it to the limit (pure, no Discord),
 * - `sync.ts` fetches the list, reads and edits the post, and looks now and then,
 * - `http.ts` and `discord.ts` find Discord's server connection, the user and the toasts,
 * - `Settings.tsx` is the settings screen (the preview comes first),
 * - `config.ts`, `constants.ts`, `types.ts` and `diag.ts` are helpers.
 */

import { clearListeners, setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { diag } from './diag'
import Settings from './Settings'
import { startSync } from './sync'
import type { PostSettings } from './types'

export default plugin<{ jsonStorage: PostSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		startSync(cleanup)
		diag.log('plugin', 'started')
		cleanup(() => clearListeners())
	},
})
