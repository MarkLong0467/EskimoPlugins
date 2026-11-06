import {
	close,
	closeAll,
	list,
	pop,
	preview as previewEngine,
	show as showEngine,
	update,
} from './engine'
import { subscribeEntries } from './store'
import type { ToastEntry, ToastInput } from '../types'

/** A plain string is shorthand for `{ content }` on both entry points. */
function normalize(input: ToastInput | string): ToastInput {
	return typeof input === 'string' ? { content: input } : input
}

export interface ToastApi {
	/**
	 * Show a toast. Returns its id, the handle for `update()` and `close()`.
	 * A toast whose `key` (or string content) matches one already on screen is
	 * dropped and the id of the one already showing comes back instead.
	 */
	show(input: ToastInput | string): string
	/**
	 * Build a toast without showing it: the same normalisation `show()` runs
	 * — key, `variant` / `position` defaults, the duration the Timing settings
	 * resolve to — but nothing is committed: no store, no timer, no live id.
	 * Safe to call on every render.
	 *
	 * The result carries `id: 'preview'`, which no live toast uses.
	 */
	preview(input: ToastInput | string): ToastEntry
	/**
	 * Live-update an on-screen toast by id. The clock is left alone unless the
	 * patch carries its own `duration`.
	 */
	update(id: string, patch: Partial<ToastInput>): boolean
	/** Close one toast by id. With no id, closes everything. */
	close(id?: string): void
	closeAll(): void
	/** Close the newest toast. */
	pop(): void
	list(): ToastEntry[]
	subscribe(cb: () => void): () => void
}

export function showInput(input: ToastInput | string): string {
	return showEngine(normalize(input))
}

export function previewInput(input: ToastInput | string): ToastEntry {
	return previewEngine(normalize(input))
}

export const toasts: ToastApi = {
	show: showInput,
	preview: previewInput,
	update,
	close,
	closeAll,
	pop,
	list,
	subscribe: subscribeEntries,
}
