import {
	ALIAS_DARK,
	ALIAS_LIGHT,
	isMaterialTheme,
	MATERIAL_DARK,
	MATERIAL_LIGHT,
	modeForTheme,
	referenceFor,
} from '../defaults'
import { buildCatalog, catalogNames } from './catalog'
import {
	buildSemanticEntries,
	clearPaintCache,
	paintRaw,
	repaintActive,
} from './palette'
import { patch, watchModules } from './patch'
import { modeWrapCount, resolverStatus, selfTest } from './resolver'
import { getSettings } from './settings'
import {
	getDividerColors,
	getSemanticColors,
	getShadows,
	getTheme,
	getTokens,
	tokensSource,
} from './tokens'
import type { TokensSource } from './tokens'

/**
 * Kettu's recipe: register our two keys as real Discord themes.
 *
 * `materialcord-dark` / `materialcord-light` are cloned from the reference
 * theme into every table keyed by a theme value — semantic definitions,
 * shadows, dividers, the `Theme` alias the resolver validates against — and
 * `unsafe_rawColors` gains live getters that repaint under the same gate the
 * semantic map uses. Everything is remembered and unwound on stop.
 */

interface RawRecord {
	key: string
	descriptor: PropertyDescriptor | undefined
	target: any
	original: string
}

let installed = false
let catalogued = false
let entriesBuilt = 0
let builtSeed: string | undefined
let shadowDefs: any[] = []
let dividerTable: any
let themesMap: any
let rawRecords: RawRecord[] = []

/** The module namespace carrying `saveClientTheme` as a direct export. */
let userSettings: any
/** The object carrying `setShouldSyncAppearanceSettings` (the default export). */
let settingsHolder: any
let originalSave: any
let saveWrapper: any
/** Whether this plugin turned server sync off for the appearance settings. */
let weUnsynced = false
let syncToggleWarned = false

interface NativeWrap {
	mod: any
	original: any
	wrapped: any
}

let nativeWraps: NativeWrap[] = []
let nativeUpdate: ((theme: string) => void) | undefined
let converterWrap: NativeWrap | undefined
let themeListener: (() => void) | undefined
let watchHandles: (() => void)[] = []

function ensureCatalog(): boolean {
	if (catalogued) return true
	const tokens = getTokens()
	const table = getSemanticColors()
	if (!tokens || !table) return false
	buildCatalog(
		table,
		tokens.unsafe_rawColors,
		tokens.themes ? Object.values(tokens.themes) : undefined,
	)
	catalogued = catalogNames().length > 0
	return catalogued
}

/**
 * Explicit semantic maps for both keys, painted from the current seed.
 * Rebuilding on a seed change is what retints the app.
 */
export function rebuild(): boolean {
	const table = getSemanticColors()
	if (table == null) return false
	const seed = getSettings().seed
	if (builtSeed === seed && entriesBuilt > 0) return true

	clearPaintCache()
	const dark = buildSemanticEntries('dark', seed)
	const light = buildSemanticEntries('light', seed)
	for (const name of Object.keys(table)) {
		const def = table[name]
		if (def == null || typeof def !== 'object') continue
		const darkEntry = dark.get(name)
		if (darkEntry !== undefined) def[MATERIAL_DARK] = darkEntry
		const lightEntry = light.get(name)
		if (lightEntry !== undefined) def[MATERIAL_LIGHT] = lightEntry
	}
	entriesBuilt = dark.size + light.size
	builtSeed = seed
	return entriesBuilt > 0
}

function installRawGetters(rawColors: any): void {
	if (rawColors == null) return
	let keys: string[]
	try {
		keys = Object.keys(rawColors)
	} catch {
		return
	}
	for (const key of keys) {
		let descriptor: PropertyDescriptor | undefined
		let original: any
		try {
			descriptor = Object.getOwnPropertyDescriptor(rawColors, key)
			original = rawColors[key]
		} catch {
			continue
		}
		if (typeof original !== 'string') continue
		let value = original
		try {
			Object.defineProperty(rawColors, key, {
				configurable: true,
				enumerable: descriptor?.enumerable ?? true,
				get() {
					if (!repaintActive()) return value
					return paintRaw(
						key,
						value,
						modeForTheme(getTheme()),
						getSettings().seed,
					)
				},
				set(next) {
					value = next
				},
			})
			rawRecords.push({ key, descriptor, target: rawColors, original })
		} catch {}
	}
}

function restoreRawGetters(): void {
	for (const record of rawRecords) {
		try {
			if (record.descriptor != null) {
				Object.defineProperty(record.target, record.key, record.descriptor)
			} else {
				delete record.target[record.key]
			}
		} catch {}
	}
	rawRecords = []
}

/**
 * Toggle appearance sync. The action lives on the module's default export
 * (`saveClientTheme` sits on the namespace itself), so the holder is kept
 * beside the namespace rather than on it. Returns whether the call landed.
 */
function setShouldSync(value: boolean): boolean {
	const holder = settingsHolder ?? userSettings
	try {
		if (
			holder == null ||
			typeof holder.setShouldSyncAppearanceSettings !== 'function'
		) {
			throw new Error('no toggle')
		}
		holder.setShouldSyncAppearanceSettings(value)
		return true
	} catch {
		if (!syncToggleWarned) {
			syncToggleWarned = true
			console.log('[materialcord] sync toggle unavailable')
		}
		return false
	}
}

/**
 * Skip server sync while one of our keys is saved — Discord's servers do not
 * know them — and put sync back when the user returns to a stock theme.
 * Midnight keeps Discord's own unsynced behaviour: if we unsynced, we leave
 * it unsynced.
 */
function wrapSave(): void {
	if (userSettings == null || saveWrapper !== undefined) return
	if (typeof userSettings.saveClientTheme !== 'function') return
	originalSave = userSettings.saveClientTheme
	const call = originalSave
	saveWrapper = function (this: any, args: any) {
		const theme = typeof args?.theme === 'string' ? args.theme : undefined
		if (theme !== undefined) {
			if (isMaterialTheme(theme)) {
				if (setShouldSync(false)) weUnsynced = true
			} else if (weUnsynced && theme === 'midnight') {
				weUnsynced = false
			} else if (weUnsynced) {
				setShouldSync(true)
				weUnsynced = false
			}
		}
		return call.call(this, args)
	}
	if (!patch(userSettings, 'saveClientTheme', saveWrapper)) {
		saveWrapper = undefined
		originalSave = undefined
	} else {
		console.log('[materialcord] sync guard wrapped')
	}
}

/**
 * Discord's native updater validates its argument on the Java side: handing it
 * `materialcord-dark` throws `Invalid theme`. Every JS-side caller funnels
 * through a module exporting only `updateTheme` (the theme-updater module, and
 * the native module itself when it carries nothing else), so each such export
 * is wrapped to substitute the reference key. The user-settings creator also
 * exports `updateTheme`, but it is the server dispatch — sync is already off
 * for our keys — and it stays untouched.
 */
function adoptNativeUpdate(mod: any): void {
	if (mod == null || typeof mod.updateTheme !== 'function') return
	// The user-settings creator has an updateTheme of its own.
	if (
		typeof mod.saveClientTheme === 'function' ||
		typeof mod.setShouldSyncAppearanceSettings === 'function'
	) {
		return
	}
	const own = Object.keys(mod)
	const simple = own.every(
		key => key === 'updateTheme' || key === 'default' || key === '__esModule',
	)
	if (!simple) return
	if (nativeWraps.some(wrap => wrap.mod === mod)) return
	const original = mod.updateTheme
	const wrapped = function (this: any, theme: any) {
		const value =
			typeof theme === 'string' && isMaterialTheme(theme)
				? referenceFor(theme)
				: theme
		return original.call(this, value)
	}
	if (!patch(mod, 'updateTheme', wrapped)) return
	nativeWraps.push({ mod, original, wrapped })
	if (nativeWraps.length === 1) {
		console.log('[materialcord] native updater wrapped')
	}
	if (nativeUpdate === undefined) {
		nativeUpdate = wrapped
		if (isMaterialTheme(getTheme())) applyNative(referenceFor(getTheme()))
	}
}

/**
 * `convertStandardThemeToAnimatedTheme` maps any key it does not know to
 * `'light'`, so the appearance picker would paint our dark row with
 * `BG_BASE_PRIMARY` resolved for light. The exported converter is wrapped to
 * hand it our rows under the reference key — the input keeps its `type` and
 * `getName` — then the outputs are relabelled back to our key.
 */
function adoptThemeConverter(mod: any): void {
	if (mod == null || typeof mod.convertThemesToAnimatedThemes !== 'function') {
		return
	}
	if (converterWrap != null && converterWrap.mod === mod) return
	const original = mod.convertThemesToAnimatedThemes
	const wrapped = function (this: any, themes: any, dark: any, light: any) {
		if (!Array.isArray(themes)) {
			return original.call(this, themes, dark, light)
		}
		let touched = false
		const mapped = themes.map(entry => {
			if (
				entry != null &&
				typeof entry === 'object' &&
				typeof entry.theme === 'string' &&
				isMaterialTheme(entry.theme)
			) {
				touched = true
				return { ...entry, theme: referenceFor(entry.theme) }
			}
			return entry
		})
		if (!touched) return original.call(this, themes, dark, light)
		const out = original.call(this, mapped, dark, light)
		if (!Array.isArray(out)) return out
		for (let i = 0; i < out.length && i < themes.length; i++) {
			if (mapped[i] === themes[i]) continue
			const entry = out[i]
			if (entry != null && typeof entry === 'object') {
				out[i] = { ...entry, theme: themes[i].theme }
			}
		}
		return out
	}
	if (!patch(mod, 'convertThemesToAnimatedThemes', wrapped)) return
	converterWrap = { mod, original, wrapped }
	console.log('[materialcord] converter wrapped')
}

function applyNative(theme: string): void {
	if (nativeUpdate === undefined) return
	try {
		nativeUpdate(theme)
	} catch {}
}

function subscribeThemeStore(): void {
	try {
		const store: any = (valenced.discord as any).flux?.Stores?.ThemeStore
		if (typeof store?.addChangeListener !== 'function') return
		themeListener = () => {
			const theme = getTheme()
			if (isMaterialTheme(theme)) applyNative(referenceFor(theme))
		}
		store.addChangeListener(themeListener)
	} catch {}
}

function unsubscribeThemeStore(): void {
	if (themeListener === undefined) return
	try {
		const store: any = (valenced.discord as any).flux?.Stores?.ThemeStore
		store?.removeChangeListener?.(themeListener)
	} catch {}
	themeListener = undefined
}

function injectShadows(table: any): void {
	for (const name of Object.keys(table)) {
		const def = table[name]
		if (def == null || typeof def !== 'object') continue
		const dark = def.darker ?? def.dark
		const light = def.light ?? def.dark
		let touched = false
		if (dark != null && typeof dark === 'object') {
			def[MATERIAL_DARK] = dark
			touched = true
		}
		if (light != null && typeof light === 'object') {
			def[MATERIAL_LIGHT] = light
			touched = true
		}
		if (touched && !shadowDefs.includes(def)) shadowDefs.push(def)
	}
}

function registerShadows(): void {
	shadowDefs = []
	const table = getShadows()
	if (table != null) {
		injectShadows(table)
		return
	}
	// Not initialized yet: watch for the table and inject when it lands.
	const unwatch = watchModules(
		['Shadow'],
		mod => {
			if (shadowDefs.length > 0) return
			const candidate = mod?.Shadow
			if (candidate != null && typeof candidate === 'object') {
				injectShadows(candidate)
			}
		},
		4,
	)
	if (unwatch !== undefined) watchHandles.push(unwatch)
}

function injectDividers(table: any): void {
	const dark = table.darker ?? table.dark
	const light = table.light ?? table.dark
	if (typeof dark === 'string') table[MATERIAL_DARK] = dark
	if (typeof light === 'string') table[MATERIAL_LIGHT] = light
	console.log('[materialcord] dividers injected')
}

function registerDividers(): void {
	const table = getDividerColors()
	if (table != null) {
		dividerTable = table
		injectDividers(table)
		return
	}
	// FormDivider is lazily required: watch for its module and inject then.
	const unwatch = watchModules(
		['DIVIDER_COLORS'],
		mod => {
			if (dividerTable != null) return
			const candidate = mod?.DIVIDER_COLORS
			if (candidate != null && typeof candidate === 'object') {
				dividerTable = candidate
				injectDividers(candidate)
			}
		},
		1,
	)
	if (unwatch !== undefined) watchHandles.push(unwatch)
}

function registerAliases(): void {
	themesMap = getTokens()?.themes
	if (themesMap == null) return
	patch(themesMap, ALIAS_DARK, MATERIAL_DARK)
	patch(themesMap, ALIAS_LIGHT, MATERIAL_LIGHT)
}

/**
 * One of our keys is already active — keep the unknown key away from the
 * server. Runs at install and again whenever the settings module lands.
 */
function adoptBootState(): void {
	if (!isMaterialTheme(getTheme())) return
	// Quiet until the settings module has landed: the install-time probe runs
	// before the watcher can fire, and that is not a failure.
	if (settingsHolder == null && userSettings == null) return
	if (setShouldSync(false)) weUnsynced = true
}

export function installRegister(): boolean {
	if (installed) return true
	// The instead-patch is what reads these maps back — without it the raw
	// hex in an injected entry would never be resolved to a colour.
	if (resolverStatus() !== 'patched') return false
	const table = getSemanticColors()
	if (getTokens() == null || table == null) return false
	if (!ensureCatalog()) return false

	registerAliases()
	registerShadows()
	registerDividers()
	installRawGetters(getTokens()?.unsafe_rawColors)
	if (!rebuild()) {
		uninstallRegister()
		return false
	}

	// The sync guard and the native updater sit behind lazily required
	// modules, so they are watched for rather than expected at start-up.
	// `saveClientTheme` is a direct export; `setShouldSyncAppearanceSettings`
	// only rides on the default export, so it cannot be part of the filter.
	const settingsWatch = watchModules(
		['saveClientTheme'],
		mod => {
			if (typeof mod?.saveClientTheme !== 'function') return
			const holder =
				typeof mod.setShouldSyncAppearanceSettings === 'function'
					? mod
					: mod.default
			if (
				holder == null ||
				typeof holder.setShouldSyncAppearanceSettings !== 'function'
			) {
				console.log('[materialcord] settings module without sync toggle')
				return
			}
			userSettings = mod
			settingsHolder = holder
			wrapSave()
			adoptBootState()
		},
		3,
	)
	const nativeWatch = watchModules(['updateTheme'], adoptNativeUpdate, 32)
	const converterWatch = watchModules(
		['convertThemesToAnimatedThemes'],
		adoptThemeConverter,
		1,
	)
	if (settingsWatch !== undefined) watchHandles.push(settingsWatch)
	if (nativeWatch !== undefined) watchHandles.push(nativeWatch)
	if (converterWatch !== undefined) watchHandles.push(converterWatch)
	subscribeThemeStore()

	// Boot with one of our keys already active: hand native the reference.
	const current = getTheme()
	if (isMaterialTheme(current)) applyNative(referenceFor(current))
	adoptBootState()

	installed = true
	return true
}

export function uninstallRegister(): void {
	for (const unwatch of watchHandles) {
		try {
			unwatch()
		} catch {}
	}
	watchHandles = []
	const current = getTheme()

	// Leave Discord on the reference theme while our wrappers are still in
	// place: the save updates the store, persists locally, pushes sync back
	// on if we were the ones who turned it off, and native follows. When the
	// guard never landed, save through the raw action creator instead: a
	// disabled plugin must never boot against our key.
	if (isMaterialTheme(current)) {
		const reference = referenceFor(current)
		let restored = false
		if (saveWrapper != null) {
			try {
				saveWrapper.call(userSettings, { theme: reference })
				restored = true
			} catch {}
		}
		if (!restored) {
			try {
				const finders: any = valenced.modules.finders
				const [mod] = finders.lookupModule(
					finders.filters.withProps('saveClientTheme'),
					{ initialize: true, cached: false },
				)
				if (typeof mod?.saveClientTheme === 'function') {
					mod.saveClientTheme({ theme: reference })
					restored = true
				}
			} catch {}
			if (restored && weUnsynced) setShouldSync(true)
		}
		if (restored) {
			console.log(`[materialcord] restored ${reference}`)
		} else {
			console.log('[materialcord] theme restore failed')
		}
	}

	unsubscribeThemeStore()

	const table = getSemanticColors()
	if (table != null) {
		for (const name of Object.keys(table)) {
			const def = table[name]
			if (def == null || typeof def !== 'object') continue
			try {
				delete def[MATERIAL_DARK]
				delete def[MATERIAL_LIGHT]
			} catch {}
		}
	}
	for (const def of shadowDefs) {
		try {
			delete def[MATERIAL_DARK]
			delete def[MATERIAL_LIGHT]
		} catch {}
	}
	shadowDefs = []
	if (dividerTable != null) {
		try {
			delete dividerTable[MATERIAL_DARK]
			delete dividerTable[MATERIAL_LIGHT]
		} catch {}
		dividerTable = undefined
	}
	if (themesMap != null) {
		try {
			delete themesMap[ALIAS_DARK]
			delete themesMap[ALIAS_LIGHT]
		} catch {}
		themesMap = undefined
	}

	restoreRawGetters()

	if (saveWrapper != null && userSettings?.saveClientTheme === saveWrapper) {
		try {
			userSettings.saveClientTheme = originalSave
		} catch {}
	}
	for (const wrap of nativeWraps) {
		if (wrap.mod?.updateTheme === wrap.wrapped) {
			try {
				wrap.mod.updateTheme = wrap.original
			} catch {}
		}
	}
	nativeWraps = []
	if (
		converterWrap != null &&
		converterWrap.mod?.convertThemesToAnimatedThemes === converterWrap.wrapped
	) {
		try {
			converterWrap.mod.convertThemesToAnimatedThemes = converterWrap.original
		} catch {}
	}
	converterWrap = undefined
	userSettings = undefined
	settingsHolder = undefined
	saveWrapper = undefined
	originalSave = undefined
	weUnsynced = false
	syncToggleWarned = false
	nativeUpdate = undefined
	catalogued = false
	entriesBuilt = 0
	builtSeed = undefined
	installed = false
}

export interface RegisterDiagnostics {
	tokens: TokensSource
	resolver: 'patched' | 'unavailable'
	/** Definitions shipped in `SemanticColor`. */
	definitions: number
	/** Explicit entries injected under both keys. */
	entries: number
	/** Raw colours now behind repaint getters. */
	raws: number
	shadows: number
	dividers: number
	/** Appearance sync guard: has the save wrapper landed. */
	sync: 'wrapped' | 'found' | 'missing'
	/** Native updateTheme exports wrapped with reference mapping. */
	native: number
	/** isThemeDark/isThemeLight exports wrapped with our keys. */
	modes: number
	/** Appearance theme converter wrapped to paint our rows dark. */
	converter: boolean
	test: string
}

export function diagnostics(): RegisterDiagnostics {
	const table = getSemanticColors()
	let sync: 'wrapped' | 'found' | 'missing' = 'missing'
	if (userSettings != null) sync = saveWrapper != null ? 'wrapped' : 'found'
	return {
		tokens: tokensSource(),
		resolver: resolverStatus(),
		definitions: table != null ? Object.keys(table).length : 0,
		entries: entriesBuilt,
		raws: rawRecords.length,
		shadows: shadowDefs.length,
		dividers: dividerTable != null ? 1 : 0,
		sync,
		native: nativeWraps.length,
		modes: modeWrapCount(),
		converter: converterWrap != null,
		test: installed ? selfTest() : 'not registered',
	}
}
