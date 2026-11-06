import { AppState } from 'react-native'
import { daysSetting, saveSettings, setting, subscribe } from './config'
import { CHECK_MS, FIRST_CHECK_MS, VERIFY_DELAY_MS } from './constants'
import { diag } from './diag'
import { buzz, toast } from './discord'
import { isUsable, whenOf, windowAt } from './schedule'
import { parseEmoji, readNow, writeState } from './status'
import type { Applied, QuietStatus, StatusNow, Window } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** What the schedule is doing, for the settings screen. */
export type Mode =
	| { kind: 'off' }
	| { kind: 'invalid' }
	| { kind: 'on'; end: number; status: QuietStatus }
	| { kind: 'next'; window: Window }
	| { kind: 'skipped'; window: Window }

/** Who wants to know when the state changes. */
const listeners = new Set<() => void>()

/** Calls `fn` whenever quiet hours begin, end or are skipped. Returns what stops it. */
export function onChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

function changed(): void {
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}

/** Whether something read from storage looks like what was applied. */
function isApplied(value: unknown): value is Applied {
	const a = value as Partial<Applied> | null
	return (
		!!a &&
		typeof a.end === 'number' &&
		Number.isFinite(a.end) &&
		typeof a.status === 'string' &&
		!!a.before &&
		typeof a.before.status === 'string'
	)
}

/**
 * What quiet hours changed and have not yet put back, or nothing. The copy kept here is used so a change shows at once,
 * because saving is asynchronous.
 */
let appliedNow: Applied | null | undefined

/** What quiet hours are holding right now. */
export function applied(): Applied | null {
	if (appliedNow !== undefined) return appliedNow
	const raw = setting('appliedJson')
	let parsed: unknown = null
	try {
		parsed = raw ? JSON.parse(raw) : null
	} catch {
		parsed = null
	}
	appliedNow = isApplied(parsed) ? parsed : null
	return appliedNow
}

function setApplied(next: Applied | null): void {
	appliedNow = next
	saveSettings({ appliedJson: next ? JSON.stringify(next) : '' })
}

/** The schedule as it is set now. */
function schedule() {
	return {
		days: daysSetting(),
		from: Number(setting('from')),
		to: Number(setting('to')),
	}
}

/** What the schedule is doing at `now`. */
export function modeAt(now = Date.now()): Mode {
	const held = applied()
	if (held) return { kind: 'on', end: held.end, status: held.status }
	if (!setting('enabled')) return { kind: 'off' }
	const s = schedule()
	if (!isUsable(s.days, s.from, s.to)) return { kind: 'invalid' }
	const w = windowAt(now, s.days, s.from, s.to)
	if (!w) return { kind: 'invalid' }
	if (Number(setting('skippedEnd')) === w.window.end)
		return { kind: 'skipped', window: w.window }
	return { kind: 'next', window: w.window }
}

/** The custom status quiet hours set, in the form Discord keeps it. */
function quietCustom(end: number, now: number) {
	const emoji = parseEmoji(String(setting('customEmoji') || ''))
	return {
		text: String(setting('customText') || '').trim(),
		expiresAtMs: String(end),
		emojiId: emoji.id,
		emojiName: emoji.name,
		createdAtMs: String(now),
	}
}

/** Writes to Discord and notes a refusal that arrives later. */
function send(target: Parameters<typeof writeState>[0], now: number): void {
	writeState(target, now, text => diag.log('status', text, 'error'))
}

/** Checks a moment later that Discord's own settings show what was asked for, and says so in the log. */
function verifyLater(expected: string, what: string): void {
	setTimeout(() => {
		try {
			const now = readNow()
			const ok = now.status === expected
			diag.log(
				'status',
				ok
					? `${what}: confirmed`
					: `${what}: asked, but status is ${now.status}`,
				ok ? 'info' : 'warn',
			)
		} catch (error) {
			diag.fail('status', error)
		}
	}, VERIFY_DELAY_MS)
}

/** Switches to the quiet status for a window. */
function begin(window: Window, now: number): void {
	const status = setting('status') as QuietStatus
	const wantCustom =
		!!setting('showCustom') &&
		(String(setting('customText') || '').trim() !== '' ||
			String(setting('customEmoji') || '').trim() !== '')
	const before = readNow()
	try {
		send(
			{
				status,
				expires: String(window.end),
				custom: wantCustom ? quietCustom(window.end, now) : undefined,
			},
			now,
		)
	} catch (error) {
		diag.fail('begin', error)
		toast('Quiet hours could not change your status')
		return
	}
	setApplied({ end: window.end, at: now, status, before, custom: wantCustom })
	buzz()
	toast(`Quiet hours on until ${whenOf(window.end, now)}`)
	diag.log('begin', `${status} until ${whenOf(window.end, now)}`)
	verifyLater(status, 'Quiet hours')
	changed()
}

/** Puts back what quiet hours changed, unless you have changed it yourself since. */
function finish(held: Applied, reason: string): void {
	const now = Date.now()
	const current = readNow()
	// Discord itself may have ended the status already: its end time is the window's end, so it falls back to online.
	const ours = current.status === held.status || current.status === 'online'
	let restored = false
	if (ours) {
		const before: StatusNow = held.before
		const stillRunning = (ms: string | undefined) =>
			!ms || ms === '0' || Number(ms) > now
		// Ours ends with the night, so by now it may already be gone. One with other text was set by you: leave it.
		const ownCustom =
			held.custom &&
			(!current.custom ||
				current.custom.text.trim() ===
					String(setting('customText') || '').trim())
		const custom = !held.custom
			? undefined
			: !ownCustom
				? undefined
				: before.custom && stillRunning(before.custom.expiresAtMs)
					? {
							text: before.custom.text,
							expiresAtMs: before.custom.expiresAtMs || '0',
							emojiId: before.custom.emojiId || '0',
							emojiName: before.custom.emojiName,
							createdAtMs: String(now),
						}
					: null
		try {
			send(
				{
					status: before.status,
					expires: stillRunning(before.expires) ? before.expires : '0',
					custom,
				},
				now,
			)
			restored = true
		} catch (error) {
			diag.fail('finish', error)
		}
	} else {
		diag.log('finish', `left your status alone (it is ${current.status})`)
	}
	setApplied(null)
	if (restored) {
		buzz()
		toast(`Quiet hours ${reason}: back to ${held.before.status}`)
		diag.log('finish', `${reason}: back to ${held.before.status}`)
		verifyLater(held.before.status, 'Back to normal')
	} else {
		toast(`Quiet hours ${reason}`)
	}
	changed()
}

/**
 * Looks at the clock once: begins quiet hours if a window is on, ends them if the window is over, and follows changes of
 * the schedule. Your own changes to the status in between are left alone.
 */
export function tick(now = Date.now()): void {
	const held = applied()
	const s = schedule()
	const usable = isUsable(s.days, s.from, s.to)
	const w = usable ? windowAt(now, s.days, s.from, s.to) : null

	if (held) {
		if (now >= held.end) {
			finish(held, 'ended')
			return
		}
		if (!setting('enabled')) {
			finish(held, 'turned off')
			return
		}
		if (!w?.inside) {
			finish(held, 'changed')
			return
		}
		if (w.window.end !== held.end) {
			setApplied({ ...held, end: w.window.end })
			diag.log('retime', `now ends ${whenOf(w.window.end, now)}`)
			changed()
		}
		return
	}

	if (!setting('enabled') || !w?.inside) return
	if (Number(setting('skippedEnd')) === w.window.end) return
	begin(w.window, now)
}

/**
 * Skips the window that is on, or the next one. If quiet hours are on, they end now.
 *
 * @returns The end of the skipped window, or nothing if there was nothing to skip.
 */
export function skip(now = Date.now()): number | null {
	const held = applied()
	if (held) {
		saveSettings({ skippedEnd: held.end })
		diag.log('skip', `window ending ${whenOf(held.end, now)}`)
		finish(held, 'skipped')
		return held.end
	}
	const mode = modeAt(now)
	if (mode.kind !== 'next') return null
	saveSettings({ skippedEnd: mode.window.end })
	diag.log('skip', `window starting ${whenOf(mode.window.start, now)}`)
	toast(`Skipping ${whenOf(mode.window.start, now)}`)
	changed()
	return mode.window.end
}

/** Takes back a skip. If a window is on, quiet hours begin right away. */
export function unskip(now = Date.now()): void {
	saveSettings({ skippedEnd: 0 })
	diag.log('skip', 'taken back')
	changed()
	tick(now)
}

/**
 * Starts looking at the clock now and then.
 *
 * Valenced plugins cannot run while Discord is closed, so the look happens every few seconds while it is open, once soon
 * after it starts (which catches a window that began while it was closed), every time the app comes to the front, and
 * whenever a setting is saved.
 */
export function startEngine(cleanup: Cleanup): void {
	const look = () => {
		try {
			tick()
		} catch (error) {
			diag.fail('tick', error)
		}
	}
	const interval = setInterval(look, CHECK_MS)
	const first = setTimeout(look, FIRST_CHECK_MS)
	const subscription = AppState.addEventListener('change', state => {
		if (state === 'active') look()
	})
	// Saving is asynchronous, so the look waits a moment for the new setting to be there.
	const stopSettings = subscribe(() => {
		setTimeout(look, 400)
	})
	cleanup(() => {
		clearInterval(interval)
		clearTimeout(first)
		subscription?.remove?.()
		stopSettings()
		listeners.clear()
		appliedNow = undefined
	})
}

/** Forgets the copy held here, so it is read from the saved settings again. Used when the storage is handed over. */
export function reloadApplied(): void {
	appliedNow = undefined
}
