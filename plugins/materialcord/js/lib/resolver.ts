import { MATERIAL_DARK, MATERIAL_LIGHT, referenceFor } from '../defaults'
import { withAlpha } from './color'
import { repaintActive } from './palette'
import { patch, watchModules } from './patch'
import { getSemanticColors, getTheme, getTokens, isLightTheme } from './tokens'

type Resolver = (theme: string, semObj: any, ctx?: any) => any

let original: Resolver | undefined
let wrapper: Resolver | undefined
let active = false

/** A token's name from its marker, cached — the reverse scan runs once. */
const nameCache = new WeakMap<object, string>()

function tokenName(semObj: any): string | undefined {
	if (typeof semObj === 'string') return semObj
	if (semObj == null || typeof semObj !== 'object') return undefined
	const cached = nameCache.get(semObj)
	if (cached !== undefined) return cached.length === 0 ? undefined : cached
	const tokens = getTokens()
	if (!tokens) return undefined

	let name: string | undefined
	try {
		name = tokens.internal.getSemanticColorName?.(semObj)
	} catch {}
	if (typeof name !== 'string') {
		const colors = tokens.colors ?? {}
		for (const key of Object.keys(colors)) {
			if (colors[key] === semObj) {
				name = key
				break
			}
		}
	}
	if (typeof name !== 'string') {
		nameCache.set(semObj, '')
		return undefined
	}
	nameCache.set(semObj, name)
	return name
}

/**
 * The instead-patch: while one of our keys is active, hand back the explicit
 * map that `register` injected under that key — an already-painted hex, with
 * the entry's own opacity applied the way Discord's resolver applies it
 * (alpha set, not multiplied).
 *
 * Everything else falls through to the original: stock themes untouched;
 * our key with the master switch off resolves against its reference; missing
 * entries and gradient definitions resolve against the reference too, so
 * those stay Discord's own colours. The context's contrast and saturation
 * are Discord's post-resolve accessibility transforms — the original applies
 * them between resolving and setting alpha, so they are applied here the
 * same way, with Discord's own functions.
 */
function buildWrapper(resolve: Resolver): Resolver {
	return function (this: any, theme, semObj, ctx) {
		if (typeof theme !== 'string' || theme === '') {
			// convertStandardThemeToAnimatedTheme hands undefined keys here.
			return resolve.call(
				this,
				isLightTheme() ? 'light' : 'darker',
				semObj,
				ctx,
			)
		}
		if (theme !== MATERIAL_DARK && theme !== MATERIAL_LIGHT) {
			return resolve.call(this, theme, semObj, ctx)
		}
		if (!repaintActive(theme)) {
			return resolve.call(this, referenceFor(theme), semObj, ctx)
		}

		const name = tokenName(semObj)
		const def = name !== undefined ? getSemanticColors()?.[name] : undefined
		if (
			ctx != null &&
			def != null &&
			ctx.gradient != null &&
			'gradient' in def
		) {
			return resolve.call(this, referenceFor(theme), semObj, ctx)
		}
		const entry = def != null ? def[theme] : undefined
		if (
			entry != null &&
			typeof entry.raw === 'string' &&
			entry.raw.startsWith('#')
		) {
			let hex = entry.raw
			const category = def?.category
			try {
				const internal: any = getTokens()?.internal
				const saturation = ctx?.saturation
				if (
					typeof saturation === 'number' &&
					saturation < 1 &&
					typeof internal?.adjustColorSaturation === 'function'
				) {
					const next = internal.adjustColorSaturation(hex, saturation, category)
					if (typeof next === 'string') hex = next
				}
				const contrast = ctx?.contrast
				if (
					typeof contrast === 'number' &&
					contrast !== 1 &&
					typeof internal?.adjustColorContrast === 'function'
				) {
					const next = internal.adjustColorContrast(
						hex,
						contrast,
						category,
						referenceFor(theme),
					)
					if (typeof next === 'string') hex = next
				}
			} catch {}
			const opacity = entry.opacity
			if (typeof opacity === 'number' && opacity !== 1) {
				hex = withAlpha(hex.length > 7 ? hex.slice(0, 7) : hex, opacity)
			}
			return hex
		}
		return resolve.call(this, referenceFor(theme), semObj, ctx)
	}
}

interface ModeWrap {
	holder: any
	key: string
	original: any
	wrapped: any
}

const modeWraps: ModeWrap[] = []
let modeWatches: (() => void)[] = []

function wrapMode(holder: any, key: string): void {
	if (holder == null) return
	const fn = holder[key]
	if (typeof fn !== 'function' || fn.__materialcord === true) return
	if (modeWraps.some(w => w.holder === holder && w.key === key)) return
	const target = key === 'isThemeDark' ? MATERIAL_DARK : MATERIAL_LIGHT
	const wrapped: any = function (this: any, theme: any) {
		return theme === target || fn.call(this, theme)
	}
	wrapped.__materialcord = true
	if (patch(holder, key, wrapped)) {
		modeWraps.push({ holder, key, original: fn, wrapped })
		if (modeWraps.length === 1) {
			console.log('[materialcord] mode wrappers active')
		}
	}
}

/**
 * Dark/light detection for a key Discord has never heard of: every
 * `isThemeDark`/`isThemeLight` export answers for our own keys first, and
 * everything else goes to Discord's own function. The holder modules are
 * watched for, so a match that loads later still gets wrapped.
 */
function installModeWraps(): void {
	modeWatches = []
	for (const key of ['isThemeDark', 'isThemeLight']) {
		const unwatch = watchModules(
			[key],
			mod => {
				wrapMode(mod, key)
				wrapMode(mod?.default, key)
			},
			16,
		)
		if (unwatch !== undefined) modeWatches.push(unwatch)
	}
}

function uninstallModeWraps(): void {
	for (const unwatch of modeWatches) {
		try {
			unwatch()
		} catch {}
	}
	modeWatches = []
	for (const wrap of modeWraps) {
		if (wrap.holder?.[wrap.key] === wrap.wrapped) {
			try {
				wrap.holder[wrap.key] = wrap.original
			} catch {}
		}
	}
	modeWraps.length = 0
}

export function installResolver(): boolean {
	if (active) return true
	const tokens = getTokens()
	if (!tokens || typeof tokens.internal.resolveSemanticColor !== 'function') {
		return false
	}

	const next = buildWrapper(tokens.internal.resolveSemanticColor)
	// A wrapper a previous stop could not remove would otherwise be captured
	// as the call to pass through, stacking itself on every restart.
	if (tokens.internal.resolveSemanticColor !== wrapper) {
		original = tokens.internal.resolveSemanticColor
	}
	wrapper = next
	if (!patch(tokens.internal, 'resolveSemanticColor', next)) {
		original = undefined
		wrapper = undefined
		return false
	}
	installModeWraps()
	active = true
	return true
}

export function uninstallResolver(): void {
	active = false
	const tokens = getTokens()
	// Only unwind while our wrapper is still the one in place — another
	// plugin may have wrapped on top of us since.
	if (tokens && original && tokens.internal.resolveSemanticColor === wrapper) {
		tokens.internal.resolveSemanticColor = original
	}
	wrapper = undefined
	original = undefined
	uninstallModeWraps()
}

export function resolverStatus(): 'patched' | 'unavailable' {
	return active ? 'patched' : 'unavailable'
}

/** How many `isThemeDark`/`isThemeLight` exports are behind our wrapper. */
export function modeWrapCount(): number {
	return modeWraps.length
}

/** One real token, resolved live, to show what the wrapper actually returns. */
export function selfTest(): string {
	const tokens = getTokens()
	if (!tokens) return 'no token module'
	const colors = tokens.colors ?? {}
	const name =
		['TEXT_DEFAULT', 'ICON_DEFAULT', 'BACKGROUND_BASE_LOW'].find(
			key => colors[key] != null,
		) ?? Object.keys(colors)[0]
	const marker = name === undefined ? undefined : colors[name]
	if (marker == null) return 'no tokens'
	const theme = getTheme()
	// The context every themed style resolves with: gradient off, the
	// accessibility transforms at their defaults.
	const ctx = { gradient: null, contrast: 1, saturation: 1 }
	try {
		const hex = tokens.internal.resolveSemanticColor(theme, marker, ctx)
		if (typeof hex !== 'string') return 'no colour produced'
		if (!original) return `${name} ${hex}`
		let base: any
		try {
			base = original(theme, marker, ctx)
		} catch {
			base = undefined
		}
		if (typeof base === 'string' && base.toLowerCase() === hex.toLowerCase()) {
			return `${name} unchanged (${hex})`
		}
		return typeof base === 'string'
			? `${name} ${hex} (was ${base})`
			: `${name} ${hex}`
	} catch (error: any) {
		return `error: ${String(error?.message ?? error)}`
	}
}
