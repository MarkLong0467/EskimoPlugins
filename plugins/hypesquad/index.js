(function (exports) {
	/*
	 * HypeSquad Switcher for Valenced.
	 * Adds a HypeSquad section to Discord's settings with one row per house. Tapping a row joins that
	 * house, and the row for your current house shows "Current".
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var TOAST = 'MARKLONG_HYPESQUAD'
	var SECTION = 'MARKLONG_HYPESQUAD'
	// house_id is what Discord's API calls them. The flag is how your profile says which one you are in.
	var HOUSES = [
		{ id: 1, name: 'Bravery', flag: 64, icons: ['HypeSquadBraveryIcon', 'ic_hypesquad_bravery', 'hypesquad_bravery'] },
		{ id: 2, name: 'Brilliance', flag: 128, icons: ['HypeSquadBrillianceIcon', 'ic_hypesquad_brilliance', 'hypesquad_brilliance'] },
		{ id: 3, name: 'Balance', flag: 256, icons: ['HypeSquadBalanceIcon', 'ic_hypesquad_balance', 'hypesquad_balance'] },
	]
	var FALLBACK_ICONS = ['HypeSquadIcon', 'ic_hypesquad', 'SparklesIcon', 'StarIcon', 'PuzzlePieceIcon']

	var optimistic // The house we just switched to, until Discord's profile data catches up.
	var busy = false
	var listeners = []

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text }) } catch (e) {}
	}
	function notify() {
		listeners.forEach(function (listener) { listener() })
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

	// ---- Which house you are in ----------------------------------------------------------------
	function houseFromProfile() {
		var user = store('UserStore') && store('UserStore').getCurrentUser()
		var flags = (user && (user.publicFlags != null ? user.publicFlags : user.flags)) || 0
		for (var i = 0; i < HOUSES.length; i++) if (flags & HOUSES[i].flag) return HOUSES[i].id
		return 0
	}

	/** The house you are in: 1, 2 or 3, or 0 for none. */
	function currentHouse() {
		var real = houseFromProfile()
		if (optimistic !== undefined && real === optimistic) optimistic = undefined
		return optimistic !== undefined ? optimistic : real
	}

	/** Redraws whatever calls it when your house changes. */
	function useHouse() {
		var React = valenced.react.React
		var tick = React.useState(0)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			var users = store('UserStore')
			if (users && users.addChangeListener) users.addChangeListener(update)
			return function () {
				listeners = listeners.filter(function (l) { return l !== update })
				if (users && users.removeChangeListener) users.removeChangeListener(update)
			}
		}, [])
		return currentHouse()
	}

	function houseName(id) {
		var house = HOUSES.filter(function (x) { return x.id === id })[0]
		return house ? house.name : 'none'
	}

	// ---- Switching -----------------------------------------------------------------------------
	function rest() {
		var f = finders()
		return f.lookupModule(f.filters.withProps('get', 'post', 'patch'))[0] || f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0]
	}

	function explain(error) {
		var status = error && (error.status || (error.response && error.response.status))
		var message = error && error.body && error.body.message
		if (status === 429) return 'Discord says slow down. Try again in a minute.'
		if (status === 401 || status === 403) return message || 'Discord would not let you change HypeSquad right now.'
		if (message) return message
		return 'Could not change your HypeSquad. Try again.'
	}

	async function change(houseId) {
		if (busy) return toast('Still working on the last change.')
		if (currentHouse() === houseId) return toast(houseId ? 'You are already in HypeSquad ' + houseName(houseId) + '.' : 'You are not in a HypeSquad house.')
		var http = rest()
		if (!http) return toast('Could not reach Discord. Try again.')
		busy = true
		toast(houseId ? 'Joining HypeSquad ' + houseName(houseId) + '...' : 'Leaving HypeSquad...')
		try {
			if (houseId) await http.post({ url: '/hypesquad/online', body: { house_id: houseId } })
			else await (http.del || http.delete).call(http, { url: '/hypesquad/online' })
			optimistic = houseId
			notify()
			toast(houseId ? 'You are now in HypeSquad ' + houseName(houseId) + '.' : 'You left HypeSquad.')
		} catch (error) {
			toast(explain(error))
		} finally {
			busy = false
		}
	}

	// ---- Discord's settings menu ---------------------------------------------------------------
	function iconFor(names) {
		var all = names.concat(FALLBACK_ICONS)
		for (var i = 0; i < all.length; i++) if (valenced.assets.getAssetIdByName(all[i]) != null) return all[i]
	}

	function settingsItems() {
		var items = {}
		var keys = []
		HOUSES.forEach(function (house) {
			var key = SECTION + '_' + house.id
			keys.push(key)
			items[key] = {
				parent: null,
				type: 'pressable',
				IconComponent: function () { return h(valenced.components.TableRowAssetIcon, { name: iconFor(house.icons) }) },
				useTitle: function () { return house.name },
				useTrailing: function () { return useHouse() === house.id ? 'Current' : undefined },
				onPress: function () { change(house.id) },
			}
		})
		var leaveKey = SECTION + '_LEAVE'
		keys.push(leaveKey)
		items[leaveKey] = {
			parent: null,
			type: 'pressable',
			variant: 'danger',
			IconComponent: function () { return h(valenced.components.TableRowAssetIcon, { name: iconFor([]) }) },
			useTitle: function () { return 'Leave HypeSquad' },
			usePredicate: function () { return useHouse() !== 0 },
			onPress: function () { change(0) },
		}
		return { items: items, keys: keys }
	}

	// ---- The plugin's own settings screen, in case the main menu entry is not there ------------
	function SettingsComponent() {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var current = useHouse()
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'HypeSquad' },
					HOUSES.map(function (house) {
						return h(Design.TableRow, {
							key: house.id,
							label: house.name,
							subLabel: current === house.id ? 'Current' : undefined,
							onPress: function () { change(house.id) },
						})
					}),
					current !== 0 ? h(Design.TableRow, { key: 'leave', label: 'Leave HypeSquad', variant: 'danger', onPress: function () { change(0) } }) : null,
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			var settings = valenced.discord.modules.settings
			var undo = []
			cleanup(function () {
				// Take the section out first, then redraw settings without it.
				undo.forEach(function (fn) { try { fn() } catch (e) {} })
				undo = []
				optimistic = undefined
				busy = false
				try { settings.refreshSettings() } catch (e) {}
			})
			cleanup(
				settings.onSettingsModulesLoaded(function () {
					var built = settingsItems()
					undo.push(settings.registerSettingsItems(built.items))
					undo.push(settings.registerSettingsSection(SECTION, { label: 'HypeSquad', settings: built.keys, index: 2 }))
					settings.refreshSettings()
				}),
			)
		},
	})
	return exports
})({})
