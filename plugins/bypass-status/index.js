(function (exports) {
	/*
	 * Bypass Status for Valenced.
	 * The idea comes from Bypass Status for Equicord. The code is written from scratch for Valenced.
	 * Messages from the people, chats and servers you choose still notify you while your status is Do Not Disturb.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var VERSION = '1.0.0'
	var INSTANCE = {}
	var defaults = { bypassJson: '{"channels":[],"guilds":[],"users":[]}', banner: true }
	var DM = 1
	var GROUP_DM = 3

	var storage
	var listeners = []
	var depth = 0 // above 0 while Discord handles a message that may bypass Do Not Disturb
	var status = { hooks: [], windows: 0, overrides: 0, banners: 0, last: '', menus: 0, sheetIcons: [], error: '', dispatcher: 'not found', selfStatus: '' }

	function finders() { return valenced.modules.finders }
	function stores() { return valenced.discord.flux.Stores }
	function changed() { listeners.slice().forEach(function (l) { try { l() } catch (e) {} }) }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_BYPASS_STATUS', { text: String(text) }) } catch (e) {}
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
	function nameOf(el) {
		var t = el && el.type
		if (!t || typeof t === 'string') return ''
		var inner = t.type || t.render || t
		return t.displayName || t.name || (inner && (inner.displayName || inner.name)) || ''
	}

	// ---- What is saved ---------------------------------------------------------------------------------
	function read() {
		var s = (storage && storage.cache) || {}
		var d = parse(s.bypassJson !== undefined ? s.bypassJson : defaults.bypassJson, {})
		function list(x) { return Array.isArray(x) ? x.filter(function (v) { return typeof v === 'string' }) : [] }
		return { channels: list(d.channels), guilds: list(d.guilds), users: list(d.users) }
	}
	function commit(state) {
		var patch = { bypassJson: JSON.stringify(state) }
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		changed()
	}
	function bannerOn() {
		try { return !storage || !storage.cache || storage.cache.banner !== false } catch (e) { return true }
	}
	function has(list, id) { return list.indexOf(id) >= 0 }
	function add(list, id) { if (id && !has(list, id)) list.push(id) }
	function drop(list, id) { var i = list.indexOf(id); if (i >= 0) list.splice(i, 1) }

	// ---- Who is who ------------------------------------------------------------------------------------
	function channelOf(id) { try { return stores().ChannelStore.getChannel(id) } catch (e) { return null } }
	function isDm(ch) { return !!ch && (ch.type === DM || ch.type === GROUP_DM) }
	function selfId() {
		try { var u = stores().UserStore.getCurrentUser(); return u && u.id } catch (e) { return undefined }
	}
	function userName(id) {
		try { var u = stores().UserStore.getUser(id); return u ? u.globalName || u.global_name || u.username : null } catch (e) { return null }
	}
	function channelLabel(id) {
		var ch = channelOf(id)
		if (!ch) return 'Unknown chat (' + String(id).slice(-4) + ')'
		if (isDm(ch)) {
			if (ch.name) return ch.name
			var ids = ch.recipients || (ch.rawRecipients || []).map(function (u) { return u && u.id })
			var names = (ids || []).map(userName).filter(Boolean)
			return names.join(', ') || 'Direct message'
		}
		var g = ch.guild_id ? guildOf(ch.guild_id) : null
		return '#' + (ch.name || 'channel') + (g ? ' · ' + g.name : '')
	}
	function guildOf(id) { try { return stores().GuildStore.getGuild(id) } catch (e) { return null } }
	function guildName(id) { var g = guildOf(id); return g ? g.name : 'Server ' + String(id).slice(-4) }
	function allGuilds() {
		try {
			var g = stores().GuildStore.getGuilds()
			return Object.keys(g || {}).map(function (id) { return g[id] }).filter(function (x) { return x && x.id })
		} catch (e) { return [] }
	}
	function allDmIds() {
		try {
			var s = stores().PrivateChannelSortStore
			var ids = s && typeof s.getPrivateChannelIds === 'function' ? s.getPrivateChannelIds() : []
			return (ids || []).filter(function (id) { return typeof id === 'string' })
		} catch (e) { return [] }
	}
	function recipientOf(ch) {
		if (!ch || ch.type !== DM) return undefined
		var r = ch.recipients && ch.recipients[0]
		return typeof r === 'string' ? r : r && r.id
	}

	// ---- Changing the list -------------------------------------------------------------------------------
	function isBypassedChannel(id) { return has(read().channels, id) }
	function isBypassedGuild(id) { return has(read().guilds, id) }
	function setChannel(id, on) {
		var s = read()
		var ch = channelOf(id)
		var user = recipientOf(ch)
		if (on) { add(s.channels, id); if (user) add(s.users, user) }
		else { drop(s.channels, id); if (user) drop(s.users, user) }
		commit(s)
	}
	function setGuild(id, on) {
		var s = read()
		if (on) add(s.guilds, id)
		else drop(s.guilds, id)
		commit(s)
	}
	function total() { var s = read(); return s.channels.length + s.guilds.length }

	// ---- Deciding ----------------------------------------------------------------------------------------
	/** True when this message came from somewhere you chose, and is meant for you. */
	function shouldBypass(event) {
		var m = event && event.message
		if (!m || event.optimistic || !m.channel_id) return false
		var me = selfId()
		var author = m.author && m.author.id
		if (me && author === me) return false
		var s = read()
		var ch = channelOf(m.channel_id)
		if (has(s.channels, m.channel_id)) return true
		var guildId = m.guild_id || (ch && ch.guild_id)
		if (guildId && has(s.guilds, guildId)) return true
		if (author && has(s.users, author)) {
			if (isDm(ch)) return true
			var mine = me && ((m.mentions || []).some(function (u) { return u && u.id === me }))
			if (mine) return true
		}
		return false
	}
	function currentStatus() {
		try {
			var me = selfId()
			var a = stores().SelfPresenceStore
			if (a && typeof a.getStatus === 'function') return a.getStatus()
			var p = stores().PresenceStore
			if (p && typeof p.getStatus === 'function' && me) return p.getStatus(me)
		} catch (e) {}
		return undefined
	}
	function bannerText(event) {
		var m = event.message
		var who = (m.author && (m.author.global_name || m.author.username)) || 'Someone'
		var where = ''
		var ch = channelOf(m.channel_id)
		if (ch && !isDm(ch)) where = ' in #' + (ch.name || 'channel')
		var text = String(m.content || '').replace(/\s+/g, ' ').trim()
		if (!text && m.attachments && m.attachments.length) text = '[attachment]'
		return who + where + ': ' + text.slice(0, 120)
	}

	// ---- Hooks -------------------------------------------------------------------------------------------
	function dispatcherModule() {
		var f = valenced.discord.flux || {}
		var d = f.FluxDispatcher || f.dispatcher || f.Dispatcher
		if (d && typeof d.dispatch === 'function') return d
		try {
			var found = finders().lookupModule(finders().filters.withProps('dispatch', 'subscribe', 'unsubscribe'))[0]
			if (found && typeof found.dispatch === 'function') return found
		} catch (e) {}
		return null
	}
	function installHooks(cleanup) {
		var d = dispatcherModule()
		if (!d) { status.dispatcher = 'not found'; return }
		status.dispatcher = 'found'
		cleanup(valenced.patcher.instead(d, 'dispatch', function (args, original) {
			var on = false
			var event = args && args[0]
			try {
				if (event && event.type === 'MESSAGE_CREATE' && shouldBypass(event)) {
					status.selfStatus = String(currentStatus())
					if (status.selfStatus === 'dnd') { on = true; depth++; status.windows++; status.last = bannerText(event).slice(0, 50) }
				}
			} catch (e) {}
			try {
				return Reflect.apply(original, this, args)
			} finally {
				if (on) {
					depth--
					try { if (bannerOn()) { status.banners++; toast(bannerText(event)) } } catch (e) {}
					changed()
				}
			}
		}))
		status.hooks.push('Dispatcher.dispatch')
		// While such a message is handled, the stores answer "online" instead of "do not disturb".
		var names = ['SelfPresenceStore', 'PresenceStore', 'StatusStore']
		names.forEach(function (name) {
			var store
			try { store = stores()[name] } catch (e) {}
			if (!store) return
			methodNames(store).forEach(function (method) {
				if (typeof store[method] !== 'function') return
				var isStatus = /^get(Self)?(Presence)?Status$/.test(method)
				var isFlag = /^(is)?(DND|DoNotDisturb)$/i.test(method) || /^isDND|^isDoNotDisturb/.test(method)
				if (!isStatus && !isFlag) return
				try {
					cleanup(valenced.patcher.after(store, method, function (result) {
						if (depth > 0) {
							if (isStatus && result === 'dnd') { status.overrides++; return 'online' }
							if (isFlag && result === true) { status.overrides++; return false }
						}
						return result
					}))
					status.hooks.push(name + '.' + method)
				} catch (e) { status.error = String((e && e.message) || e).slice(0, 80) }
			})
		})
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

	// ---- The hold-down menus ---------------------------------------------------------------------------
	var lastMenu = { kind: '', id: '', at: 0 }
	/** Which chat, channel or server a piece of a sheet is about. */
	function contextOf(props) {
		if (!props || typeof props !== 'object' || props.message) return null
		var keys = Object.keys(props)
		var guild = null
		for (var i = 0; i < keys.length; i++) {
			var k = keys[i]
			var v = props[k]
			if (v && typeof v === 'object' && typeof v.id === 'string') {
				if (k === 'channel' || /channel$/i.test(k) || v.type === DM || v.type === GROUP_DM || (typeof v.type === 'number' && (v.guild_id || v.guildId))) return { kind: 'channel', id: v.id }
				if (!guild && (k === 'guild' || /guild$/i.test(k))) guild = { kind: 'guild', id: v.id }
			} else if (typeof v === 'string' && /^\d{15,}$/.test(v)) {
				if (/channel/i.test(k) && channelOf(v)) return { kind: 'channel', id: v }
				if (!guild && /guild/i.test(k)) guild = { kind: 'guild', id: v }
			}
		}
		return guild
	}
	function noteSheet(el) {
		try {
			var name = nameOf(el)
			if (!name || /^MessagesItem|^MessagesFast|^MessagesHeader|^FastList|^_FastList|^Guild|^HomeDrawer/.test(name)) return
			if (el.props && el.props.message) { lastMenu = { kind: '', id: '', at: 0 }; return }
			var c = contextOf(el.props)
			if (c) lastMenu = { kind: c.kind, id: c.id, at: Date.now() }
		} catch (e) {}
	}
	function iconNameOf(row) {
		try { var ic = row && row.props && row.props.icon; return ic && typeof ic === 'object' ? nameOf(ic) : '' } catch (e) { return '' }
	}
	/** The row that mutes: found by its icon, so it works in any language. */
	function isMuteRow(row) {
		try {
			if (!row || typeof row !== 'object' || !row.props) return false
			if (/mute|bell.*(slash|off)|notification.*(off|slash)/i.test(iconNameOf(row))) return true
			var l = row.props.label
			return typeof l === 'string' && /^(un)?mute\b/i.test(l.trim())
		} catch (e) { return false }
	}
	function decorateMenuGroup(result) {
		try {
			var props = result && result.props
			if (!props || props.__bypass || !props.children) return result
			var rows = (Array.isArray(props.children) ? props.children : [props.children]).filter(function (r) { return r && typeof r === 'object' })
			if (!rows.length || rows.length > 4) return result
			var mute = rows.filter(isMuteRow)[0]
			if (!mute) {
				rows.forEach(function (r) { var n = iconNameOf(r); if (n && status.sheetIcons.length < 14 && status.sheetIcons.indexOf(n) < 0) { status.sheetIcons.push(n); changed() } })
				return result
			}
			if (!lastMenu.id || Date.now() - lastMenu.at > 5000) return result
			var React = valenced.react.React
			var on = lastMenu.kind === 'guild' ? isBypassedGuild(lastMenu.id) : isBypassedChannel(lastMenu.id)
			var id = lastMenu.id
			var kind = lastMenu.kind
			var label = on ? 'Stop bypassing Do Not Disturb' : 'Bypass Do Not Disturb'
			var icon = valenced.react.React.createElement(valenced.discord.design.Design.Text, { variant: 'text-md/bold' }, on ? '🔕' : '🔔')
			var row = React.createElement(mute.type, Object.assign({}, mute.props, {
				key: 'bypass-dnd', label: label, icon: icon, subLabel: undefined,
				onPress: function () {
					try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
					setTimeout(function () {
						if (kind === 'guild') setGuild(id, !on)
						else setChannel(id, !on)
						toast(on ? 'No longer bypassing Do Not Disturb' : 'You will be notified in Do Not Disturb')
					}, 0)
				},
			}))
			status.menus++
			changed()
			return React.cloneElement(result, { __bypass: true }, rows.concat([row]))
		} catch (e) {
			return result
		}
	}
	function installMenuHooks(cleanup) {
		var f = finders()
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		function both(el) {
			if (globalThis.__bypassStatusInstance !== INSTANCE) return el
			noteSheet(el)
			return decorateMenuGroup(el)
		}
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, both))
		})
	}

	// ---- The report ----------------------------------------------------------------------------------------
	function buildReport() {
		var s = read()
		var lines = []
		lines.push('Bypass Status report')
		lines.push('version: ' + VERSION)
		lines.push('sources: ' + s.channels.length + ' chats/channels, ' + s.guilds.length + ' servers, ' + s.users.length + ' people')
		lines.push('dispatcher: ' + status.dispatcher + '; hooked: ' + status.hooks.join(', '))
		lines.push('status seen at the last bypass: ' + (status.selfStatus || '-') + '; bypass windows: ' + status.windows + '; status answers changed: ' + status.overrides + '; banners: ' + status.banners)
		lines.push('last message: ' + (status.last || '-'))
		lines.push('hold-down menus changed: ' + status.menus + '; icons seen in sheets: ' + status.sheetIcons.join(', '))
		if (status.error) lines.push('problem: ' + status.error)
		return lines.join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	// ---- Settings ------------------------------------------------------------------------------------------
	function Card(props) {
		var RN = valenced.react.ReactNative
		return h(RN.View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, props.children)
	}
	function SettingsComponent(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		storage = props.api.jsonStorage
		storage.use()
		var tick = React.useState(0)
		var search = React.useState('')
		var tech = React.useState(false)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])
		var s = read()
		var q = String(search[0]).toLowerCase().trim()
		var chatRows = s.channels.map(function (id) {
			return h(Design.TableRow, { key: 'c' + id, label: channelLabel(id), subLabel: 'Tap to stop bypassing', onPress: function () { setChannel(id, false); toast('Removed') } })
		})
		var guildRows = s.guilds.map(function (id) {
			return h(Design.TableRow, { key: 'g' + id, label: guildName(id), subLabel: 'Every channel. Tap to stop bypassing', onPress: function () { setGuild(id, false); toast('Removed') } })
		})
		var dms = allDmIds().filter(function (id) { return !has(s.channels, id) && (!q || channelLabel(id).toLowerCase().indexOf(q) >= 0) }).slice(0, 40)
		var guilds = allGuilds().filter(function (g) { return !has(s.guilds, g.id) && (!q || String(g.name).toLowerCase().indexOf(q) >= 0) }).slice(0, 40)
		var count = total()
		var inChat = null
		try { inChat = stores().SelectedChannelStore.getChannelId() } catch (e) {}
		var technical = [
			h(Design.TableRow, { key: 'disp', label: 'Where it listens', subLabel: status.dispatcher + (status.hooks.length ? ' · ' + status.hooks.join(', ') : '') }),
			h(Design.TableRow, { key: 'win', label: 'Messages that bypassed', subLabel: status.windows + ' · status answers changed ' + status.overrides + ' · banners ' + status.banners + (status.last ? ' · last: ' + status.last : '') }),
			h(Design.TableRow, { key: 'menu', label: 'Hold-down menus', subLabel: status.menus ? 'Added ' + status.menus + ' time(s)' : 'Not seen yet. Hold a chat, a channel or a server.' }),
			status.error ? h(Design.TableRow, { key: 'err', label: 'Problem', subLabel: status.error }) : null,
		]
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				h(
					Card,
					null,
					h(Design.Text, { variant: 'heading-lg/bold' }, 'Bypass Status ' + VERSION),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, (count ? count + ' source' + (count === 1 ? '' : 's') + ' chosen. ' : 'Nothing chosen yet. ') + 'Messages from these still notify you while your status is Do Not Disturb. Hold a chat, a channel or a server and choose Bypass Do Not Disturb, or add them below.'),
					h(
						RN.View,
						{ style: { flexDirection: 'row', gap: 10 } },
						inChat
							? h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: isBypassedChannel(inChat) ? 'Remove this chat' : 'Add the chat I am in', variant: 'primary', size: 'sm', onPress: function () { var on = isBypassedChannel(inChat); setChannel(inChat, !on); toast(on ? 'Removed' : 'Added ' + channelLabel(inChat)) } }))
							: null,
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport })),
					),
				),
				h(Design.TableRowGroup, { title: 'Chats and channels' }, chatRows.length ? chatRows : [h(Design.TableRow, { key: 'nochat', label: 'None yet', subLabel: 'Add a direct message below, or hold a channel.' })]),
				h(Design.TableRowGroup, { title: 'Servers' }, guildRows.length ? guildRows : [h(Design.TableRow, { key: 'noguild', label: 'None yet', subLabel: 'Every channel of a server you add here bypasses Do Not Disturb.' })]),
				h(Design.TextInput, { label: 'Find a chat or a server', placeholder: 'Search', size: 'md', value: search[0], onChange: function (v) { search[1](v) } }),
				h(
					Design.TableRowGroup,
					{ title: 'Add a chat' },
					dms.length
						? dms.map(function (id) { return h(Design.TableRow, { key: 'd' + id, label: channelLabel(id), subLabel: 'Tap to add', onPress: function () { setChannel(id, true); toast('Added ' + channelLabel(id)) } }) })
						: [h(Design.TableRow, { key: 'nodm', label: q ? 'No match' : 'No chats found', subLabel: 'Open the Messages tab once so Discord loads the list.' })],
				),
				h(
					Design.TableRowGroup,
					{ title: 'Add a server' },
					guilds.length
						? guilds.map(function (g) { return h(Design.TableRow, { key: 's' + g.id, label: g.name, subLabel: 'Tap to add', onPress: function () { setGuild(g.id, true); toast('Added ' + g.name) } }) })
						: [h(Design.TableRow, { key: 'nosrv', label: q ? 'No match' : 'No servers found' })],
				),
				h(
					Design.TableRowGroup,
					{ title: 'Options' },
					h(Design.TableSwitchRow, { key: 'banner', label: 'Show a banner from this plugin', subLabel: 'A short message at the top when one of these messages arrives in Do Not Disturb, in case Discord still stays quiet.', value: bannerOn(), onValueChange: function (v) { try { Object.assign(storage.cache, { banner: !!v }); changed() } catch (e) {} } }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'About' },
					h(Design.TableRow, { key: 'about1', label: 'What it can do', subLabel: 'While Discord is open, a message from one of your sources is handled as if you were online, so Discord shows and sounds its normal notification. A notification that Discord sends to your phone while the app is closed is decided by Discord\'s servers, which this plugin cannot change.' }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Diagnostics' },
					h(Design.TableRow, { key: 'copy', label: 'Copy diagnostic report', subLabel: 'Paste it to the developer if something does not work.', onPress: copyReport }),
					h(Design.TableSwitchRow, { key: 'tech', label: 'Show technical details', value: tech[0], onValueChange: function (v) { tech[1](!!v) } }),
					tech[0] ? technical : null,
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			globalThis.__bypassStatusInstance = INSTANCE
			storage = api.jsonStorage
			function attempt(label, step) { try { step() } catch (e) { status.error = label + ': ' + String((e && e.message) || e).slice(0, 70) } }
			attempt('hooks', function () { installHooks(api.cleanup) })
			attempt('menus', function () { installMenuHooks(api.cleanup) })
			api.cleanup(function () { depth = 0; listeners = [] })
		},
	})
	return exports
})({})
