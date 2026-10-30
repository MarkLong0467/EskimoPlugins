(function (exports) {
	/*
	 * RTL Chat for Valenced.
	 * Two ways to read Discord from right to left, in English:
	 *   Right-aligned chat (default): the chat is not mirrored. Message text is right-aligned and the
	 *     profile pictures sit on the right of each message, like a right-to-left language.
	 *   Mirror everything: the whole app is flipped sideways (optionally with readable letters).
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var defaults = { mode: 'align', pictures: true, text: true, readable: true }
	var storage
	var listeners = []
	var Scope // React context: true inside a message
	var hooked = { how: 'not hooked yet', keys: [], fired: '', scope: 'not found', view: false, text: false, image: false, input: false }
	var FLIP = [{ scaleX: -1 }]

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
	function mirrored() { return setting('mode') === 'mirror' }

	// ======================================================================================
	// Right-aligned chat: only messages change
	// ======================================================================================
	var SWAP = [
		['marginLeft', 'marginRight'], ['paddingLeft', 'paddingRight'], ['left', 'right'],
		['borderLeftWidth', 'borderRightWidth'], ['borderLeftColor', 'borderRightColor'],
		['borderTopLeftRadius', 'borderTopRightRadius'], ['borderBottomLeftRadius', 'borderBottomRightRadius'],
	]

	/** The same style as it would be written for a right-to-left language. */
	function rtlStyle(flat, isText) {
		var out = Object.assign({}, flat)
		var changedAny = false
		if (setting('pictures')) {
			if (flat.flexDirection === 'row') { out.flexDirection = 'row-reverse'; changedAny = true }
			else if (flat.flexDirection === 'row-reverse') { out.flexDirection = 'row'; changedAny = true }
			SWAP.forEach(function (pair) {
				var a = flat[pair[0]]
				var b = flat[pair[1]]
				if (a === undefined && b === undefined) return
				delete out[pair[0]]
				delete out[pair[1]]
				if (b !== undefined) out[pair[0]] = b
				if (a !== undefined) out[pair[1]] = a
				changedAny = true
			})
		}
		if (isText && setting('text')) {
			if (flat.textAlign === undefined || flat.textAlign === 'auto' || flat.textAlign === 'left') { out.textAlign = 'right'; changedAny = true }
		}
		return changedAny ? out : null
	}

	/** Patches a component's render so that inside a message its style is written right to left. */
	function patchScoped(Component, kind, cleanup) {
		var RN = valenced.react.ReactNative
		var React = valenced.react.React
		if (!Scope || !Component || typeof Component.render !== 'function') return false
		cleanup(
			valenced.patcher.instead(Component, 'render', function (args, original) {
				var inMessage = React.useContext(Scope) // a hook, so it runs on every render, in the same place
				var el = Reflect.apply(original, this, args)
				try {
					if (!inMessage || mirrored() || !el || !el.props) return el
					var flat = RN.StyleSheet.flatten(el.props.style) || {}
					var next = rtlStyle(flat, kind === 'text')
					return next ? React.cloneElement(el, { style: next }) : el
				} catch (e) {
					return el
				}
			}),
		)
		return true
	}

	/** Marks every message, wherever Discord draws it, so only messages are changed. */
	function installScope(cleanup) {
		var React = valenced.react.React
		var f = valenced.modules.finders
		Scope = React.createContext(false)
		var guard = false
		function isMessage(el) {
			var m = el && typeof el === 'object' && el.props && el.props.message
			return !!m && typeof m === 'object' && m.author && m.channel_id !== undefined
		}
		function mark(el) {
			if (guard || !isMessage(el) || el.type === Scope.Provider) return el
			guard = true
			try { return h(Scope.Provider, { value: true }, el) } finally { guard = false }
		}
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, mark))
		})
		if (typeof React.createElement === 'function') cleanup(valenced.patcher.after(React, 'createElement', mark))
		hooked.scope = 'messages found by their props'
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
		var align = settings.mode !== 'mirror'
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRadioGroup,
					{ title: 'Style', value: settings.mode, onChange: function (v) { put('mode', v) } },
					[
						{ value: 'align', label: 'Right-aligned chat', subLabel: 'Not mirrored. Message text is right-aligned and profile pictures are on the right' },
						{ value: 'mirror', label: 'Mirror everything', subLabel: 'The whole app is flipped sideways, like a mirror' },
					].map(function (r) { return h(Design.TableRadioRow, { key: r.value, label: r.label, subLabel: r.subLabel, value: r.value }) }),
				),
				align
					? h(
							Design.TableRowGroup,
							{ title: 'Right-aligned chat' },
							toggle('pictures', 'Pictures on the right', 'Profile pictures move to the right of each message, with names and times next to them'),
							toggle('text', 'Right-align message text', 'Lines of text line up on the right edge'),
					  )
					: h(
							Design.TableRowGroup,
							{ title: 'Mirror everything' },
							toggle('readable', 'Readable text and pictures', 'Letters and pictures face the normal way. Off is a true mirror, letters reversed'),
					  ),
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'scope', label: 'Messages', subLabel: hooked.scope }),
					h(Design.TableRow, { key: 'parts', label: 'Parts found', subLabel: 'Text: ' + (hooked.text ? 'ok' : 'not found') + ' · Layouts: ' + (hooked.view ? 'ok' : 'not found') }),
					align ? null : h(Design.TableRow, { key: 'hook', label: 'Mirror hooked into', subLabel: hooked.how + (hooked.fired ? ' · flipped through ' + hooked.fired : '') }),
					align ? null : h(Design.TableRow, { key: 'registry', label: 'Apps Discord registered', subLabel: hooked.registry || 'unknown' }),
					h(Design.TableRow, { key: 'note', label: 'After installing', subLabel: 'Restart Discord once. After that the settings above apply right away, except switching to or from Mirror everything the first time.' }),
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

			// Right-aligned chat.
			attempt('scope', function () { installScope(cleanup) })
			attempt('text', function () { hooked.text = patchScoped(RN.Text, 'text', cleanup) })
			attempt('view', function () { hooked.view = patchScoped(RN.View, 'view', cleanup) })

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
