(function (exports) {
	/*
	 * RTL Chat for Valenced.
	 * Reads Discord from right to left, in English:
	 *   Right to left (default): asks the phone to lay the app out right to left, exactly as Discord looks in
	 *     Arabic: profile pictures on the right, text lined up on the right. Discord draws its messages
	 *     natively, so this is the only way to move them. It applies after a restart of Discord.
	 *   Mirror everything: the whole app is flipped sideways (optionally with readable letters).
	 *   Off: normal.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var defaults = { mode: 'rtl', readable: true, forced: false }
	var storage
	var listeners = []
	var hooked = { how: 'not hooked yet', keys: [], fired: '', direction: '', image: false, input: false }
	var FLIP = [{ scaleX: -1 }]

	function setting(key) {
		var s = storage && storage.cache
		var value = s && s[key] !== undefined ? s[key] : defaults[key]
		return key === 'mode' && value === 'align' ? 'rtl' : value // an earlier version called it 'align'
	}
	function changed() { listeners.slice().forEach(function (l) { try { l() } catch (e) {} }) }
	function h(type, props) {
		var children = Array.prototype.slice.call(arguments, 2)
		var rt = valenced.react.ReactJSXRuntime
		var p = Object.assign({}, props)
		var key = p.key
		delete p.key
		if (children.length === 1) p.children = children[0]
		else if (children.length > 1) p.children = children
		return (children.length > 1 ? rt.jsxs : rt.jsx)(type, p, key)
	}
	function mirrored() { return setting('mode') === 'mirror' }

	// ======================================================================================
	// Right to left: the phone lays everything out right to left, like an Arabic device
	// ======================================================================================
	function i18n() {
		var m = valenced.react.ReactNative.I18nManager
		return m && typeof m.forceRTL === 'function' ? m : null
	}
	/** Whether the app is laid out right to left right now (decided when Discord started). */
	function isRtlNow() {
		var m = i18n()
		return !!(m && m.isRTL)
	}
	function applyDirection(mode) {
		var m = i18n()
		if (!m) return 'This phone does not let apps change the layout direction'
		var want = (mode || setting('mode')) === 'rtl'
		try {
			if (want) {
				if (typeof m.allowRTL === 'function') m.allowRTL(true)
				m.forceRTL(true)
				if (storage && !setting('forced')) storage.set({ forced: true })
			} else if (setting('forced')) {
				// Right to left was turned on by this plugin earlier: give the phone its normal direction back.
				m.forceRTL(false)
				if (storage) storage.set({ forced: false })
			}
		} catch (e) {
			return 'Could not change the layout direction: ' + String((e && e.message) || e).slice(0, 80)
		}
		return ''
	}
	function restartApp() {
		try {
			var mod = valenced.discord.native && valenced.discord.native.BundleUpdaterManager
			if (mod && typeof mod.reload === 'function') return mod.reload()
		} catch (e) {}
		try {
			var RN = valenced.react.ReactNative
			var dev = RN.NativeModules && RN.NativeModules.DevSettings
			if (dev && typeof dev.reload === 'function') return dev.reload()
		} catch (e) {}
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_RTL', { text: 'Close Discord completely and open it again' }) } catch (e) {}
	}

	// ======================================================================================
	// Mirror everything: the whole app is flipped
	// ======================================================================================
	function mayWrap(name) {
		if (hooked.fired && hooked.fired !== name) return false
		hooked.fired = name
		return true
	}

	function Mirror(props) {
		var React = valenced.react.React
		var RN = valenced.react.ReactNative
		var tick = React.useState(0)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])
		return h(RN.View, { style: { flex: 1, transform: mirrored() ? FLIP : [] } }, props.children)
	}

	var undo = []
	function wrapRegistry() {
		var registry = valenced.react.ReactNative.AppRegistry
		if (!registry || typeof registry.getAppKeys !== 'function' || typeof registry.getRunnable !== 'function' || typeof registry.registerComponent !== 'function') return false
		var done = []
		;(registry.getAppKeys() || []).forEach(function (key) {
			var runnable = registry.getRunnable(key)
			var provider = runnable && runnable.componentProvider
			if (typeof provider !== 'function') return
			var section = runnable.section
			registry.registerComponent(key, function () {
				var Inner = provider()
				return function RtlRoot(rootProps) { return h(Mirror, {}, h(Inner, rootProps)) }
			}, section)
			undo.push(function () { registry.registerComponent(key, provider, section) })
			done.push(key)
		})
		hooked.keys = done
		return done.length > 0
	}

	var wrapped = new Map()
	function wrapRoot(Root) {
		if (typeof Root !== 'function' && !(Root && typeof Root === 'object')) return Root
		if (wrapped.has(Root)) return wrapped.get(Root)
		var Wrapped = function RtlRoot(rootProps) { return h(Mirror, {}, h(Root, rootProps)) }
		wrapped.set(Root, Wrapped)
		return Wrapped
	}
	function wrapRenderApplication(cleanup) {
		var f = valenced.modules.finders
		var found = f.lookupModule(f.filters.withName('renderApplication'))[0]
		if (!found || typeof found.default !== 'function') return false
		cleanup(valenced.patcher.instead(found, 'default', function (args, original) {
			var next = args.slice()
			try { next[0] = wrapRoot(args[0]) } catch (e) {}
			return Reflect.apply(original, this, next)
		}))
		return true
	}
	function wrapRootElement(cleanup) {
		var f = valenced.modules.finders
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		var React = valenced.react.React
		var guard = false
		function wrapIfRoot(el) {
			if (guard || !el || typeof el !== 'object' || !el.props || el.props.rootTag === undefined || !('initialProps' in el.props) || !mayWrap('root element')) return el
			guard = true
			try { return h(Mirror, {}, el) } finally { guard = false }
		}
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, wrapIfRoot))
		})
		if (React && typeof React.createElement === 'function') cleanup(valenced.patcher.after(React, 'createElement', wrapIfRoot))
		return true
	}
	function wrapNavigation(cleanup) {
		var nav = valenced.externals.ReactNavigation && valenced.externals.ReactNavigation.ReactNavigationNative
		var Container = nav && nav.NavigationContainer
		if (!Container || typeof Container.render !== 'function') return false
		cleanup(valenced.patcher.instead(Container, 'render', function (args, original) {
			var ret = Reflect.apply(original, this, args)
			try { return mayWrap('navigation') ? h(Mirror, {}, ret) : ret } catch (e) { return ret }
		}))
		return true
	}
	function wrapContainer(cleanup) {
		var f = valenced.modules.finders
		var found = f.lookupModule(f.filters.withName('AppContainer'))[0]
		var cls = typeof found === 'function' ? found : found && found.default
		if (!cls || !cls.prototype || typeof cls.prototype.render !== 'function') return false
		cleanup(valenced.patcher.instead(cls.prototype, 'render', function (args, original) {
			var ret = Reflect.apply(original, this, args)
			try { return mayWrap('app container') ? h(Mirror, {}, ret) : ret } catch (e) { return ret }
		}))
		return true
	}

	/** In the mirrored app, turns letters and pictures back the right way round (the "readable" option). */
	function counterFlip(Component, isText, cleanup) {
		var RN = valenced.react.ReactNative
		var React = valenced.react.React
		if (!Component || typeof Component.render !== 'function') return false
		cleanup(
			valenced.patcher.instead(Component, 'render', function (args, original) {
				var el = Reflect.apply(original, this, args)
				try {
					if (!mirrored() || !setting('readable') || !el || !el.props) return el
					var flat = RN.StyleSheet.flatten(el.props.style) || {}
					var transform = Array.isArray(flat.transform) ? flat.transform : []
					var extra = { transform: FLIP.concat(transform) }
					if (isText && (flat.textAlign === undefined || flat.textAlign === 'auto' || flat.textAlign === 'left')) extra.textAlign = 'right'
					return React.cloneElement(el, { style: [flat, extra] })
				} catch (e) {
					return el
				}
			}),
		)
		return true
	}

	function registryInfo() {
		try {
			var registry = valenced.react.ReactNative.AppRegistry
			var keys = typeof registry.getAppKeys === 'function' ? registry.getAppKeys() || [] : []
			return keys.map(function (key) {
				var r = typeof registry.getRunnable === 'function' ? registry.getRunnable(key) : undefined
				return key + ' (' + (typeof r === 'function' ? 'function' : r && typeof r === 'object' ? Object.keys(r).join('/') : String(typeof r)) + ')'
			}).join(', ') || 'no apps listed'
		} catch (e) {
			return 'could not read'
		}
	}

	// ======================================================================================
	// Settings
	// ======================================================================================
	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var settings = Object.assign({}, defaults, json.use())
		function put(key, value) {
			var patch = {}
			patch[key] = value
			json.set(patch)
			setTimeout(changed, 50)
		}
		function toggle(key, label, subLabel) {
			return h(Design.TableSwitchRow, { key: key, label: label, subLabel: subLabel, value: !!settings[key], onValueChange: function (v) { put(key, v) } })
		}
		var mode = settings.mode === 'align' ? 'rtl' : settings.mode
		var now = isRtlNow()
		var wantRtl = mode === 'rtl'
		var pending = wantRtl !== now
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRadioGroup,
					{ title: 'Style', value: mode, onChange: function (v) { put('mode', v); hooked.direction = applyDirection(v) } },
					[
						{ value: 'rtl', label: 'Right to left (like Arabic)', subLabel: 'Profile pictures on the right and text lined up on the right, the way Discord looks in Arabic, but in English. Needs a restart of Discord' },
						{ value: 'mirror', label: 'Mirror everything', subLabel: 'The whole app is flipped sideways, like a mirror' },
						{ value: 'off', label: 'Off', subLabel: 'Normal left to right' },
					].map(function (r) { return h(Design.TableRadioRow, { key: r.value, label: r.label, subLabel: r.subLabel, value: r.value }) }),
				),
				pending
					? h(
							Design.TableRowGroup,
							{ title: 'Restart needed' },
							h(Design.TableRow, { key: 'pending', label: wantRtl ? 'Right to left is set, but not on yet' : 'Normal direction is set, but right to left is still on', subLabel: 'Discord decides the layout direction when it starts. Restart it to apply.' }),
							h(Design.TableRow, { key: 'restart', label: 'Restart Discord now', subLabel: 'Closes and reopens the app', onPress: restartApp }),
					  )
					: null,
				mode === 'mirror'
					? h(
							Design.TableRowGroup,
							{ title: 'Mirror everything' },
							h(Design.TableSwitchRow, { key: 'readable', label: 'Readable text and pictures', subLabel: 'Letters and pictures face the normal way. Off is a true mirror, letters reversed. Messages are drawn by Discord itself, so their letters stay mirrored either way', value: !!settings.readable, onValueChange: function (v) { put('readable', v) } }),
					  )
					: null,
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'dir', label: 'Layout direction right now', subLabel: now ? 'Right to left' : 'Left to right' }),
					hooked.direction ? h(Design.TableRow, { key: 'dirError', label: 'Problem', subLabel: hooked.direction }) : null,
					mode === 'mirror' ? h(Design.TableRow, { key: 'hook', label: 'Mirror hooked into', subLabel: hooked.how + (hooked.fired ? ' · flipped through ' + hooked.fired : '') }) : null,
					mode === 'mirror' ? h(Design.TableRow, { key: 'registry', label: 'Apps Discord registered', subLabel: hooked.registry || 'unknown' }) : null,
					h(Design.TableRow, { key: 'note', label: 'Before you uninstall', subLabel: 'Set the style to Off first and restart Discord, or the phone can stay right to left.' }),
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			storage = api.jsonStorage
			var RN = valenced.react.ReactNative
			function attempt(label, step) { try { step() } catch (e) { hooked[label] = 'failed: ' + String((e && e.message) || e).slice(0, 60) } }

			hooked.direction = applyDirection()

			// Mirror everything: its hooks are always installed, and only flip anything when that style is chosen.
			var tried = []
			;[
				['the app root', function () { return wrapRegistry() && 'the app root (' + hooked.keys.join(', ') + ')' }],
				['renderApplication', function () { return wrapRenderApplication(cleanup) && 'React Native\'s renderApplication' }],
			].forEach(function (step) {
				if (hooked.how && hooked.how !== 'not hooked yet') return
				try {
					var result = step[1]()
					if (result) hooked.how = result
					else tried.push(step[0] + ': not found')
				} catch (e) {
					tried.push(step[0] + ': ' + String((e && e.message) || e).slice(0, 60))
				}
			})
			if (hooked.how === 'not hooked yet') {
				var installed = []
				;[
					['root element', function () { return wrapRootElement(cleanup) }],
					['navigation', function () { return wrapNavigation(cleanup) }],
					['app container', function () { return wrapContainer(cleanup) }],
				].forEach(function (step) {
					try { if (step[1]()) installed.push(step[0]); else tried.push(step[0] + ': not found') } catch (e) { tried.push(step[0] + ': ' + String((e && e.message) || e).slice(0, 60)) }
				})
				hooked.how = installed.length ? 'waiting on: ' + installed.join(', ') : 'nothing found (' + tried.join('; ') + ')'
			}
			hooked.registry = registryInfo()
			attempt('image', function () { hooked.image = counterFlip(RN.Image, false, cleanup) })
			attempt('text', function () { counterFlip(RN.Text, true, cleanup) })
			attempt('input', function () { hooked.input = counterFlip(RN.TextInput, true, cleanup) })

			cleanup(function () {
				undo.forEach(function (fn) { try { fn() } catch (e) {} })
				undo = []
				listeners = []
			})
		},
	})
	return exports
})({})
