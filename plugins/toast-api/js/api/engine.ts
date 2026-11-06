import { getSettings } from '../lib/settings'
import { getEntries, setEntries } from './store'
import type { ToastApiSettings, ToastEntry, ToastInput } from '../types'

let seq = 0
const timers = new Map<string, number>()

/**
 * A preview never enters the store, so its id only has to be one no live toast
 * uses. Fixed, so a sheet can build a new one every frame.
 */
export const PREVIEW_ID = 'preview'

function clearTimer(id: string): void {
	const handle = timers.get(id)
	if (handle !== undefined) {
		clearTimeout(handle)
		timers.delete(id)
	}
}

/**
 * Auto keys are numbered by `allocate`. `show()` counts up from the live
 * sequence; a preview passes one that always returns 0, so it cannot push the
 * ids of toasts that are about to be shown.
 */
function deriveKey(input: ToastInput, allocate: () => number): string {
	if (typeof input.key === 'string' && input.key.length > 0) return input.key
	if (typeof input.content === 'string') return `text:${input.content}`
	return `auto:${allocate()}`
}

function resolveDurationMs(
	input: ToastInput,
	s: ToastApiSettings = getSettings(),
): number {
	let base: number
	if (s.durationMode === 'override') base = s.overrideDurationMs
	else if (s.durationMode === 'default') base = s.defaultDurationMs
	else base = input.duration ?? s.defaultDurationMs
	if (s.minDurationMs > 0 && base < s.minDurationMs) base = s.minDurationMs
	if (s.maxDurationMs > 0 && base > s.maxDurationMs) base = s.maxDurationMs
	return Math.max(0, base)
}

function arm(entry: ToastEntry): void {
	clearTimer(entry.id)
	if (!(entry.durationMs > 0)) return
	const handle = setTimeout(() => {
		timers.delete(entry.id)
		closeId(entry.id)
	}, entry.durationMs)
	timers.set(entry.id, handle)
}

function removeAt(index: number): void {
	const current = getEntries()
	const entry = current[index]
	if (!entry) return
	clearTimer(entry.id)
	setEntries(current.filter((_, i) => i !== index))
	try {
		entry.onDismiss?.()
	} catch {
		// a broken callback must not break the store
	}
}

function closeId(id: string): void {
	const index = getEntries().findIndex(entry => entry.id === id)
	if (index >= 0) removeAt(index)
}

/**
 * Normalise a `ToastInput` into a `ToastEntry`: the key it dedupes on, the
 * `variant` / `position` defaults, and the duration the Timing settings resolve
 * to. It writes nothing — no store, no timer, no id — so `show()` and
 * `preview()` can share it.
 */
export function buildEntry(
	input: ToastInput,
	handle: { id: string; key: string },
): ToastEntry {
	const s = getSettings()
	return {
		...input,
		id: handle.id,
		key: handle.key,
		content: input.content,
		variant: input.variant ?? 'default',
		durationMs: resolveDurationMs(input, s),
		position: input.position ?? s.position,
		createdAt: Date.now(),
	}
}

/**
 * Show a toast. Returns its id, the handle for `update()` and `close()`.
 *
 * `key` only decides whether the toast duplicates one already on screen; it is
 * never the handle. A duplicate is dropped and the id of the toast already
 * showing comes back instead.
 */
export function show(input: ToastInput): string {
	const key = deriveKey(input, () => ++seq)
	const existing = getEntries().find(entry => entry.key === key)
	if (existing) return existing.id

	const entry = buildEntry(input, { id: `toast-${++seq}`, key })

	const next = [...getEntries(), entry]
	const cap = getSettings().maxVisible
	while (cap > 0 && next.length > cap) {
		const dropped = next.shift()
		if (dropped) clearTimer(dropped.id)
	}

	setEntries(next)
	arm(entry)
	return entry.id
}

/**
 * Build a toast without showing it: same normalisation as `show()`, but nothing
 * is committed — no store, no timer, no live id. Safe to call on every render.
 *
 * The entry carries `PREVIEW_ID`, which no live toast uses.
 */
export function preview(input: ToastInput): ToastEntry {
	return buildEntry(input, {
		id: PREVIEW_ID,
		// `++seq` never returns 0, so `auto:0` cannot collide with a real toast's
		// key or take an id from one.
		key: deriveKey(input, () => 0),
	})
}

/**
 * Merge a patch into an on-screen toast. Returns `false` when the id is unknown.
 *
 * The clock is left alone unless the patch carries its own `duration`, so an
 * update does not extend a toast that is already counting down.
 */
export function update(id: string, patch: Partial<ToastInput>): boolean {
	const current = getEntries()
	const index = current.findIndex(entry => entry.id === id)
	if (index < 0) return false
	const previous = current[index]
	const rearm = patch.duration !== undefined
	const merged: ToastEntry = {
		...previous,
		...patch,
		id: previous.id,
		key: previous.key,
		position: patch.position ?? previous.position,
		durationMs: rearm
			? resolveDurationMs({ ...previous, ...patch })
			: previous.durationMs,
	}
	const next = [...current]
	next[index] = merged
	setEntries(next)
	if (rearm) arm(merged)
	return true
}

/** Close one toast by id. Passing no id closes everything. */
export function close(id?: string): void {
	if (id == null) {
		closeAll()
		return
	}
	const index = getEntries().findIndex(entry => entry.id === id)
	if (index >= 0) removeAt(index)
}

export function closeAll(): void {
	const current = getEntries()
	for (const entry of current) clearTimer(entry.id)
	setEntries([])
	for (const entry of current) {
		try {
			entry.onDismiss?.()
		} catch {
			// ignore
		}
	}
}

/** Close the newest toast. Mirrors Discord's `popToast()`. */
export function pop(): void {
	const index = getEntries().length - 1
	if (index >= 0) removeAt(index)
}

export function list(): ToastEntry[] {
	return getEntries()
}

/** Drop every toast without firing `onDismiss`. Used when the plugin stops. */
export function clearAll(): void {
	for (const handle of timers.values()) clearTimeout(handle)
	timers.clear()
	setEntries([])
}
