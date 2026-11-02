(function (exports) {
	/*
	 * Slowmode Extended for Valenced.
	 * Same idea as SlowmodeExtended for Vendetta by sapphire (https://github.com/aeongdesu/vdplugins):
	 * Discord's slowmode picker only offers a few values, so its list is replaced by a longer one.
	 * Written from scratch for Valenced. Keep `(function` as the first thing in this file: Valenced
	 * loads it as `return <file>`.
	 */
	var MAX = 21600 // the most Discord accepts: 6 hours
	var status = { found: 'not found yet', applied: false, count: 0, error: '' }

	/** Every second up to a minute, every minute up to an hour, every hour from 2 to 6 hours. */
	function extendedValues() {
		var values = []
		var s
		for (s = 0; s <= 60; s++) values.push(s)
		for (s = 120; s <= 3600; s += 60) values.push(s)
		for (s = 7200; s <= MAX; s += 3600) values.push(s)
		return values
	}

	function describe(seconds) {
		if (seconds < 60) return seconds + 's'
		if (seconds < 3600) return seconds / 60 + 'm'
		return seconds / 3600 + 'h'
	}

	/** Puts a new list in place of the old one and gives back a function that puts the old one back. */
	function replaceValues(holder, values) {
		var original = holder.SLOWMODE_VALUES
		try {
			holder.SLOWMODE_VALUES = values
		} catch (e) {}
		if (holder.SLOWMODE_VALUES !== values) {
			// The property cannot be assigned directly: define it again.
			Object.defineProperty(holder, 'SLOWMODE_VALUES', { value: values, configurable: true, enumerable: true, writable: true })
		}
		if (holder.SLOWMODE_VALUES !== values) throw new Error('Discord would not let the list be replaced')
		return function () {
			try { holder.SLOWMODE_VALUES = original } catch (e) {
				try { Object.defineProperty(holder, 'SLOWMODE_VALUES', { value: original, configurable: true, enumerable: true, writable: true }) } catch (e2) {}
			}
		}
	}

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

	function SettingsComponent() {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var sample = extendedValues()
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'found', label: 'Slowmode list', subLabel: status.found }),
					h(Design.TableRow, { key: 'applied', label: 'Extended list', subLabel: status.applied ? 'In use: ' + status.count + ' choices, 0s to ' + describe(MAX) : 'Not applied' + (status.error ? ' (' + status.error + ')' : '') }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'How to use it' },
					h(Design.TableRow, { key: 'use', label: 'Channel settings > Slowmode', subLabel: 'The slider now has every second up to 1 minute, every minute up to 1 hour, and every hour up to 6 hours. You need to be allowed to manage the channel.' }),
					h(Design.TableRow, { key: 'values', label: 'All choices', subLabel: sample.map(describe).join(', ') }),
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var f = valenced.modules.finders
			// The list lives in a module of Discord's constants, which may load after this plugin starts.
			api.cleanup(
				f.getModules(
					f.filters.withProps('SLOWMODE_VALUES'),
					function (module) {
						var holder = module && module.SLOWMODE_VALUES !== undefined ? module : module && module.default && module.default.SLOWMODE_VALUES !== undefined ? module.default : null
						if (!holder) {
							status.found = 'a module matched, but it has no list'
							return
						}
						status.found = 'found (' + (Array.isArray(holder.SLOWMODE_VALUES) ? holder.SLOWMODE_VALUES.length + ' choices' : 'in Discord') + ')'
						try {
							var values = extendedValues()
							api.cleanup(replaceValues(holder, values))
							status.applied = true
							status.count = values.length
						} catch (e) {
							status.error = String((e && e.message) || e).slice(0, 80)
						}
					},
					{ returnNamespace: true },
				),
			)
		},
	})
	return exports
})({})
