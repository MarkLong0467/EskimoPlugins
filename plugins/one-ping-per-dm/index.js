(function (exports) {
	/*
	 * One Ping Per DM for Valenced.
	 * Same idea as OnePingPerDM in Equicord/Vencord, written from scratch for Valenced.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var defaults = { channels: 'both', allowMentions: false, allowEveryone: false }
	var QUIET_MS = 1500
	var DM = 1
	var GROUP_DM = 3

	var storage
	var quietUntil = 0

	function finders() { return valenced.modules.finders }
	function find(filter) { return finders().lookupModule(filter)[0] }
	function store(name, prop) {
		var s = valenced.discord.flux.Stores[name]
		return s || find(finders().filters.withProps(prop))
	}
	function setting(key) {
		var s = storage && storage.cache
		return s && s[key] !== undefined ? s[key] : defaults[key]
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

	/** True when this message should stay quiet: it is not the first unread message of its DM. */
	function shouldBeQuiet(payload) {
		var message = payload && payload.message
		if (!message || !message.channel_id) return false
		var channel = store('ChannelStore', 'getChannel').getChannel(message.channel_id)
		var type = channel && channel.type
		if (type !== DM && type !== GROUP_DM) return false
		var channels = setting('channels')
		if ((type === DM && channels === 'group') || (type === GROUP_DM && channels === 'user')) return false
		var me = store('UserStore', 'getCurrentUser').getCurrentUser()
		if (!me || (message.author && message.author.id === me.id)) return false
		if (setting('allowMentions') && (message.mentions || []).some(function (m) { return m && m.id === me.id })) return false
		if (setting('allowEveryone') && message.mention_everyone) return false
		var oldest = store('ReadStateStore', 'getOldestUnreadMessageId').getOldestUnreadMessageId(message.channel_id)
		return !!oldest && oldest !== message.id
	}

	function quietly(original) {
		return function () {
			if (Date.now() < quietUntil) return undefined
			return original.apply(this, arguments)
		}
	}

	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var settings = Object.assign({}, defaults, json.use())
		function put(key, value) { var patch = {}; patch[key] = value; json.set(patch) }
		function toggle(key, label, subLabel) {
			return h(Design.TableSwitchRow, { key: key, label: label, subLabel: subLabel, value: !!settings[key], onValueChange: function (v) { put(key, v) } })
		}
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRadioGroup,
					{ title: 'Chats to affect', value: settings.channels, onChange: function (v) { put('channels', v) } },
					[
						{ value: 'both', label: 'Both' },
						{ value: 'user', label: 'User DMs' },
						{ value: 'group', label: 'Group DMs' },
					].map(function (r) { return h(Design.TableRadioRow, { key: r.value, label: r.label, value: r.value }) }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Always ping for' },
					toggle('allowMentions', '@mentions', 'Keep the sound for messages that mention you'),
					toggle('allowEveryone', '@everyone and @here', 'Keep the sound in group DMs for these'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'About' },
					h(Design.TableRow, { key: 'about', label: 'How it works', subLabel: 'Only the first unread message of a DM plays a sound. Read the chat and the next message plays one again. Push notifications while the app is closed are sent by Discord and cannot be changed.' }),
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

			cleanup(
				valenced.discord.flux.onFluxEventDispatched('MESSAGE_CREATE', function (payload) {
					var quiet = false
					try { quiet = shouldBeQuiet(payload) } catch (e) {}
					quietUntil = quiet ? Date.now() + QUIET_MS : 0
					return payload
				}),
			)

			// Whatever plays the sound for a new message is skipped during that short window.
			var RN = valenced.react.ReactNative
			var native = RN.NativeModules && RN.NativeModules.DCDSoundManager
			if (native && typeof native.play === 'function')
				cleanup(valenced.patcher.instead(native, 'play', function (args, original) { return quietly(original).apply(this, args) }))
			var sounds = find(finders().filters.withProps('playSound'))
			if (sounds && typeof sounds.playSound === 'function')
				cleanup(valenced.patcher.instead(sounds, 'playSound', function (args, original) { return quietly(original).apply(this, args) }))
		},
	})
	return exports
})({})
