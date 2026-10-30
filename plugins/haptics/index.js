(function (exports) {
	/*
	 * Haptics for Valenced, by MarkLong0467.
	 * Switches for the buzzing Discord does: when a long-press menu opens, other haptic feedback, and plain
	 * vibrations. Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * How it works: the menu buzz is Discord's own `disableHapticOnOpen` option, set when you turn it off. The
	 * other buzzes are found by name in Discord's code and swallowed. Every buzz it sees is listed in Settings,
	 * so a buzz that is not caught can be tracked down.
	 */
	var defaults = { menus: true, discord: true, vibration: true }
	var storage
	var diag = []
	var heard = [] // { label, note, count, at }
	var hooks = { menus: 'not found yet', libraries: 'none found', vibration: 'not found' }
	var listeners = []

	function setting(key) {
		var s = storage && storage.cache
		return s && s[key] !== undefined ? s[key] : defaults[key]
	}
	function changed() {
		listeners.slice().forEach(function (l) { try { l() } catch (e) {} })
	}
	function note(line) {
		diag.push(new Date().toTimeString().slice(0, 8) + ' ' + line)
		if (diag.length > 60) diag.shift()
		changed()
	}
	function errorText(e) { return String((e && e.message) || e) }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_HAPTICS', { text: String(text) }) } catch (e) {}
	}
	function copyText(text, what) {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(text)
			toast((what || 'Text') + ' copied')
		} catch (e) { toast('Could not copy') }
	}
	function attempt(label, step) {
		try { step() } catch (e) { note(label + ' failed: ' + errorText(e)) }
	}

	/** Remembers a buzz that went by, with what was done about it. */
	function saw(label, what) {
		var item = heard.filter(function (x) { return x.label === label && x.note === what })[0]
		if (!item) {
			item = { label: label, note: what, count: 0 }
			heard.unshift(item)
			if (heard.length > 30) heard.pop()
		}
		item.count++
		// The log gets a line for a buzz the first time, then at most every 5 seconds for the same one.
		if (!item.at || Date.now() - item.at > 5000) note('buzz: ' + label + ' -> ' + what + ' (' + item.count + 'x so far)')
		item.at = Date.now()
		changed()
	}
	function shortArgs(args) {
		try { return Array.prototype.slice.call(args, 0, 2).map(function (a) { return typeof a === 'string' || typeof a === 'number' ? String(a) : typeof a }).join(', ') } catch (e) { return '' }
	}

	// ---- The hooks ------------------------------------------------------------------------------
	/** Long-press menus: Discord opens them with an option that skips the buzz. */
	function hookMenus(cleanup) {
		var creators = valenced.discord.actions && valenced.discord.actions.ActionSheetActionCreators
		if (!creators || typeof creators.openLazy !== 'function') return false
		cleanup(
			valenced.patcher.instead(creators, 'openLazy', function (args, original) {
				try {
					if (!setting('menus')) {
						args[2] = Object.assign({}, args[2], { disableHapticOnOpen: true })
						saw('Menu opened', 'buzz removed')
					} else saw('Menu opened', 'buzz kept')
				} catch (e) {}
				return Reflect.apply(original, this, args)
			}),
		)
		hooks.menus = 'working'
		note('Menu hook: working')
		return true
	}

	/** A haptic function that Discord's code calls: it is logged, and swallowed when the switch is off. */
	function hookFunction(cleanup, holder, name, label) {
		if (!holder || typeof holder[name] !== 'function') return false
		cleanup(
			valenced.patcher.instead(holder, name, function (args, original) {
				var off = !setting('discord')
				saw(label + '.' + name + '(' + shortArgs(args) + ')', off ? 'swallowed' : 'allowed')
				if (off) return /Async$/.test(name) ? Promise.resolve() : undefined
				return Reflect.apply(original, this, args)
			}),
		)
		return true
	}

	/** Haptic libraries Discord's code may use, found by what they export. */
	function hookLibraries(cleanup) {
		var f = valenced.modules.finders
		var found = []
		function add(label) { found.push(label); hooks.libraries = found.join(', '); note('Haptic library hooked: ' + label); changed() }
		cleanup(
			f.getModules(f.filters.withProps('impactAsync', 'notificationAsync', 'selectionAsync'), function (module) {
				attempt('hooking the haptics library', function () {
					var holder = module && typeof module.impactAsync === 'function' ? module : module && module.default
					var any = false
					;['impactAsync', 'notificationAsync', 'selectionAsync'].forEach(function (n) { if (hookFunction(cleanup, holder, n, 'haptics')) any = true })
					if (any) add('haptics (impact, notification, selection)')
				})
			}),
		)
		cleanup(
			f.getModules(f.filters.withProps('trigger', 'HapticFeedbackTypes'), function (module) {
				attempt('hooking the haptic feedback library', function () {
					var any = hookFunction(cleanup, module, 'trigger', 'hapticFeedback')
					if (module && module.default && module.default !== module && hookFunction(cleanup, module.default, 'trigger', 'hapticFeedback')) any = true
					if (any) add('haptic feedback (trigger)')
				})
			}),
		)
		// Native modules, looked up by exact name only (their members are never listed).
		attempt('looking for native haptics', function () {
			var RN = valenced.react.ReactNative
			var natives = (RN && RN.NativeModules) || {}
			;[['RNHapticFeedback', ['trigger']], ['ExpoHaptics', ['impactAsync', 'notificationAsync', 'selectionAsync']]].forEach(function (pair) {
				var m = natives[pair[0]]
				if (!m) return
				var any = false
				pair[1].forEach(function (n) { if (hookFunction(cleanup, m, n, pair[0])) any = true })
				if (any) add(pair[0])
			})
		})
	}

	/** Plain vibrations, from React Native's own Vibration API. */
	function hookVibration(cleanup) {
		var RN = valenced.react.ReactNative
		var vib = RN && RN.Vibration
		if (!vib || typeof vib.vibrate !== 'function') return false
		cleanup(
			valenced.patcher.instead(vib, 'vibrate', function (args, original) {
				var off = !setting('vibration')
				saw('Vibration', off ? 'swallowed' : 'allowed')
				if (off) return undefined
				return Reflect.apply(original, this, args)
			}),
		)
		hooks.vibration = 'working'
		note('Vibration hook: working')
		return true
	}

	// ---- Settings -------------------------------------------------------------------------------
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

	function SettingsComponent(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var data = Object.assign({}, defaults, json.use())
		var tickState = React.useState(0)
		React.useEffect(function () {
			var update = function () { tickState[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])

		function row(label, subLabel) { return h(Design.TableRow, { key: String(label) + String(subLabel || ''), label: label, subLabel: subLabel }) }
		function press(label, subLabel, onPress) { return h(Design.TableRow, { key: 'p:' + label, label: label, subLabel: subLabel, onPress: onPress }) }
		function toggle(key, label, subLabel) {
			return h(Design.TableSwitchRow, {
				key: key,
				label: label,
				subLabel: subLabel,
				value: !!data[key],
				onValueChange: function (v) { var patch = {}; patch[key] = v; json.set(patch) },
			})
		}
		function group(title, rows) { return h(Design.TableRowGroup, { key: 'g:' + title, title: title }, rows.filter(Boolean)) }
		function noteText(text) { return h(Design.Text, { key: 'n:' + text.slice(0, 24), variant: 'text-sm/medium', color: 'text-muted', style: { paddingHorizontal: 4 } }, text) }

		var lines = heard.slice(0, 12).map(function (x) { return row(x.label, x.note + ' · ' + x.count + 'x') })
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 48 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 16, paddingHorizontal: 12 }, spacing: 20 },
				[
					h(RN.View, { key: 'title', style: { paddingHorizontal: 4 } }, h(Design.Text, { variant: 'heading-lg/bold' }, 'Haptics'), h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Choose what buzzes your phone')),
					group('Buzzing', [
						toggle('menus', 'Buzz when a menu opens', 'The buzz when you long-press a message, server or person and a menu opens'),
						toggle('discord', 'Other haptic feedback', 'Taps, switches and other small buzzes from Discord'),
						toggle('vibration', 'Vibrations', 'Longer vibrations an app asks for'),
					]),
					noteText('Turn a switch off to stop that buzz. Changes apply right away. If something still buzzes, the list below shows what Discord asked for.'),
					group('What this found', [
						row('Menus', hooks.menus),
						row('Haptic libraries', hooks.libraries),
						row('Vibrations', hooks.vibration),
					]),
					group('Buzzes just now', lines.length ? lines : [row('Nothing yet', 'Long-press something, then come back here')]),
					group('Troubleshooting', [
						press('Copy the log', 'Send this when a buzz is not caught', function () { copyText(diag.join('\n') || 'empty', 'Log') }),
						press('Clear the list', 'Start the list of buzzes again', function () { heard = []; changed() }),
					]),
					group('About', [
						row('What this does', 'Switches off the buzzing from Discord that you do not want. It cannot change the touch feedback of your phone itself, which is set in Android under Sound and vibration.'),
					]),
				],
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
			function menus() {
				attempt('hooking menus', function () {
					if (!hookMenus(cleanup)) note('Menus: the menu opener was not found yet')
				})
			}
			menus()
			// Discord's menu opener can load a moment after start: look once more.
			var retry = hooks.menus === 'working' ? null : setTimeout(menus, 4000)
			attempt('hooking libraries', function () { hookLibraries(cleanup) })
			attempt('hooking vibrations', function () { if (!hookVibration(cleanup)) note('Vibrations: not found') })
			cleanup(function () {
				if (retry) clearTimeout(retry)
				listeners = []
			})
		},
	})
	return exports
})({})
