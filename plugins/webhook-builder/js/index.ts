/**
 * Webhook Builder.
 *
 * Discohook inside Discord: make messages with embeds, link buttons and polls, send them with your webhooks, save them,
 * schedule them, and change or delete them after they are sent.
 *
 * How it is put together:
 * - `Settings.tsx` is the plugin's screen, with `ComposeTab`, `EmbedEditor`, `WebhooksTab` and `LibraryTab`,
 * - `menu.tsx` adds "Webhook Builder" to the menu of a held message,
 * - `actions.ts` does the work, `api.ts` talks to Discord, `payload.ts` turns messages into JSON and back,
 * - `state.ts` keeps and saves everything, `variables.ts` fills in `{date}` and the like, `time.ts` reads times.
 */

import { runDue } from './actions'
import { emptyState, SCHEDULE_TICK_MS } from './constants'
import { diag } from './diag'
import { toast } from './discord'
import { installMessageMenu } from './menu'
import Settings from './Settings'
import { forget, reload, setStorage, state } from './state'
import type { State } from './types'

export default plugin<{ jsonStorage: State }>({
	jsonStorage: { load: true, default: emptyState() },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorage(jsonStorage)
		reload()
		const s = state()
		diag.log(
			'plugin',
			`${s.webhooks.length} webhooks, ${s.saved.length} saved, ${s.scheduled.length} scheduled`,
		)

		diag.guard('message menu', () => installMessageMenu(cleanup))

		const tick = () => {
			runDue()
				.then(count => {
					if (count)
						toast(
							count === 1
								? 'Sent a scheduled message'
								: `Sent ${count} scheduled messages`,
						)
				})
				.catch(error => diag.fail('schedule', error))
		}
		// The first look waits a little, so Discord has started before anything is sent.
		const first = setTimeout(tick, 5000)
		const timer = setInterval(tick, SCHEDULE_TICK_MS)
		cleanup(() => {
			clearTimeout(first)
			clearInterval(timer)
			forget()
		})
	},
})
