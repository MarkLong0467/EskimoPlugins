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
	var defaults = { mirror: true, readable: false }
	var storage
	var listeners = []
	var hooked = { how: 'not hooked yet', keys: [] }

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
				try { return h(Mirror, {}, ret) } catch (e) { return ret }
			}),
		)
		return true
	}

	/** Optional: turns the letters back the right way round, so only the layout is mirrored. */
	function patchText(cleanup) {
		var RN = valenced.react.ReactNative
		var Text = RN.Text
		if (!Text || typeof Text.render !== 'function') return false
		cleanup(
			valenced.patcher.instead(Text, 'render', function (args, original) {
				var el = Reflect.apply(original, this, args)
				try {
					if (!setting('mirror') || !setting('readable') || !el || !el.props) return el
					return valenced.react.React.cloneElement(el, { style: [el.props.style, { transform: FLIP }] })
				} catch (e) {
					return el
				}
			}),
		)
		return true
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
					h(Design.TableSwitchRow, { key: 'readable', label: 'Keep letters readable (experimental)', subLabel: 'Only the layout is mirrored, the letters face the normal way. Off matches a true mirror', value: !!settings.readable, onValueChange: function (v) { put('readable', v) } }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'hook', label: 'Hooked into', subLabel: hooked.how }),
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
			try {
				if (wrapRegistry()) hooked.how = 'the app root (' + hooked.keys.join(', ') + ')'
				else if (wrapContainer(cleanup)) hooked.how = 'the app container'
				else hooked.how = 'nothing found, it cannot work on this version'
			} catch (e) {
				hooked.how = 'failed: ' + String((e && e.message) || e)
			}
			try { patchText(cleanup) } catch (e) {}
			cleanup(function () {
				undo.forEach(function (fn) { try { fn() } catch (e) {} })
				undo = []
				listeners = []
			})
		},
	})
	return exports
})({})
