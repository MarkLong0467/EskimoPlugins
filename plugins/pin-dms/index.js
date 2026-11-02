(function (exports) {
	/*
	 * Pin DMs for Valenced.
	 * The idea comes from PinDMs for Vencord and BetterDiscord. The code is written from scratch for Valenced.
	 * Pinned chats are moved to the top of the list Discord uses for the DM list. Hold a DM and choose
	 * Pin DM, or pick them in this plugin's settings.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var defaults = { pins: [] }
	var DM = 1
	var GROUP_DM = 3
	var METHODS = ['getPrivateChannelIds', 'getSortedChannels']

	var storage
	var listeners = []
	var status = { store: 'not found', hooks: [], menus: 0, error: '' }
	var memo = {} // method -> { key, result }, so the same list gives the same array

	function finders() { return valenced.modules.finders }
	function stores() { return valenced.discord.flux.Stores }
	function setting(key) {
		var s = storage && storage.cache
		return s && s[key] !== undefined ? s[key] : defaults[key]
	}
	function pins() {
		var list = setting('pins')
		return Array.isArray(list) ? list.filter(function (x) { return typeof x === 'string' }) : []
	}
	function changed() { listeners.slice().forEach(function (l) { try { l() } catch (e) {} }) }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_PIN_DMS', { text: String(text) }) } catch (e) {}
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

	function sortStore() {
		var s = stores().PrivateChannelSortStore
		if (s) return s
		var f = finders()
		return f.lookupModule(f.filters.withProps('getPrivateChannelIds'))[0]
	}

	// ---- Putting pinned chats first -----------------------------------------------------------
	function idOf(entry) {
		if (typeof entry === 'string') return entry
		if (entry && typeof entry === 'object') return entry.id || entry.channel_id || entry.channelId
	}

	/** The same list with pinned chats first, in the order they were pinned. Anything not recognised is left alone. */
	function pinnedFirst(list, method) {
		var chosen = pins()
		if (!Array.isArray(list) || !chosen.length) return list
		var key = method + '|' + chosen.join(',') + '|' + list.map(idOf).join(',')
		if (memo[method] && memo[method].key === key) return memo[method].result
		var byId = {}
		list.forEach(function (entry) { var id = idOf(entry); if (id) byId[id] = entry })
		var top = []
		chosen.forEach(function (id) { if (byId[id] !== undefined) top.push(byId[id]) })
		if (!top.length) return list
		var rest = list.filter(function (entry) { return chosen.indexOf(idOf(entry)) < 0 })
		var result = top.concat(rest)
		memo[method] = { key: key, result: result }
		return result
	}

	function installStoreHooks(cleanup) {
		var store = sortStore()
		if (!store) return
		status.store = 'found'
		METHODS.forEach(function (method) {
			if (typeof store[method] !== 'function') return
			try {
				cleanup(
					valenced.patcher.after(store, method, function (result) {
						try { return pinnedFirst(result, method) } catch (e) { return result }
					}),
				)
				status.hooks.push(method)
			} catch (e) {
				status.error = String((e && e.message) || e).slice(0, 80)
			}
		})
	}

	/** Tells Discord the DM list changed, so it is drawn again. */
	function refreshList() {
		memo = {}
		var store = sortStore()
		try { if (store && typeof store.emitChange === 'function') store.emitChange() } catch (e) {}
		changed()
	}

	// ---- Pinning ---------------------------------------------------------------------------------
	function isPinned(id) { return pins().indexOf(id) >= 0 }

	function save(list) {
		// A list is replaced, not merged, so removals stick.
		if (storage && typeof storage.set === 'function') storage.set({ pins: list }, true)
		if (storage && storage.cache) storage.cache.pins = list
		refreshList()
	}

	function pin(id) {
		if (isPinned(id)) return
		save(pins().concat([id]))
	}
	function unpin(id) {
		save(pins().filter(function (x) { return x !== id }))
	}
	function toggle(id) {
		if (isPinned(id)) { unpin(id); toast('Unpinned') } else { pin(id); toast('Pinned to the top') }
	}
	function move(id, by) {
		var list = pins()
		var at = list.indexOf(id)
		var to = at + by
		if (at < 0 || to < 0 || to >= list.length) return
		list.splice(to, 0, list.splice(at, 1)[0])
		save(list)
	}

	// ---- Names -----------------------------------------------------------------------------------
	function channelLabel(id) {
		try {
			var ch = stores().ChannelStore.getChannel(id)
			if (!ch) return 'Unknown chat (' + id.slice(-4) + ')'
			if (ch.name) return ch.name
			var ids = ch.recipients || (ch.rawRecipients || []).map(function (u) { return u && u.id })
			var names = (ids || []).map(function (uid) {
				var user = stores().UserStore.getUser(uid)
				return user ? user.globalName || user.username : null
			}).filter(Boolean)
			return names.join(', ') || 'Direct message'
		} catch (e) {
			return 'Direct message'
		}
	}

	function allDmIds() {
		var store = sortStore()
		var list = []
		try {
			var ids = store && typeof store.getPrivateChannelIds === 'function' ? store.getPrivateChannelIds() : []
			list = (ids || []).map(idOf).filter(Boolean)
		} catch (e) {}
		return list
	}

	// ---- The hold-down menu ------------------------------------------------------------------------
	function isDm(id) {
		try {
			var ch = stores().ChannelStore.getChannel(id)
			return !!ch && (ch.type === DM || ch.type === GROUP_DM)
		} catch (e) { return false }
	}

	/** Which DM a menu is about, from the props it was given. */
	function dmOf(props) {
		var keys = Object.keys(props)
		for (var i = 0; i < keys.length; i++) {
			var v = props[keys[i]]
			if (keys[i] === 'message') return undefined // a message menu, not a DM menu
			if (v && typeof v === 'object' && typeof v.id === 'string' && (v.type === DM || v.type === GROUP_DM)) return v.id
			if (typeof v === 'string' && /channel/i.test(keys[i]) && /^\d{15,}$/.test(v) && isDm(v)) return v
		}
	}

	function decorateMenu(result) {
		try {
			var props = result && result.props
			if (!props || !Array.isArray(props.items) || props.items.length < 2) return result
			var id = dmOf(props)
			if (!id) return result
			if (props.items.some(function (item) { return item && item.__pinDms })) return result
			var template = props.items.find(function (item) { return item && typeof item.label === 'string' })
			if (!template) return result
			var item = Object.assign({}, template, { label: isPinned(id) ? 'Unpin DM' : 'Pin DM', __pinDms: true })
			;['id', 'key', 'testID', 'nativeID', 'index', 'state'].forEach(function (n) { delete item[n] })
			var run = function () {
				try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
				setTimeout(function () { toggle(id) }, 0)
			}
			;['action', 'onPress', 'onSelect', 'onClick', 'callback', 'handler'].forEach(function (n) { if (n in template) item[n] = run })
			var icon = valenced.assets.getAssetIdByName('PinIcon')
			if (icon == null) icon = valenced.assets.getAssetIdByName('ic_pin')
			if (icon != null && 'iconSource' in template) item.iconSource = icon
			status.menus++
			changed()
			return valenced.react.React.cloneElement(result, { items: [item].concat(props.items) })
		} catch (e) {
			return result
		}
	}

	function installMenuHook(cleanup) {
		var f = finders()
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, decorateMenu))
		})
	}

	// ---- Settings ----------------------------------------------------------------------------------
	function SettingsComponent(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		storage = props.api.jsonStorage
		var data = Object.assign({}, defaults, storage.use())
		var tick = React.useState(0)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])
		var chosen = Array.isArray(data.pins) ? data.pins : []
		var all = allDmIds()
		var search = React.useState('')
		var q = String(search[0]).toLowerCase().trim()
		function row(label, subLabel, extra) {
			return h(Design.TableRow, Object.assign({ key: String(label) + (extra && extra.key || ''), label: label, subLabel: subLabel }, extra || {}))
		}
		var pinnedRows = chosen.map(function (id, i) {
			return h(
				Design.TableRow,
				{ key: 'p' + id, label: channelLabel(id), subLabel: 'Pinned #' + (i + 1) + ' · tap to unpin', onPress: function () { unpin(id) } },
			)
		})
		var moves = chosen.length > 1
			? chosen.map(function (id, i) {
					return h(
						RN.View,
						{ key: 'm' + id, style: { flexDirection: 'row', gap: 8, paddingVertical: 4 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↑ ' + channelLabel(id).slice(0, 18), size: 'sm', variant: 'secondary', onPress: function () { move(id, -1) } })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↓ ' + channelLabel(id).slice(0, 18), size: 'sm', variant: 'secondary', onPress: function () { move(id, 1) } })),
					)
			  })
			: []
		var others = all.filter(function (id) { return chosen.indexOf(id) < 0 && (!q || channelLabel(id).toLowerCase().indexOf(q) >= 0) }).slice(0, 60)
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Pinned (' + chosen.length + ')' },
					pinnedRows.length ? pinnedRows : [h(Design.TableRow, { key: 'none', label: 'Nothing pinned yet', subLabel: 'Hold a DM and choose Pin DM, or pick one below.' })],
				),
				moves.length ? h(Design.Stack, { spacing: 4 }, h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Move a pinned chat up or down'), moves) : null,
				h(Design.TextInput, { label: 'Search your DMs', placeholder: 'Search', size: 'md', value: search[0], onChange: function (v) { search[1](v) } }),
				h(
					Design.TableRowGroup,
					{ title: 'Your DMs' },
					others.length
						? others.map(function (id) { return h(Design.TableRow, { key: 'o' + id, label: channelLabel(id), subLabel: 'Tap to pin', onPress: function () { pin(id) } }) })
						: [h(Design.TableRow, { key: 'empty', label: all.length ? 'No match' : 'No DMs found', subLabel: all.length ? 'Try another search.' : 'Open the DMs tab once so Discord loads the list, then come back.' })],
				),
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					row('DM list', status.store + (status.hooks.length ? ' · hooked: ' + status.hooks.join(', ') : ' · not hooked'), { key: 'store' }),
					row('Hold-down menu', status.menus ? 'Pin DM was added ' + status.menus + ' time(s)' : 'Not seen yet. Hold a DM in the list.', { key: 'menu' }),
					status.error ? row('Problem', status.error, { key: 'error' }) : null,
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			storage = api.jsonStorage
			function attempt(label, step) { try { step() } catch (e) { status.error = label + ': ' + String((e && e.message) || e).slice(0, 70) } }
			attempt('store', function () { installStoreHooks(api.cleanup) })
			attempt('menu', function () { installMenuHook(api.cleanup) })
			api.cleanup(function () { memo = {}; listeners = []; setTimeout(function () { try { var s = sortStore(); if (s && s.emitChange) s.emitChange() } catch (e) {} }, 0) })
			setTimeout(refreshList, 1500)
		},
	})
	return exports
})({})
