(function (exports) {
	/*
	 * Always Animate for Valenced
	 *
	 * Animates everything that can be animated. The idea comes from AlwaysAnimate for Vencord. The code is written from
	 * scratch for Valenced, using the decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354).
	 *
	 * What the decompiled app shows, and what this plugin does about it:
	 *
	 * 1. Pictures. `discord_app/utils/AvatarUtils.tsx` builds every avatar, banner, server icon and decoration address.
	 *    Each function is told whether the picture "canAnimate". When it is false Discord asks for a still picture,
	 *    even if the picture is animated. The plugin wraps those functions and says true.
	 * 2. Emoji, stickers and GIFs. `UserSettings.AnimateEmoji`, `AnimateStickers` and `GifAutoPlay` are the three
	 *    accessibility settings. The plugin makes them read "on".
	 * 3. Status emoji. `modules/activity_status/native/ActivityEmoji.tsx` animates only when its `emoji.animate` is true.
	 *    The plugin sets it.
	 * 4. Anything else with an `animate` or `canAnimate` property can be forced too (an option, off by default).
	 *
	 * The file reads top to bottom:  1 Settings  2 Counting  3 Pictures  4 Emoji, stickers, GIFs  5 Status emoji
	 *                                6 Everything else  7 Self-check  8 Settings screen  9 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '1.0.0'

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_ALWAYS_ANIMATE', { text: String(text) }) } catch (e) {}
	}
	/** Builds a React element with the JSX runtime, so the file needs no build step. */
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}
	/** The name of a React component, from the element that was just made. */
	function componentName(element) {
		const type = element && element.type
		if (!type || typeof type === 'string') return ''
		const inner = type.type || type.render || type
		return type.displayName || type.name || (inner && (inner.displayName || inner.name)) || ''
	}
	const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	/** Every switch, in the order the settings screen shows them. `on` is the default. */
	const FEATURES = [
		{ key: 'pictures', on: true, title: 'Pictures', blurb: 'Profile pictures, server profile pictures, banners, avatar decorations and server icons.' },
		{ key: 'emoji', on: true, title: 'Emoji', blurb: 'Animated emoji everywhere, as if "Animate emoji" were on.' },
		{ key: 'stickers', on: true, title: 'Stickers', blurb: 'Animated stickers, as if "Animate stickers" were on.' },
		{ key: 'gifs', on: true, title: 'GIFs', blurb: 'GIFs play by themselves, as if "Play GIFs automatically" were on.' },
		{ key: 'statusEmoji', on: true, title: 'Status emoji', blurb: 'The emoji of a custom status.' },
		{ key: 'everything', on: false, title: 'Everything else (advanced)', blurb: 'Switches on every `animate` or `canAnimate` property Discord gives its screens. This can animate things Discord keeps still on purpose.' },
	]
	const defaults = Object.fromEntries(FEATURES.map((f) => [f.key, f.on]))

	let storage
	let screenListeners = []
	const redrawSettings = () => screenListeners.slice().forEach((redraw) => { try { redraw() } catch (e) {} })

	function setting(key) {
		const saved = storage && storage.cache && storage.cache[key]
		return saved !== undefined ? saved : defaults[key]
	}
	function saveSettings(patch) {
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		redrawSettings()
	}

	// ---------------------------------------------------------------------------------------------------
	// 2. Counting, so the settings screen can say what really happened
	// ---------------------------------------------------------------------------------------------------
	const forced = Object.fromEntries(FEATURES.map((f) => [f.key, 0])) // how many times each feature changed something
	const found = {} // what was found in Discord: { pictures: 'AvatarUtils (2 holders, 19 functions)', ... }
	const problems = []
	function countForced(feature) {
		forced[feature] += 1
		if (forced[feature] <= 3 || forced[feature] % 50 === 0) redrawSettings()
	}
	function reportProblem(what, error) {
		const text = `${what}: ${String((error && error.message) || error).slice(0, 80)}`
		if (!problems.includes(text) && problems.length < 6) problems.push(text)
	}

	// ---------------------------------------------------------------------------------------------------
	// 3. Pictures: AvatarUtils
	// ---------------------------------------------------------------------------------------------------
	/**
	 * Where each AvatarUtils function takes its "may it animate" answer.
	 *   flag: a true/false at that argument position      options: an object with a `canAnimate` property at that position
	 */
	const PICTURE_FUNCTIONS = {
		// the user's picture: (user, canAnimate, size, png, webp) and its "source" form
		getUserAvatarURL: { flag: 1 },
		getUserAvatarSource: { flag: 1 },
		getGuildMemberAvatarURL: { flag: 1 },
		getGuildMemberAvatarSource: { flag: 2 },
		getAnimatableSourceWithFallback: { flag: 0 },
		// everything that takes an options object
		getGuildMemberAvatarURLSimple: { options: 0 },
		getUserBannerURL: { options: 0 },
		getGuildMemberBannerURL: { options: 0 },
		getAvatarDecorationURL: { options: 0 },
		getGuildIconURL: { options: 0 },
		getGuildIconSource: { options: 0 },
		getGuildBannerURL: { options: 0 },
		getGuildBannerSource: { options: 0 },
		getGuildSplashURL: { options: 0 },
		getGuildSplashSource: { options: 0 },
		getGuildHomeHeaderURL: { options: 0 },
		getGuildHomeHeaderSource: { options: 0 },
		getGuildDiscoverySplashURL: { options: 0 },
		getGuildDiscoverySplashSource: { options: 0 },
		getGuildTemplateIconURL: { options: 0 },
		getGuildTemplateIconSource: { options: 0 },
		getApplicationIconURL: { options: 0 },
		getApplicationIconSource: { options: 0 },
		getChannelIconURL: { options: 0 },
		getChannelIconSource: { options: 0 },
	}

	/** The arguments with "may animate" set to true. Returns the same array when nothing needs to change. */
	function withAnimationAllowed(args, where) {
		if (where.flag !== undefined) {
			if (args[where.flag] === true) return args
			const next = args.slice()
			next[where.flag] = true
			return next
		}
		const options = args[where.options]
		if (!isPlainObject(options) || options.canAnimate === true) return args
		const next = args.slice()
		next[where.options] = { ...options, canAnimate: true }
		return next
	}

	/** Wraps one function of a module so that `canAnimate` is true whenever the switch is on. */
	function allowAnimationIn(holder, name, where, cleanup) {
		const original = holder[name]
		if (typeof original !== 'function' || original.__alwaysAnimate) return false
		try {
			cleanup(valenced.patcher.instead(holder, name, function (args, callOriginal) {
				if (!setting('pictures')) return Reflect.apply(callOriginal, this, args)
				const next = withAnimationAllowed(args, where)
				if (next !== args) countForced('pictures')
				return Reflect.apply(callOriginal, this, next)
			}))
			try { holder[name].__alwaysAnimate = true } catch (e) {}
			return true
		} catch (e) {
			reportProblem(`could not wrap ${name}`, e) // for example a function that cannot be replaced
			return false
		}
	}

	/** AvatarUtils can be reached as the module itself and as its `default` object. Both get the same treatment. */
	function holdersOf(modules) {
		const holders = []
		modules.forEach((mod) => {
			;[mod, mod && mod.default].forEach((holder) => { if (holder && typeof holder === 'object' && !holders.includes(holder)) holders.push(holder) })
		})
		return holders
	}
	function allowPictureAnimations(cleanup) {
		const finders = valenced.modules.finders
		const modules = finders.lookupModule(finders.filters.withProps('getUserAvatarURL', 'getGuildIconURL'))
		const holders = holdersOf(modules)
		if (!holders.length) { found.pictures = 'not found'; return }
		let patched = 0
		holders.forEach((holder) => {
			Object.keys(PICTURE_FUNCTIONS).forEach((name) => { if (allowAnimationIn(holder, name, PICTURE_FUNCTIONS[name], cleanup)) patched += 1 })
		})
		found.pictures = `AvatarUtils (${holders.length} place${holders.length === 1 ? '' : 's'}, ${patched} functions)`
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Emoji, stickers and GIFs: three accessibility settings
	// ---------------------------------------------------------------------------------------------------
	/** `UserSettings.<name>` has `getSetting()` and `useSetting()`. Both are made to answer true while the switch is on. */
	const ACCESSIBILITY_SETTINGS = [
		{ name: 'AnimateEmoji', feature: 'emoji' },
		{ name: 'AnimateStickers', feature: 'stickers' },
		{ name: 'GifAutoPlay', feature: 'gifs' },
	]
	function allowAccessibilityAnimations(cleanup) {
		const finders = valenced.modules.finders
		const userSettings = finders.lookupModule(finders.filters.withProps('AnimateEmoji', 'AnimateStickers', 'GifAutoPlay'))[0]
		const root = userSettings && (userSettings.AnimateEmoji ? userSettings : userSettings.default)
		if (!root) { ACCESSIBILITY_SETTINGS.forEach((s) => { found[s.feature] = 'not found' }); return }
		ACCESSIBILITY_SETTINGS.forEach(({ name, feature }) => {
			const target = root[name]
			if (!target) { found[feature] = 'not found'; return }
			const methods = ['getSetting', 'useSetting'].filter((method) => typeof target[method] === 'function')
			methods.forEach((method) => {
				cleanup(valenced.patcher.after(target, method, (result) => {
					if (!setting(feature) || result === true) return result
					countForced(feature)
					return true
				}))
			})
			found[feature] = `UserSettings.${name} (${methods.join(', ')})`
		})
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. Status emoji and 6. everything else: elements as they are made
	// ---------------------------------------------------------------------------------------------------
	const ANIMATION_PROPS = ['animate', 'canAnimate', 'shouldAnimate']

	/** The status emoji only animates when its own `emoji.animate` is true. */
	function animateStatusEmoji(element) {
		const props = element.props
		if (componentName(element) !== 'ActivityEmoji' || !isPlainObject(props.emoji) || props.emoji.animate === true) return element
		countForced('statusEmoji')
		return valenced.react.React.cloneElement(element, { emoji: { ...props.emoji, animate: true } })
	}
	/** Any screen that was told not to animate is told to. */
	function animateEverything(element) {
		const props = element.props
		if (!isPlainObject(props) || typeof element.type === 'string') return element
		const switchedOff = ANIMATION_PROPS.filter((name) => props[name] === false)
		if (!switchedOff.length) return element
		countForced('everything')
		const patch = Object.fromEntries(switchedOff.map((name) => [name, true]))
		return valenced.react.React.cloneElement(element, patch)
	}

	function animateElements(cleanup) {
		const finders = valenced.modules.finders
		const runtime = finders.lookupModule(finders.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		const onNewElement = (element) => {
			if (!element || !element.props) return element
			let result = element
			if (setting('statusEmoji')) result = animateStatusEmoji(result)
			if (setting('everything')) result = animateEverything(result)
			return result
		}
		let hooked = 0
		;['jsx', 'jsxs'].forEach((name) => {
			if (runtime && typeof runtime[name] === 'function') { cleanup(valenced.patcher.after(runtime, name, onNewElement)); hooked += 1 }
		})
		found.statusEmoji = hooked ? 'every new screen element (ActivityEmoji)' : 'not found'
		found.everything = hooked ? 'every new screen element' : 'not found'
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. Self-check: asks Discord for a made-up animated picture and looks at the address it gives back
	// ---------------------------------------------------------------------------------------------------
	const FAKE_USER = { id: '123456789012345678', avatar: 'a_0123456789abcdef0123456789abcdef', discriminator: '0', username: 'check' }
	const FAKE_ICON = { id: '123456789012345678', icon: 'a_0123456789abcdef0123456789abcdef', size: 64, canAnimate: false }

	function addressOf(value) {
		if (typeof value === 'string') return value
		if (value && typeof value.uri === 'string') return value.uri
		if (Array.isArray(value)) return addressOf(value[0])
		return ''
	}
	/** @returns {{ label: string, ok: boolean, detail: string }[]} */
	function runSelfCheck() {
		const results = []
		const finders = valenced.modules.finders
		const utils = holdersOf(finders.lookupModule(finders.filters.withProps('getUserAvatarURL', 'getGuildIconURL')))[0]
		const check = (label, make) => {
			if (!utils) { results.push({ label, ok: false, detail: 'AvatarUtils was not found' }); return }
			try {
				const address = addressOf(make(utils))
				const animated = /\.gif(\?|$)|animated=true/.test(address)
				results.push({ label, ok: animated, detail: address ? address.replace(/^https?:\/\//, '').slice(0, 70) : 'no address came back' })
			} catch (e) { results.push({ label, ok: false, detail: `error: ${String((e && e.message) || e).slice(0, 60)}` }) }
		}
		check('A profile picture, asked for as "still"', (u) => u.getUserAvatarURL(FAKE_USER, false, 64))
		check('A server icon, asked for as "still"', (u) => u.getGuildIconURL({ ...FAKE_ICON }))
		results.push(...settingChecks())
		return results
	}
	function settingChecks() {
		const finders = valenced.modules.finders
		const mod = finders.lookupModule(finders.filters.withProps('AnimateEmoji', 'AnimateStickers', 'GifAutoPlay'))[0]
		const root = mod && (mod.AnimateEmoji ? mod : mod.default)
		return ACCESSIBILITY_SETTINGS.map(({ name, feature }) => {
			const label = `Setting "${name}" reads`
			if (!root || !root[name] || typeof root[name].getSetting !== 'function') return { label, ok: false, detail: 'not found' }
			try {
				const value = root[name].getSetting()
				return { label, ok: value === true || !setting(feature), detail: String(value) + (setting(feature) ? '' : ' (this switch is off)') }
			} catch (e) { return { label, ok: false, detail: `error: ${String((e && e.message) || e).slice(0, 60)}` } }
		})
	}

	function buildReport() {
		const lines = ['Always Animate report', `version: ${VERSION}`]
		FEATURES.forEach((f) => lines.push(`${f.key}: ${setting(f.key) ? 'on' : 'off'}; ${found[f.key] || 'not hooked'}; changed ${forced[f.key]} time(s)`))
		runSelfCheck().forEach((r) => lines.push(`check - ${r.label}: ${r.ok ? 'ok' : 'FAIL'} ${r.detail}`))
		if (problems.length) lines.push(`problems: ${problems.join(' | ')}`)
		return lines.join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	// ---------------------------------------------------------------------------------------------------
	// 8. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}
	function Pill({ text, color }) {
		const { View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(View, { style: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: `${color}33` } }, h(Text, { variant: 'text-xs/bold', style: { color } }, text))
	}
	const GREEN = '#23a55a'
	const RED = '#f23f43'
	const AMBER = '#f0b232'
	const GRAY = '#80848e'

	/** How a feature is doing: Off, Not found, Ready (hooked, nothing changed yet) or Working (changed something). */
	function featureState(feature) {
		if (!setting(feature)) return { text: 'Off', color: GRAY }
		if (!found[feature] || found[feature] === 'not found') return { text: 'Not found', color: RED }
		return forced[feature] > 0 ? { text: `Working · ${forced[feature]}`, color: GREEN } : { text: 'Ready', color: AMBER }
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()

		const [, setRedraws] = React.useState(0)
		const [checks, setChecks] = React.useState(null)
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const featureRow = (feature) => {
			const state = featureState(feature.key)
			return h(
				RN.View,
				{ key: feature.key, style: { gap: 6 } },
				h(Design.TableSwitchRow, { label: feature.title, subLabel: feature.blurb, value: !!setting(feature.key), onValueChange: (value) => saveSettings({ [feature.key]: !!value }) }),
				h(RN.View, { style: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 } },
					h(Pill, { text: state.text, color: state.color }),
					found[feature.key] && h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted', numberOfLines: 1, style: { flex: 1 } }, found[feature.key])),
			)
		}
		const onCount = FEATURES.filter((f) => setting(f.key)).length
		const working = FEATURES.filter((f) => setting(f.key) && forced[f.key] > 0).length

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				h(
					Card,
					null,
					h(Design.Text, { variant: 'heading-lg/bold' }, `Always Animate ${VERSION}`),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `${onCount} of ${FEATURES.length} switches are on, ${working} already changed something. Pictures that were already on screen stay still until Discord loads them again: scroll away and back, or restart Discord.`),
					h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Run the self-check', variant: 'primary', size: 'sm', onPress: () => setChecks(runSelfCheck()) })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport }))),
				),
				checks && h(
					Design.TableRowGroup,
					{ title: 'Self-check' },
					...checks.map((r, i) => h(Design.TableRow, { key: `check${i}`, label: `${r.ok ? '✓' : '✗'} ${r.label}`, subLabel: r.detail })),
					h(Design.TableRow, { key: 'checkNote', label: 'What this shows', subLabel: 'The plugin asks Discord for a made-up animated picture as "still". A ✓ means the address came back animated (.gif), so the plugin works.' }),
				),
				h(RN.View, { style: { gap: 4 } },
					h(Design.Text, { variant: 'text-sm/semibold', color: 'text-muted' }, 'WHAT ANIMATES'),
					h(Design.TableRowGroup, { title: '' }, ...FEATURES.slice(0, 5).map(featureRow))),
				h(Design.TableRowGroup, { title: 'Advanced' }, featureRow(FEATURES[5])),
				h(
					Design.TableRowGroup,
					{ title: 'Good to know' },
					h(Design.TableRow, { key: 'k1', label: 'Battery and data', subLabel: 'Animated pictures use more battery and more data than still ones. Turn off what you do not need.' }),
					h(Design.TableRow, { key: 'k2', label: 'Reduce Motion', subLabel: 'Your phone\'s Reduce Motion setting is not changed by this plugin.' }),
					problems.length > 0 && h(Design.TableRow, { key: 'problems', label: 'Problems', subLabel: problems.join(' · ') }),
				),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 9. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			storage = api.jsonStorage
			const attempt = (what, step) => { try { step() } catch (e) { reportProblem(what, e) } }
			attempt('pictures', () => allowPictureAnimations(api.cleanup))
			attempt('emoji, stickers and GIFs', () => allowAccessibilityAnimations(api.cleanup))
			attempt('status emoji', () => animateElements(api.cleanup))
			api.cleanup(() => { screenListeners = [] })
		},
	})
	return exports
})({})
