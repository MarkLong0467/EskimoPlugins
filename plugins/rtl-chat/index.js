(function (exports) {
	/*
	 * RTL Chat for Valenced.
	 * Mirrors the whole app from left to right, so the chat is laid out right to left (avatars on the
	 * right, names and times to their left, the message box mirrored) while the text stays English.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * How: the app's root component is wrapped in a view that is flipped sideways. A flipped view mirrors
	 * everything inside it, letters included, which is the look of a mirror held next to the screen.
	 * Touches follow what you see, because React Native maps touches through the flip.
	 */
	var defaults = { mirror: true, readable: true }
	var storage
	var listeners = []
	var hooked = { how: 'not hooked yet', keys: [], fired: '' }

	/** Several ways of reaching the app root are installed when the best ones are missing. Only the first that runs flips it. */
	function mayWrap(name) {
		if (hooked.fired && hooked.fired !== name) return false
		hooked.fired = name
		return true
	}

	function setting(key) {
		var s = storage && storage.cache
		return s && s[key] !== undefined ? s[key] : defaults[key]
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

	var FLIP = [{ scaleX: -1 }]

	/** The flipped wrapper around the whole app. It re-draws when the settings change, so no restart is needed to turn it off or on. */
	function Mirror(props) {
		var React = valenced.react.React
		var RN = valenced.react.ReactNative
		var tick = React.useState(0)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])
		return h(RN.View, { style: { flex: 1, transform: setting('mirror') ? FLIP : [] } }, props.children)
	}

	// ---- Hooking the root ----------------------------------------------------------------------
	var undo = []

	function wrapRegistry() {
		var RN = valenced.react.ReactNative
		var registry = RN.AppRegistry
		if (!registry || typeof registry.getAppKeys !== 'function' || typeof registry.getRunnable !== 'function' || typeof registry.registerComponent !== 'function') return false
		var keys = registry.getAppKeys() || []
		var done = []
		keys.forEach(function (key) {
			var runnable = registry.getRunnable(key)
			var provider = runnable && runnable.componentProvider
			if (typeof provider !== 'function') return
			var section = runnable.section
			registry.registerComponent(
				key,
				function () {
					var Inner = provider()
					function RtlRoot(rootProps) { return h(Mirror, {}, h(Inner, rootProps)) }
					return RtlRoot
				},
				section,
			)
			undo.push(function () { registry.registerComponent(key, provider, section) })
			done.push(key)
		})
		hooked.keys = done
		return done.length > 0
	}

	function wrapContainer(cleanup) {
		var f = valenced.modules.finders
		var found = f.lookupModule(f.filters.withName('AppContainer'))[0]
		var cls = typeof found === 'function' ? found : found && found.default
		if (!cls || !cls.prototype || typeof cls.prototype.render !== 'function') return false
		cleanup(
			valenced.patcher.instead(cls.prototype, 'render', function (args, original) {
				var ret = Reflect.apply(original, this, args)
				try { return mayWrap('app container') ? h(Mirror, {}, ret) : ret } catch (e) { return ret }
			}),
		)
		return true
	}

	/** What the app registry looks like on this phone, for the Status page. */
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

	var wrapped = new Map()
	function wrapRoot(Root) {
		if (typeof Root !== 'function' && !(Root && typeof Root === 'object')) return Root
		if (wrapped.has(Root)) return wrapped.get(Root)
		var Wrapped = function RtlRoot(rootProps) { return h(Mirror, {}, h(Root, rootProps)) }
		wrapped.set(Root, Wrapped)
		return Wrapped
	}

	/** React Native's renderApplication: it is handed the app's root component, which can be swapped for a wrapped one. */
	function wrapRenderApplication(cleanup) {
		var f = valenced.modules.finders
		var found = f.lookupModule(f.filters.withName('renderApplication'))[0]
		var holder = found && typeof found.default === 'function' ? found : null
		if (!holder) return false
		cleanup(
			valenced.patcher.instead(holder, 'default', function (args, original) {
				var next = args.slice()
				try { next[0] = wrapRoot(args[0]) } catch (e) {}
				return Reflect.apply(original, this, next)
			}),
		)
		return true
	}

	/**
	 * React Native builds the app as <AppContainer rootTag=... initialProps=...>. Whatever creates that element
	 * (the JSX runtime or createElement) goes through a function that can be watched, and the element is
	 * handed back wrapped in the flipped view.
	 */
	function wrapRootElement(cleanup) {
		var f = valenced.modules.finders
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		var React = valenced.react.React
		var isRoot = function (el) {
			return !!el && typeof el === 'object' && el.props && el.props.rootTag !== undefined && 'initialProps' in el.props
		}
		var count = 0
		var guard = false
		function wrapIfRoot(el) {
			if (guard || !isRoot(el) || !mayWrap('root element')) return el
			guard = true
			try { count++; return h(Mirror, {}, el) } finally { guard = false }
		}
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, wrapIfRoot))
		})
		if (React && typeof React.createElement === 'function') cleanup(valenced.patcher.after(React, 'createElement', wrapIfRoot))
		return true
	}

	/** The navigation container holds every screen of the app, so flipping it flips the whole app. */
	function wrapNavigation(cleanup) {
		var nav = valenced.externals.ReactNavigation && valenced.externals.ReactNavigation.ReactNavigationNative
		var Container = nav && nav.NavigationContainer
		if (!Container || typeof Container.render !== 'function') return false
		cleanup(
			valenced.patcher.instead(Container, 'render', function (args, original) {
				var ret = Reflect.apply(original, this, args)
				try { return mayWrap('navigation') ? h(Mirror, {}, ret) : ret } catch (e) { return ret }
			}),
		)
		return true
	}

	/**
	 * Turns something back the right way round inside the flipped app, so letters and pictures are not
	 * mirrored. Its place stays mirrored, which is what puts avatars on the right. Text is also pushed to the
	 * right edge of its box, like Arabic.
	 */
	function counterFlip(Component, isText) {
		var RN = valenced.react.ReactNative
		var React = valenced.react.React
		function decorate(el) {
			if (!setting('mirror') || !setting('readable') || !el || !el.props) return el
			var flat = RN.StyleSheet.flatten(el.props.style) || {}
			var transform = Array.isArray(flat.transform) ? flat.transform : []
			var extra = { transform: FLIP.concat(transform) }
			if (isText && (flat.textAlign === undefined || flat.textAlign === 'auto' || flat.textAlign === 'left')) extra.textAlign = 'right'
			return React.cloneElement(el, { style: [flat, extra] })
		}
		if (Component && typeof Component.render === 'function')
			return valenced.patcher.instead(Component, 'render', function (args, original) {
				var el = Reflect.apply(original, this, args)
				try { return decorate(el) } catch (e) { return el }
			})
		if (typeof Component === 'function' && Component.prototype && typeof Component.prototype.render === 'function')
			return valenced.patcher.instead(Component.prototype, 'render', function (args, original) {
				var el = Reflect.apply(original, this, args)
				try { return decorate(el) } catch (e) { return el }
			})
		return null
	}

	var reading = { text: false, image: false, input: false }
	function patchReadable(cleanup) {
		var RN = valenced.react.ReactNative
		;[['Text', 'text', true], ['Image', 'image', false], ['TextInput', 'input', true]].forEach(function (x) {
			try {
				var undoPatch = counterFlip(RN[x[0]], x[2])
				if (undoPatch) {
					cleanup(undoPatch)
					reading[x[1]] = true
				}
			} catch (e) {}
		})
	}

	// ---- Settings ------------------------------------------------------------------------------
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
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Layout' },
					h(Design.TableSwitchRow, { key: 'mirror', label: 'Right to left', subLabel: 'Flips the whole app sideways: the chat, the message box, the menus', value: !!settings.mirror, onValueChange: function (v) { put('mirror', v) } }),
					h(Design.TableSwitchRow, { key: 'readable', label: 'Readable text and pictures', subLabel: 'Only the layout is flipped, like Arabic: avatars on the right, letters and pictures the normal way round. Off is a true mirror, letters reversed', value: !!settings.readable, onValueChange: function (v) { put('readable', v) } }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'hook', label: 'Hooked into', subLabel: hooked.how + (hooked.fired ? ' · flipped through ' + hooked.fired : '') }),
					h(Design.TableRow, { key: 'reading', label: 'Letters and pictures', subLabel: 'Text: ' + (reading.text ? 'ok' : 'not found') + ' · Pictures: ' + (reading.image ? 'ok' : 'not found') + ' · Message box: ' + (reading.input ? 'ok' : 'not found') }),
					h(Design.TableRow, { key: 'registry', label: 'Apps Discord registered', subLabel: hooked.registry || 'unknown' }),
					h(Design.TableRow, { key: 'note', label: 'Turning it on', subLabel: 'If you just installed this, restart Discord once. After that the switches above work right away.' }),
					h(Design.TableRow, { key: 'stuck', label: 'If the app is hard to use', subLabel: 'Touches follow what you see. To switch it off, use the Right to left switch above, or hold two fingers on the screen in the first 3 seconds after opening Discord for Valenced recovery.' }),
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
			var tried = []
			hooked.how = ''
			;[
				['the app root', function () { return wrapRegistry() && 'the app root (' + hooked.keys.join(', ') + ')' }],
				['renderApplication', function () { return wrapRenderApplication(cleanup) && 'React Native\'s renderApplication' }],
			].forEach(function (step) {
				if (hooked.how) return
				try {
					var result = step[1]()
					if (result) hooked.how = result
					else tried.push(step[0] + ': not found')
				} catch (e) {
					tried.push(step[0] + ': ' + String((e && e.message) || e).slice(0, 60))
				}
			})
			if (!hooked.how) {
				// The best ways are missing, so every other way is installed, and the first one that runs does the flip.
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
			try { patchReadable(cleanup) } catch (e) {}
			cleanup(function () {
				undo.forEach(function (fn) { try { fn() } catch (e) {} })
				undo = []
				listeners = []
			})
		},
	})
	return exports
})({})
