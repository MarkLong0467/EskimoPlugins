import { MATERIAL_DARK, MATERIAL_LIGHT } from '../defaults'
import { patch, watchModules } from './patch'

/**
 * Two synthetic rows in Discord's theme picker.
 *
 * The rows carry unique theme strings, so `getUserThemeIndex`'s find-by-theme
 * matches only our row and the highlight lands correctly with no patches to
 * `handleSaveTheme` or the index helper — this plugin never touches either.
 *
 * The rows go in twice over: into the constants array the picker's list is
 * spread from (in place, so a module that has not loaded yet picks them up),
 * and into the two list producers, for a base list already built. Both live
 * behind lazily required modules, so they are watched for rather than
 * expected at start-up.
 */

const STANDARD = 'standardBackgroundTheme'

let watches: (() => void)[] = []
let entries: any[] = []
let list: any[] | undefined
let mobileThemes: any
let originalUseAll: any
let originalGetAll: any
let useWrapper: any
let getAllWrapper: any
let rowsReady = false

function makeEntry(theme: string, label: string): any {
	return { type: STANDARD, theme, getName: () => label }
}

function hasRows(source: any[]): boolean {
	return source.some(item => item?.theme === MATERIAL_DARK)
}

/** Put our rows right after the standard `system` row, dark first. */
function withRows(source: any, copy: boolean): any {
	if (!Array.isArray(source)) return source
	const out = copy ? [...source] : source
	if (hasRows(out)) return out
	let index = -1
	for (let i = out.length - 1; i >= 0; i--) {
		if (out[i]?.type === STANDARD && out[i]?.theme === 'system') {
			index = i
			break
		}
	}
	if (index >= 0) out.splice(index + 1, 0, ...entries)
	else out.push(...entries)
	return out
}

/**
 * The list producers memoise on their input, so the same source array has to
 * keep yielding the same result or every render would look like a change.
 */
const listMemo = new WeakMap<any[], any[]>()

function wrapListProducer(
	original: ((...args: any[]) => any) | undefined,
): (...args: any[]) => any {
	return function wrapped(this: any, ...args: any[]) {
		const result = original?.apply(this, args)
		if (!Array.isArray(result)) return result
		const memo = listMemo.get(result)
		if (memo !== undefined) return memo
		const next = withRows(result, true)
		if (next !== result) listMemo.set(result, next)
		return next
	}
}

function markReady(): void {
	if (rowsReady) return
	rowsReady = true
	console.log('[materialcord] picker rows in')
}

/** Inject in place into the constants array the picker spreads from. */
function applyConstants(exports: any): void {
	const candidate = exports?.REDESIGN_STANDARD_BACKGROUND_THEMES
	if (!Array.isArray(candidate)) return
	list = withRows(candidate, false)
	if (hasRows(candidate)) markReady()
}

/** Wrap the two list producers on a base list that has already been built. */
function applyProducers(exports: any): void {
	if (exports == null || mobileThemes === exports) return
	mobileThemes = exports
	if (
		typeof exports.useAllMobileThemes === 'function' &&
		useWrapper === undefined
	) {
		originalUseAll = exports.useAllMobileThemes
		useWrapper = wrapListProducer(originalUseAll)
		if (!patch(exports, 'useAllMobileThemes', useWrapper)) {
			useWrapper = undefined
			originalUseAll = undefined
		}
	}
	if (
		typeof exports.getAllMobileThemes === 'function' &&
		getAllWrapper === undefined
	) {
		originalGetAll = exports.getAllMobileThemes
		getAllWrapper = wrapListProducer(originalGetAll)
		if (!patch(exports, 'getAllMobileThemes', getAllWrapper)) {
			getAllWrapper = undefined
			originalGetAll = undefined
		}
	}
	if (useWrapper !== undefined || getAllWrapper !== undefined) markReady()
}

export function installPicker(): boolean {
	if (watches.length > 0) return true
	entries = [
		makeEntry(MATERIAL_DARK, 'Material Dark'),
		makeEntry(MATERIAL_LIGHT, 'Material Light'),
	]

	const constantsWatch = watchModules(
		['REDESIGN_STANDARD_BACKGROUND_THEMES'],
		applyConstants,
		1,
	)
	const producersWatch = watchModules(
		['useAllMobileThemes', 'getAllMobileThemes'],
		applyProducers,
		1,
	)
	if (constantsWatch === undefined && producersWatch === undefined) {
		entries = []
		console.warn('[materialcord] theme picker rows unavailable')
		return false
	}
	if (constantsWatch !== undefined) watches.push(constantsWatch)
	if (producersWatch !== undefined) watches.push(producersWatch)
	return true
}

/** For the start-up log: rows in place, waiting on a module, or not watching. */
export function pickerStatus(): 'ready' | 'pending' | 'off' {
	if (watches.length === 0) return 'off'
	return rowsReady ? 'ready' : 'pending'
}

export function uninstallPicker(): void {
	for (const unwatch of watches) {
		try {
			unwatch()
		} catch {}
	}
	watches = []
	if (Array.isArray(list)) {
		for (const entry of entries) {
			const index = list.indexOf(entry)
			if (index >= 0) list.splice(index, 1)
		}
	}
	// Another plugin may have wrapped on top of us since, so only unwind while
	// our function is still the one in place.
	if (mobileThemes != null) {
		if (mobileThemes.useAllMobileThemes === useWrapper && originalUseAll) {
			mobileThemes.useAllMobileThemes = originalUseAll
		}
		if (mobileThemes.getAllMobileThemes === getAllWrapper && originalGetAll) {
			mobileThemes.getAllMobileThemes = originalGetAll
		}
	}
	entries = []
	list = undefined
	mobileThemes = undefined
	originalUseAll = undefined
	originalGetAll = undefined
	useWrapper = undefined
	getAllWrapper = undefined
	rowsReady = false
}
