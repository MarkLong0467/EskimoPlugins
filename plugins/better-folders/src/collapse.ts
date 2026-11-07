/**
 * Auto collapse: when a folder is opened, the other open folders are closed.
 *
 * Opening or closing a folder dispatches `TOGGLE_GUILD_FOLDER_EXPAND` with the folder's id. The plugin listens to it. When
 * the folder that was toggled is now open, it toggles every other open folder, which closes them.
 */

import { Dispatcher } from '@valenced/discord/common/flux'
import { diag } from './diag'
import { getFolders, isExpanded, storesReachable } from './folders'
import { state } from './state'
import { isOn } from './store'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The event's payload. */
interface ToggleEvent {
	folderId?: number | string
}

/**
 * Starts listening.
 *
 * @param cleanup Where to register what stops it.
 */
export function installAutoCollapse(cleanup: Cleanup): void {
	state.storesOk = storesReachable()
	const onToggle = (payload: unknown): void => {
		const { folderId: thisId } = payload as ToggleEvent
		try {
			state.toggles++
			if (!isOn('autoCollapse')) return
			if (thisId == null || !isExpanded(thisId)) return
			for (const { folderId } of getFolders()) {
				if (folderId == null || folderId === thisId || !isExpanded(folderId))
					continue
				Dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId })
				state.collapsed++
				state.last = 'closed another open folder'
			}
		} catch (error) {
			state.last = 'auto collapse failed'
			diag.fail('auto collapse', error)
		}
	}
	cleanup(
		diag.apply('auto collapse', () => {
			try {
				Dispatcher.subscribe('TOGGLE_GUILD_FOLDER_EXPAND', onToggle)
				state.dispatcher = 'subscribed'
			} catch (error) {
				state.dispatcher = 'failed'
				throw error
			}
			return () =>
				Dispatcher.unsubscribe('TOGGLE_GUILD_FOLDER_EXPAND', onToggle)
		}),
	)
}
