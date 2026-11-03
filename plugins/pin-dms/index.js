(function (exports) {
	/*
	 * Pin DMs for Valenced.
	 * The idea comes from PinDMs for Vencord and BetterDiscord. The code is written from scratch for Valenced.
	 * Pinned chats go to the top of the DM list. They can be put in coloured sections that can be folded away.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var defaults = { pinsJson: '[]', sectionsJson: '[]', assignJson: '{}', pins: [] }
	var DM = 1
	var GROUP_DM = 3
	var METHODS = ['getPrivateChannelIds', 'getSortedChannels']
	var EDIT_KEY = 'marklong.pin-dms.edit'
	var MENU_KEY = 'marklong.pin-dms.menu'
	var PRESETS = [
		'#1abc9c', '#2ecc71', '#3498db', '#9b59b6', '#e91e63', '#f1c40f', '#e67e22', '#e74c3c', '#95a5a6', '#607d8b',
		'#11806a', '#1f8b4c', '#206694', '#71368a', '#ad1457', '#c27c0e', '#a84300', '#992d22', '#979c9f', '#546e7a',
	]

	var storage
	var listeners = []
	var status = { store: 'not found', hooks: [], menus: 0, list: 'not seen yet', headers: false, error: '', reordered: 0, lists: 0, headerLists: 0, unmatched: [], shapes: [], listKey: [], rowLists: [], activity: {}, rowHeaders: 0 }
	var memo = {}

	function finders() { return valenced.modules.finders }
	function stores() { return valenced.discord.flux.Stores }
	function sheets() { return valenced.discord.actions.ActionSheetActionCreators }
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
	function parse(text, fallback) {
		try { var v = JSON.parse(text); return v === null || v === undefined ? fallback : v } catch (e) { return fallback }
	}

	// ---- What is saved -----------------------------------------------------------------------------
	// Everything is saved as text, so saving always replaces the old value and nothing is merged by accident.
	function read() {
		var s = (storage && storage.cache) || {}
		var pinsText = s.pinsJson !== undefined ? s.pinsJson : s.pins ? JSON.stringify(s.pins) : '[]' // version 1.0 saved a plain list
		var pins = parse(pinsText, [])
		var sections = parse(s.sectionsJson !== undefined ? s.sectionsJson : '[]', [])
		var assign = parse(s.assignJson !== undefined ? s.assignJson : '{}', {})
		return {
			pins: Array.isArray(pins) ? pins.filter(function (x) { return typeof x === 'string' }) : [],
			sections: Array.isArray(sections) ? sections.filter(function (x) { return x && typeof x.id === 'string' }) : [],
			assign: assign && typeof assign === 'object' && !Array.isArray(assign) ? assign : {},
		}
	}
	function commit(state) {
		memo = {}
		var patch = { pinsJson: JSON.stringify(state.pins), sectionsJson: JSON.stringify(state.sections), assignJson: JSON.stringify(state.assign) }
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		refreshList()
	}
	function sectionOf(state, id) {
		var sid = state.assign[id]
		if (!sid) return undefined
		for (var i = 0; i < state.sections.length; i++) if (state.sections[i].id === sid) return state.sections[i]
	}
	function cleanColor(text) {
		var m = /^#?([0-9a-f]{6})$/i.exec(String(text || '').trim())
		return m ? '#' + m[1].toLowerCase() : null
	}
	function newId() { return 's' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36) }

	function sortStore() {
		var s = stores().PrivateChannelSortStore
		if (s) return s
		var f = finders()
		return f.lookupModule(f.filters.withProps('getPrivateChannelIds'))[0]
	}

	// ---- Putting pinned chats first, section by section ---------------------------------------------
	/** The chat an entry stands for. Rows of the DM list can carry the chat in a few places. */
	function idOf(entry, depth) {
		depth = depth || 0
		if (typeof entry === 'string') return looksLikeChat(entry) ? entry : undefined
		if (!entry || typeof entry !== 'object' || depth > 2) return undefined
		var keys = ['id', 'channel_id', 'channelId']
		for (var i = 0; i < keys.length; i++) {
			var v = entry[keys[i]]
			if (typeof v === 'string' && looksLikeChat(v)) return v
		}
		var inner = ['channel', 'item', 'data', 'row', 'dm']
		for (var j = 0; j < inner.length; j++) {
			if (entry[inner[j]] && typeof entry[inner[j]] === 'object') {
				var found = idOf(entry[inner[j]], depth + 1)
				if (found) return found
			}
		}
		return undefined
	}
	var deepCache = typeof WeakMap === 'function' ? new WeakMap() : null
	/** Last resort: a row that carries a chat id somewhere I do not look by name. */
	function deepId(entry) {
		if (!entry || typeof entry !== 'object' || !deepCache) return undefined
		if (deepCache.has(entry)) return deepCache.get(entry)
		var found
		try {
			var text = JSON.stringify(entry, function (k, v) { return typeof v === 'function' ? undefined : v }) || ''
			var all = text.slice(0, 3000).match(/\d{17,20}/g) || []
			for (var i = 0; i < all.length; i++) { if (isDm(all[i])) { found = all[i]; break } }
		} catch (e) {}
		deepCache.set(entry, found)
		return found
	}
	function chatId(entry) { return idOf(entry, 0) || deepId(entry) }
	function looksLikeChat(id) {
		return /^\d{15,}$/.test(id) || isDm(id)
	}

	/** Pinned chats with no section first, then each section's chats in order, then everything else. */
	function pinnedOrder(ids) {
		var state = read()
		var out = []
		var seen = {}
		state.pins.forEach(function (id) { if (ids.indexOf(id) >= 0 && !sectionOf(state, id) && !seen[id]) { out.push(id); seen[id] = 1 } })
		state.sections.forEach(function (section) {
			state.pins.forEach(function (id) { if (ids.indexOf(id) >= 0 && state.assign[id] === section.id && !seen[id]) { out.push(id); seen[id] = 1 } })
		})
		return out
	}

	var lastIds = []
	function labelOf(entry) {
		try {
			if (typeof entry === 'string') return 's' + entry.slice(-4)
			if (entry && typeof entry === 'object') return 'o' + String(entry.name || entry.id || '?').slice(0, 6)
		} catch (e) {}
		return typeof entry
	}
	function pinnedFirst(list, method) {
		var out = pinnedFirstInner(list, method)
		try { if (/getPrivateChannelIds/.test(method) && Array.isArray(out) && typeof out[0] === 'string') lastIds = out } catch (e) {}
		try {
			var a = status.activity[method] || (status.activity[method] = { calls: 0, moved: 0, len: 0, pins: 0 })
			a.calls++
			if (Array.isArray(list)) {
				a.len = list.length
				a.pins = list.filter(function (e) { var id = idOf(e, 0); return id && read().pins.indexOf(id) >= 0 }).length
				if (out !== list) { a.moved++; a.after = out.slice(0, 3).map(labelOf).join(',') }
				a.before = list.slice(0, 3).map(labelOf).join(',')
			}
			if (a.calls <= 3 || a.calls % 20 === 0) changed()
		} catch (e) {}
		return out
	}
	function pinnedFirstInner(list, method) {
		var state = read()
		if (!Array.isArray(list) || !state.pins.length) return list
		var ids = list.map(function (entry) { return idOf(entry, 0) })
		var key = method + '|' + JSON.stringify(state) + '|' + ids.join(',')
		if (memo[method] && memo[method].key === key) return memo[method].result
		var byId = {}
		list.forEach(function (entry) { var id = idOf(entry); if (id) byId[id] = entry })
		var top = pinnedOrder(ids).map(function (id) { return byId[id] }).filter(function (entry) { return entry !== undefined })
		if (!top.length || top.length + list.filter(function (entry) { return top.indexOf(entry) < 0 }).length !== list.length) return list
		var chosen = {}
		pinnedOrder(ids).forEach(function (id) { chosen[id] = 1 })
		var result = top.concat(list.filter(function (entry) { return !chosen[idOf(entry)] }))
		memo[method] = { key: key, result: result }
		status.reordered++
		return result
	}

	function methodNames(obj) {
		var names = {}
		var o = obj
		var guard = 0
		while (o && o !== Object.prototype && guard++ < 6) {
			Object.getOwnPropertyNames(o).forEach(function (n) { names[n] = true })
			o = Object.getPrototypeOf(o)
		}
		return Object.keys(names)
	}

	/** Methods of the stores that give out the list of DMs, in whatever form. */
	var LIST_METHOD = /^(get)?(Mutable)?(Sorted)?(Private)?(DM)?Channels?(Ids)?$|^getSortedPrivateChannels$|^getPrivateChannelIds$|^getDMs?$/i

	function hookStore(store, label, cleanup) {
		if (!store) return
		methodNames(store).forEach(function (method) {
			if (!LIST_METHOD.test(method.replace(/^get/, 'get')) || typeof store[method] !== 'function') return
			if (!/private|sorted|dm/i.test(method)) return
			try {
				cleanup(valenced.patcher.after(store, method, function (result) { try { return pinnedFirst(result, label + '.' + method) } catch (e) { return result } }))
				status.hooks.push(label + '.' + method)
			} catch (e) {
				status.error = String((e && e.message) || e).slice(0, 80)
			}
		})
	}

	function installStoreHooks(cleanup) {
		var store = sortStore()
		if (store) status.store = 'found'
		hookStore(store, 'SortStore', cleanup)
		try { hookStore(stores().ChannelStore, 'ChannelStore', cleanup) } catch (e) {}
	}

	function refreshList() {
		memo = {}
		var store = sortStore()
		try { if (store && typeof store.emitChange === 'function') store.emitChange() } catch (e) {}
		changed()
	}

	// ---- Changing things -------------------------------------------------------------------------------
	function isPinned(id) { return read().pins.indexOf(id) >= 0 }
	function pin(id, sectionId) {
		var state = read()
		if (state.pins.indexOf(id) < 0) state.pins.push(id)
		state.assign[id] = sectionId || ''
		commit(state)
	}
	function unpin(id) {
		var state = read()
		state.pins = state.pins.filter(function (x) { return x !== id })
		state.assign[id] = ''
		commit(state)
	}
	function moveIn(id, by) {
		var state = read()
		var group = state.pins.filter(function (x) { return (state.assign[x] || '') === (state.assign[id] || '') })
		var at = group.indexOf(id)
		var to = at + by
		if (at < 0 || to < 0 || to >= group.length) return
		var other = group[to]
		var a = state.pins.indexOf(id)
		var b = state.pins.indexOf(other)
		state.pins[a] = other
		state.pins[b] = id
		commit(state)
	}
	function saveSection(id, name, color) {
		var state = read()
		var cleaned = String(name || '').trim().slice(0, 30)
		if (!cleaned) return toast('Give the section a name')
		var hex = cleanColor(color)
		if (!hex) return toast('That colour is not valid. Use something like #00d4ff')
		var existing = state.sections.filter(function (s) { return s.id === id })[0]
		if (existing) { existing.name = cleaned; existing.color = hex } else state.sections.push({ id: newId(), name: cleaned, color: hex, collapsed: false })
		commit(state)
		return true
	}
	function deleteSection(id) {
		var state = read()
		state.sections = state.sections.filter(function (s) { return s.id !== id })
		Object.keys(state.assign).forEach(function (k) { if (state.assign[k] === id) state.assign[k] = '' })
		commit(state)
	}
	function moveSection(id, by) {
		var state = read()
		var at = state.sections.findIndex(function (s) { return s.id === id })
		var to = at + by
		if (at < 0 || to < 0 || to >= state.sections.length) return
		state.sections.splice(to, 0, state.sections.splice(at, 1)[0])
		commit(state)
	}
	function toggleCollapsed(id) {
		var state = read()
		var section = state.sections.filter(function (s) { return s.id === id })[0]
		if (!section) return
		section.collapsed = !section.collapsed
		commit(state)
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
		try {
			var ids = store && typeof store.getPrivateChannelIds === 'function' ? store.getPrivateChannelIds() : []
			return (ids || []).map(chatId).filter(Boolean)
		} catch (e) { return [] }
	}
	function isDm(id) {
		try {
			var ch = stores().ChannelStore.getChannel(id)
			return !!ch && (ch.type === DM || ch.type === GROUP_DM)
		} catch (e) { return false }
	}

	// ---- Colours ----------------------------------------------------------------------------------------
	function hslToHex(hue, sat, light) {
		var s = sat / 100
		var l = light / 100
		var a = s * Math.min(l, 1 - l)
		function f(n) {
			var k = (n + hue / 30) % 12
			var c = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1)
			var hex = Math.round(255 * c).toString(16)
			return hex.length < 2 ? '0' + hex : hex
		}
		return '#' + f(0) + f(8) + f(4)
	}
	function hexToHue(hex) {
		var n = parseInt(String(hex).replace('#', ''), 16)
		var r = ((n >> 16) & 255) / 255
		var g = ((n >> 8) & 255) / 255
		var b = (n & 255) / 255
		var max = Math.max(r, g, b)
		var min = Math.min(r, g, b)
		if (max === min) return 0
		var d = max - min
		var hue = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
		return Math.round(hue * 60) % 360
	}
	var HUES = []
	for (var hh = 0; hh < 360; hh += 15) HUES.push(hh)
	var SHADES = [[85, 100], [72, 100], [60, 90], [50, 100], [42, 85], [34, 70], [26, 60], [18, 50]] // [lightness, saturation]

	// ---- Sheets ------------------------------------------------------------------------------------------
	/** A sheet whose buttons stay at the bottom: `footer` is not part of the scrolling part. */
	function SheetBody(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var size = RN.useWindowDimensions ? RN.useWindowDimensions() : { height: 800 }
		return h(
			Design.ActionSheet,
			null,
			h(RN.ScrollView, { style: { maxHeight: Math.round(size.height * (props.footer ? 0.62 : 0.8)) }, keyboardShouldPersistTaps: 'handled' }, h(Design.Stack, { spacing: 16, style: { padding: 16 } }, props.children)),
			props.footer ? h(RN.View, { style: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18, gap: 8 } }, props.footer) : null,
		)
	}
	function openSheet(key, Component, props) {
		sheets().openLazy(Promise.resolve({ default: function () { return h(Component, props) } }), key, {})
	}

	/** Edit Category: a name and a colour, like the desktop plugin. */
	function EditSection(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var section = props.section
		var nameState = React.useState(section ? section.name : '')
		var colorState = React.useState(section ? section.color : PRESETS[2])
		var hexState = React.useState(section ? section.color : PRESETS[2])
		var hueState = React.useState(hexToHue(section ? section.color : PRESETS[2]))
		var color = colorState[0]
		function pick(hex) { colorState[1](hex); hexState[1](hex); hueState[1](hexToHue(hex)) }
		var hue = hueState[0]
		var footer = [
			h(
				RN.View,
				{ key: 'row', style: { flexDirection: 'row', gap: 10 } },
				h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Cancel', variant: 'secondary', onPress: function () { sheets().hideActionSheet(EDIT_KEY) } })),
				h(RN.View, { style: { flex: 1 } }, h(Design.Button, {
					text: 'Save',
					variant: 'primary',
					onPress: function () {
						if (saveSection(section && section.id, nameState[0], cleanColor(hexState[0]) || color)) sheets().hideActionSheet(EDIT_KEY)
					},
				})),
			),
			section ? h(Design.Button, { key: 'del', text: 'Delete section', variant: 'destructive', onPress: function () { deleteSection(section.id); sheets().hideActionSheet(EDIT_KEY) } }) : null,
		]
		return h(
			SheetBody,
			{ footer: footer },
			h(Design.Text, { variant: 'heading-lg/bold' }, section ? 'Edit Category' : 'New Category'),
			h(Design.TextInput, { label: 'Name', placeholder: 'Boys', size: 'md', maxLength: 30, value: nameState[0], onChange: function (v) { nameState[1](v) } }),
			h(Design.Text, { variant: 'text-md/semibold' }, 'Color'),
			h(
				RN.View,
				{ style: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 } },
				PRESETS.map(function (hex) {
					return h(
						RN.Pressable,
						{ key: hex, onPress: function () { pick(hex) } },
						h(RN.View, { style: { width: 30, height: 30, borderRadius: 15, backgroundColor: hex, borderWidth: color === hex ? 3 : 0, borderColor: '#ffffff' } }),
					)
				}),
			),
			h(Design.Text, { variant: 'text-md/semibold' }, 'Pick any color'),
			h(
				RN.View,
				{ style: { gap: 8 } },
				h(
					RN.View,
					{ style: { flexDirection: 'row', height: 34, borderRadius: 10, overflow: 'hidden' } },
					HUES.map(function (hv) {
						var on = Math.abs(hv - hue) < 8 || Math.abs(hv - hue) > 352
						return h(RN.Pressable, { key: 'hue' + hv, style: { flex: 1 }, onPress: function () { hueState[1](hv) } }, h(RN.View, { style: { flex: 1, backgroundColor: hslToHex(hv, 100, 50), borderBottomWidth: on ? 6 : 0, borderBottomColor: '#ffffff' } }))
					}),
				),
				h(
					RN.View,
					{ style: { borderRadius: 10, overflow: 'hidden' } },
					SHADES.map(function (sh) {
						return h(
							RN.View,
							{ key: 'row' + sh[0], style: { flexDirection: 'row', height: 30 } },
							[100, 80, 60, 40, 20, 0].map(function (sat) {
								var hex = hslToHex(hue, Math.round(sh[1] * sat / 100), sh[0])
								var on = hex === color
								return h(RN.Pressable, { key: 'c' + sat, style: { flex: 1 }, onPress: function () { colorState[1](hex); hexState[1](hex) } }, h(RN.View, { style: { flex: 1, backgroundColor: hex, borderWidth: on ? 3 : 0, borderColor: '#ffffff' } }))
							}),
						)
					}),
				),
			),
			h(
				RN.View,
				{ style: { flexDirection: 'row', alignItems: 'center', gap: 12 } },
				h(RN.View, { style: { width: 44, height: 44, borderRadius: 8, backgroundColor: cleanColor(hexState[0]) || '#000000' } }),
				h(RN.View, { style: { flex: 1 } }, h(Design.TextInput, { label: 'Or type a color code', placeholder: '#00d4ff', size: 'md', value: hexState[0], onChange: function (v) { hexState[1](v); var c = cleanColor(v); if (c) { colorState[1](c); hueState[1](hexToHue(c)) } } })),
			),
		)
	}
	function openEditSection(section) { openSheet(EDIT_KEY, EditSection, { section: section }) }

	/** What to do with one chat: pin it into a section, move it, or unpin it. */
	function ChatMenu(props) {
		var Design = valenced.discord.design.Design
		var id = props.id
		var state = read()
		var pinned = state.pins.indexOf(id) >= 0
		var current = state.assign[id] || ''
		function close() { try { sheets().hideActionSheet(MENU_KEY) } catch (e) {} }
		function row(label, sub, onPress) { return h(Design.TableRow, { key: label + sub, label: label, subLabel: sub, onPress: onPress }) }
		var rows = []
		rows.push(row(pinned ? (current ? 'Keep pinned, no section' : 'Pinned, no section') : 'Pin to the top', 'Without a section', function () { pin(id, ''); toast('Pinned'); close() }))
		state.sections.forEach(function (s) { rows.push(row((current === s.id ? '✓ ' : '') + s.name, 'Pin into this section', function () { pin(id, s.id); toast('Pinned in ' + s.name); close() })) })
		if (pinned) {
			rows.push(row('Move up', 'Within its group', function () { moveIn(id, -1) }))
			rows.push(row('Move down', 'Within its group', function () { moveIn(id, 1) }))
			rows.push(row('Unpin', 'Back to the normal list', function () { unpin(id); toast('Unpinned'); close() }))
		}
		return h(SheetBody, null, h(Design.Text, { variant: 'heading-lg/bold', numberOfLines: 2 }, channelLabel(id)), h(Design.TableRowGroup, null, rows))
	}
	function openChatMenu(id) { openSheet(MENU_KEY, ChatMenu, { id: id }) }

	// ---- Section headers in the DM list --------------------------------------------------------------
	function SectionHeader(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var s = props.section
		var rest = !!s.rest
		var line = { flex: 1, height: 2, borderRadius: 1, backgroundColor: s.color, opacity: rest ? 0.35 : 0.75 }
		return h(
			RN.Pressable,
			rest ? {} : { onPress: function () { toggleCollapsed(s.id) }, onLongPress: function () { openEditSection(s) }, delayLongPress: 350 },
			h(
				RN.View,
				{ style: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 } },
				h(RN.View, { style: line }),
				h(Design.Text, { variant: 'text-md/bold', style: { color: s.color, marginHorizontal: 12, letterSpacing: 1 } }, String(s.name).toUpperCase()),
				h(RN.View, { style: line }),
				rest ? null : h(Design.Text, { variant: 'text-md/bold', style: { color: s.color, marginLeft: 10 } }, s.collapsed ? '▸' : '▾'),
			),
		)
	}

	/** Puts the pinned chats first among the chats of a list, leaving every other row where it was. */
	function reorderRows(data) {
		var state = read()
		if (!state.pins.length) return data
		var slots = []
		var entries = []
		data.forEach(function (entry, i) {
			var id = chatId(entry)
			if (id) { slots.push(i); entries.push(entry) }
		})
		if (entries.length < 2) return data
		var ids = entries.map(chatId)
		var first = pinnedOrder(ids)
		if (!first.length) return data
		var byId = {}
		entries.forEach(function (entry) { byId[chatId(entry)] = entry })
		var chosen = {}
		first.forEach(function (id) { chosen[id] = 1 })
		var ordered = first.map(function (id) { return byId[id] }).concat(entries.filter(function (entry) { return !chosen[chatId(entry)] }))
		var same = ordered.every(function (entry, i) { return entry === entries[i] })
		if (same) return data
		var out = data.slice()
		slots.forEach(function (slot, i) { out[slot] = ordered[i] })
		status.reordered++
		return out
	}

	/** The same list with a header in front of each section, and a folded section's chats left out. */
	function withHeaders(data) {
		var state = read()
		if (!state.sections.length) return data
		var out = []
		var shown = {}
		var restShown = false
		var anyPinned = false
		data.forEach(function (entry) {
			var id = chatId(entry)
			var pinnedHere = !!id && state.pins.indexOf(id) >= 0
			var section = pinnedHere ? sectionOf(state, id) : undefined
			if (pinnedHere) anyPinned = true
			if (id && !pinnedHere && anyPinned && !restShown) {
				restShown = true
				out.push({ __pinHeader: true, id: 'pin-section-rest', section: { id: 'rest', name: 'Direct messages', color: '#80848e', rest: true } })
			}
			if (section) {
				if (!shown[section.id]) {
					shown[section.id] = true
					out.push({ __pinHeader: true, id: 'pin-section-' + section.id, section: section })
				}
				if (section.collapsed) return
			}
			out.push(entry)
		})
		return out
	}

	/** Lists of rows whose entries hold a chat in a place this plugin does not know yet. Shown in the settings. */
	function noteUnmatched(props) {
		try {
			if (status.unmatched.length >= 3) return
			var state = read()
			var first = props.data[0]
			if (!first || typeof first !== 'object') return
			var text = JSON.stringify(first, function (k, v) { return typeof v === 'function' ? undefined : v }).slice(0, 2000)
			var hit = state.pins.some(function (id) { return text.indexOf(id) >= 0 })
			if (!hit) return
			var shape = Object.keys(first).slice(0, 8).join(', ')
			if (status.unmatched.indexOf(shape) < 0) { status.unmatched.push(shape); changed() }
		} catch (e) {}
	}

	var LIST_PROPS = ['data', 'items', 'rows', 'listData', 'channels', 'channelIds', 'privateChannelIds', 'dms']
	var scanned = typeof WeakSet === 'function' ? new WeakSet() : null

	function listProp(props) {
		for (var i = 0; i < LIST_PROPS.length; i++) {
			var list = props[LIST_PROPS[i]]
			if (Array.isArray(list) && list.length >= 2 && list.slice(0, 10).map(chatId).some(Boolean)) return LIST_PROPS[i]
		}
		return null
	}

	/** Diagnostics: remember where an array holding a pinned chat shows up, in case it is not a list I know. */
	function scanShapes(el, props) {
		try {
			if (status.shapes.length >= 4 || !scanned) return
			var state = read()
			if (!state.pins.length) return
			var keys = Object.keys(props)
			if (keys.length > 40) return
			for (var i = 0; i < keys.length; i++) {
				var v = props[keys[i]]
				if (keys[i] === 'children' || !Array.isArray(v) || v.length < 4 || scanned.has(v)) continue
				scanned.add(v)
				var first = v[0]
				var text = typeof first === 'string' ? first : (first && typeof first === 'object') ? JSON.stringify(first, function (k, x) { return typeof x === 'function' ? undefined : x }).slice(0, 1500) : ''
				var found = state.pins.some(function (id) { return text.indexOf(id) >= 0 }) || v.slice(0, 20).some(function (e) { var t = typeof e === 'string' ? e : (e && typeof e === 'object') ? JSON.stringify(e, function (k, x) { return typeof x === 'function' ? undefined : x }).slice(0, 600) : ''; return state.pins.some(function (id) { return t.indexOf(id) >= 0 }) })
				if (!found) continue
				var tname = el && el.type && (el.type.displayName || el.type.name || (el.type.type && el.type.type.name) || (typeof el.type === 'string' ? el.type : '?'))
				var line = String(tname) + '.' + keys[i] + ' (' + (typeof first === 'object' && first ? Object.keys(first).slice(0, 6).join('/') : typeof first) + '; also: ' + keys.filter(function (k) { return k !== keys[i] }).slice(0, 8).join(',') + ')'
				if (status.shapes.indexOf(line) < 0) { status.shapes.push(line); changed() }
			}
		} catch (e) {}
	}

	/** Diagnostics: what the entries of a long list look like. */
	function noteRowList(el, props) {
		try {
			if (status.rowLists.length >= 4) return
			var list = props.data
			if (!Array.isArray(list) || list.length < 5 || typeof props.renderItem !== 'function') return
			var tname = el && el.type && (el.type.displayName || el.type.name || '?')
			var sample = list.slice(0, 2).map(function (e) {
				if (!e || typeof e !== 'object') return typeof e + ':' + String(e).slice(0, 12)
				return Object.keys(e).slice(0, 7).map(function (k) { var v = e[k]; return k + (typeof v === 'string' ? '=' + v.slice(0, 10) : typeof v === 'object' && v ? '{}' : '') }).join('/')
			}).join(' ; ')
			var line = tname + ' x' + list.length + ' [' + sample + ']'
			if (status.rowLists.indexOf(line) < 0) { status.rowLists.push(line); changed() }
		} catch (e) {}
	}

	/** Rows: put a section's heading above its first chat, and fold the chats of a closed section away. */
	function decorateRow(result) {
		try {
			var props = result && result.props
			if (!props || typeof props.onLongPress !== 'function' || !props.children || !result.type) return result
			var tn = result.type.displayName || result.type.name || ''
			if (!/Pressable/.test(tn)) return result
			var state = read()
			if (!state.pins.length || !state.sections.length || !lastIds.length) return result
			var id = deepId(props.children)
			if (!id) return result
			var React = valenced.react.React
			var RN = valenced.react.ReactNative
			var pinned = state.pins.indexOf(id) >= 0
			var parts = []
			var hide = false
			var section = pinned ? sectionOf(state, id) : undefined
			if (section) {
				var firstOf
				for (var i = 0; i < lastIds.length; i++) {
					if (state.pins.indexOf(lastIds[i]) >= 0 && state.assign[lastIds[i]] === section.id) { firstOf = lastIds[i]; break }
				}
				if (firstOf === id) parts.push(React.createElement(SectionHeader, { key: 'pin-head', section: section }))
				if (section.collapsed) hide = true
			} else if (!pinned) {
				var firstRest
				for (var j = 0; j < lastIds.length; j++) { if (state.pins.indexOf(lastIds[j]) < 0) { firstRest = lastIds[j]; break } }
				if (firstRest === id) parts.push(React.createElement(SectionHeader, { key: 'pin-rest', section: { id: 'rest', name: 'Direct messages', color: '#80848e', rest: true } }))
			}
			if (!parts.length && !hide) return result
			status.rowHeaders++
			if (!status.headers) { status.headers = true; status.list = 'found, headers added'; changed() }
			if (!hide) parts.push(result)
			return React.createElement(RN.View, { key: result.key }, parts)
		} catch (e) {
			return result
		}
	}

	/** Recognises the list the DM tab draws: it gets the pinned chats first, and the section headers. */
	function decorateList(result) {
		try {
			var props = result && result.props
			if (!props || typeof props !== 'object') return result
			var state = read()
			if (!state.pins.length) return result
			var key = listProp(props)
			if (!key) { scanShapes(result, props); noteRowList(result, props); return result }
			var list = props[key]
			if (list.some(function (e) { return e && e.__pinHeader })) return result
			var ids = list.map(chatId).filter(Boolean)
			if (ids.length < 2) return result
			if (ids.length < list.length * 0.5) return result
			status.lists++
			if (status.listKey.indexOf(key) < 0) { status.listKey.push(key); changed() }
			var ordered = reorderRows(list)
			var canHead = typeof props.renderItem === 'function' && key === 'data' && state.sections.length
			var data = canHead ? withHeaders(ordered) : ordered
			if (data === list) return result
			var next = {}
			next[key] = data
			if (canHead && data.some(function (e) { return e && e.__pinHeader })) {
				var original = props.renderItem
				next.renderItem = function (info) {
					var item = info && info.item
					if (item && item.__pinHeader) return h(SectionHeader, { section: item.section })
					return original.apply(this, arguments)
				}
				next.extraData = { original: props.extraData, sections: JSON.stringify(state.sections) }
				if (typeof props.keyExtractor === 'function') {
					var keyOf = props.keyExtractor
					next.keyExtractor = function (item) { return item && item.__pinHeader ? item.id : keyOf.apply(this, arguments) }
				}
				if (typeof props.getItemType === 'function') {
					var typeOf = props.getItemType
					next.getItemType = function (item) { return item && item.__pinHeader ? 'pin-section-header' : typeOf.apply(this, arguments) }
				}
				if (!status.headers) { status.headers = true; status.list = 'found, headers added'; changed() }
				status.headerLists++
			}
			return valenced.react.React.cloneElement(result, next)
		} catch (e) {
			return result
		}
	}

	// ---- The hold-down menu ------------------------------------------------------------------------
	function dmOf(props) {
		var keys = Object.keys(props)
		for (var i = 0; i < keys.length; i++) {
			var v = props[keys[i]]
			if (keys[i] === 'message') return undefined
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
			var state = read()
			var pinned = state.pins.indexOf(id) >= 0
			var item = Object.assign({}, template, { label: pinned ? 'Unpin DM' : state.sections.length ? 'Pin DM…' : 'Pin DM', __pinDms: true })
			;['id', 'key', 'testID', 'nativeID', 'index', 'state'].forEach(function (n) { delete item[n] })
			var run = function () {
				try { sheets().hideAllActionSheets() } catch (e) {}
				setTimeout(function () {
					if (pinned) { unpin(id); toast('Unpinned') }
					else if (state.sections.length) openChatMenu(id)
					else { pin(id, ''); toast('Pinned to the top') }
				}, 0)
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

	function installElementHooks(cleanup) {
		var f = finders()
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		function both(el) { return decorateRow(decorateList(decorateMenu(el))) }
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, both))
		})
	}

	// ---- Settings ----------------------------------------------------------------------------------
	function SettingsComponent(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		storage = props.api.jsonStorage
		storage.use()
		var tick = React.useState(0)
		var search = React.useState('')
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])
		var state = read()
		var all = allDmIds()
		var q = String(search[0]).toLowerCase().trim()
		function dot(color) { return h(RN.View, { style: { width: 14, height: 14, borderRadius: 7, backgroundColor: color } }) }

		var sectionRows = state.sections.map(function (s, i) {
			var count = state.pins.filter(function (id) { return state.assign[id] === s.id }).length
			return h(Design.TableRow, {
				key: 'sec' + s.id,
				label: s.name,
				subLabel: count + ' chat' + (count === 1 ? '' : 's') + (s.collapsed ? ' · folded' : '') + ' · tap to edit',
				icon: dot(s.color),
				onPress: function () { openEditSection(s) },
			})
		})
		var sectionMoves = state.sections.length > 1
			? state.sections.map(function (s) {
					return h(
						RN.View,
						{ key: 'sm' + s.id, style: { flexDirection: 'row', gap: 8, paddingVertical: 3 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↑ ' + s.name, size: 'sm', variant: 'secondary', onPress: function () { moveSection(s.id, -1) } })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↓ ' + s.name, size: 'sm', variant: 'secondary', onPress: function () { moveSection(s.id, 1) } })),
					)
			  })
			: []

		var pinnedRows = state.pins.map(function (id) {
			var s = sectionOf(state, id)
			return h(Design.TableRow, {
				key: 'pin' + id,
				label: channelLabel(id),
				subLabel: (s ? s.name : 'No section') + ' · tap for options',
				icon: s ? dot(s.color) : undefined,
				onPress: function () { openChatMenu(id) },
			})
		})
		var others = all.filter(function (id) { return state.pins.indexOf(id) < 0 && (!q || channelLabel(id).toLowerCase().indexOf(q) >= 0) }).slice(0, 60)

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Sections (' + state.sections.length + ')' },
					sectionRows.concat([h(Design.TableRow, { key: 'newSection', label: 'New section', subLabel: 'A coloured heading you can fold, like Girls or Boys', onPress: function () { openEditSection(null) } })]),
				),
				sectionMoves.length ? h(Design.Stack, { spacing: 4 }, h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Move a section up or down'), sectionMoves) : null,
				h(
					Design.TableRowGroup,
					{ title: 'Pinned (' + state.pins.length + ')' },
					pinnedRows.length ? pinnedRows : [h(Design.TableRow, { key: 'none', label: 'Nothing pinned yet', subLabel: 'Hold a DM and choose Pin DM, or pick one below.' })],
				),
				h(Design.TextInput, { label: 'Search your DMs', placeholder: 'Search', size: 'md', value: search[0], onChange: function (v) { search[1](v) } }),
				h(
					Design.TableRowGroup,
					{ title: 'Your DMs' },
					others.length
						? others.map(function (id) { return h(Design.TableRow, { key: 'o' + id, label: channelLabel(id), subLabel: 'Tap to pin', onPress: function () { state.sections.length ? openChatMenu(id) : pin(id, '') } }) })
						: [h(Design.TableRow, { key: 'empty', label: all.length ? 'No match' : 'No DMs found', subLabel: all.length ? 'Try another search.' : 'Open the DMs tab once so Discord loads the list, then come back.' })],
				),
				h(
					Design.TableRowGroup,
					{ title: 'Status' },
					h(Design.TableRow, { key: 'store', label: 'DM list order', subLabel: status.store + (status.hooks.length ? ' · hooked: ' + status.hooks.join(', ') : ' · not hooked') + ' · reordered ' + status.reordered + ' time(s)' }),
					h(Design.TableRow, { key: 'list', label: 'Section headers in the list', subLabel: status.headers ? 'Working (' + (status.headerLists + status.rowHeaders) + ' time(s))' : 'Not seen yet. Pin a chat into a section, then open the DM tab. Lists with chats seen: ' + status.lists }),
					h(Design.TableRow, { key: 'lk', label: 'List props I reordered', subLabel: status.listKey.length ? status.listKey.join(', ') : 'none yet' }),
					h(Design.TableRow, { key: 'activity', label: 'Hook activity', subLabel: Object.keys(status.activity).length ? Object.keys(status.activity).map(function (m) { var a = status.activity[m]; return m + ': ' + a.calls + ' calls, ' + a.len + ' entries, ' + a.pins + ' pinned, moved ' + a.moved + (a.after ? ', ' + a.before + ' -> ' + a.after : '') }).join(' | ') : 'Nothing called yet. Open the Messages tab.' }),
					status.rowLists.length ? h(Design.TableRow, { key: 'rowlists', label: 'Long lists I saw', subLabel: status.rowLists.join(' | ') }) : null,
					status.shapes.length ? h(Design.TableRow, { key: 'shapes', label: 'Lists that hold your pinned chats', subLabel: status.shapes.join(' | ') + '. Send this to the developer.' }) : null,
					status.unmatched.length ? h(Design.TableRow, { key: 'unmatched', label: 'A list holds your pinned chats in a place I do not know', subLabel: 'Row fields: ' + status.unmatched.join(' | ') + '. Send this to the developer.' }) : null,
					h(Design.TableRow, { key: 'menu', label: 'Hold-down menu', subLabel: status.menus ? 'Added ' + status.menus + ' time(s)' : 'Not seen yet. Hold a DM in the list.' }),
					status.error ? h(Design.TableRow, { key: 'error', label: 'Problem', subLabel: status.error }) : null,
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
			attempt('elements', function () { installElementHooks(api.cleanup) })
			api.cleanup(function () {
				memo = {}
				listeners = []
				try { sheets().hideActionSheet(EDIT_KEY) } catch (e) {}
				try { sheets().hideActionSheet(MENU_KEY) } catch (e) {}
				setTimeout(function () { try { var s = sortStore(); if (s && s.emitChange) s.emitChange() } catch (e) {} }, 0)
			})
			setTimeout(refreshList, 1500)
		},
	})
	return exports
})({})
