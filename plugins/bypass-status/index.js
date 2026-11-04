(function (exports) {
	/*
	 * Bypass Status for Valenced
	 *
	 * Get Discord's normal notification, banner and sound from chosen people (or from everyone) while your
	 * status is Do Not Disturb.
	 *
	 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) shows where
	 * the block is. `discord_app/stores/native/InAppNotificationStore.tsx` handles every new message and asks
	 *
	 *     NotificationTextUtils.shouldNotify(message, channelId, includeSelectedChannel, ignoreStatus)
	 *
	 * (`discord_app/modules/notifications/NotificationTextUtils.tsx`). Inside, `shouldNotifyBase` answers "no"
	 * while `SelfPresenceStore.getStatus()` is Do Not Disturb, unless `ignoreStatus` is true. So this plugin wraps
	 * `shouldNotify` and, for a message from somebody you chose, calls it with `ignoreStatus = true`. Everything
	 * else Discord checks (muted chats, blocked people, your notification settings) still applies, and the banner
	 * and sound are Discord's own.
	 *
	 * Notifications sent to your phone while the app is closed are decided by Discord's servers. This plugin
	 * cannot change those.
	 *
	 * The file reads top to bottom:  1 Settings  2 The list  3 The rule  4 The hook  5 A banner of its own
	 *                                6 Hold-down menu  7 Settings screen  8 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '3.0.0'
	const INSTANCE = {}
	const DM = 1
	const GROUP_DM = 3

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const stores = () => valenced.discord.flux.Stores
	const parseJson = (text, fallback) => {
		try { return JSON.parse(text) ?? fallback } catch (e) { return fallback }
	}
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_BYPASS_STATUS', { text: String(text) }) } catch (e) {}
	}
	/** Builds a React element with the JSX runtime, so the file needs no build step. */
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}
	/** The name of a React component, from the element that was just made. */
	function componentName(element) {
		const type = element && element.type
		if (!type || typeof type === 'string') return ''
		const inner = type.type || type.render || type
		return type.displayName || type.name || (inner && (inner.displayName || inner.name)) || ''
	}

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	const defaults = {
		everyone: false, // true: every message may bypass Do Not Disturb. false: only the list below
		listsJson: '{"users":[],"channels":[],"guilds":[]}',
		ownBanner: false, // also show a banner of this plugin (it is used on its own when Discord's function is not found)
		ownBannerBuzz: true,
	}

	let storage
	let screenListeners = []
	const redrawSettings = () => screenListeners.slice().forEach((redraw) => { try { redraw() } catch (e) {} })

	function setting(key) {
		const saved = storage && storage.cache && storage.cache[key]
		return saved !== undefined ? saved : defaults[key]
	}
	function saveSettings(patch) {
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		redrawSettings()
	}

	// ---------------------------------------------------------------------------------------------------
	// 2. The list: people, channels and servers that may bypass
	// ---------------------------------------------------------------------------------------------------
	/** @returns {{ users: string[], channels: string[], guilds: string[] }} */
	function readList() {
		const saved = parseJson(setting('listsJson'), {})
		const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [])
		return { users: ids(saved.users), channels: ids(saved.channels), guilds: ids(saved.guilds) }
	}
	const writeList = (list) => saveSettings({ listsJson: JSON.stringify(list) })

	/** Turns one entry of the list on or off. `kind` is 'users', 'channels' or 'guilds'. */
	function setOnList(kind, id, wanted) {
		const list = readList()
		const without = list[kind].filter((existing) => existing !== id)
		list[kind] = wanted ? [...without, id] : without
		writeList(list)
	}
	const isOnList = (kind, id) => readList()[kind].includes(id)
	const listSize = () => { const list = readList(); return list.users.length + list.channels.length + list.guilds.length }

	/** Every Discord ID in a pasted text (IDs are 15 to 20 digits). People can paste them with commas, spaces or lines. */
	const idsInText = (text) => [...new Set(String(text || '').match(/\d{15,20}/g) || [])]
	/** Adds the people in a pasted text. @returns how many were new */
	function addPeopleFromText(text) {
		const list = readList()
		const fresh = idsInText(text).filter((id) => !list.users.includes(id))
		if (fresh.length) writeList({ ...list, users: [...list.users, ...fresh] })
		return fresh.length
	}

	// ---------------------------------------------------------------------------------------------------
	// Looking things up in Discord
	// ---------------------------------------------------------------------------------------------------
	const getChannel = (id) => { try { return stores().ChannelStore.getChannel(id) } catch (e) { return null } }
	const getGuild = (id) => { try { return stores().GuildStore.getGuild(id) } catch (e) { return null } }
	const getUser = (id) => { try { return stores().UserStore.getUser(id) } catch (e) { return null } }
	const isDirectMessage = (channel) => !!channel && (channel.type === DM || channel.type === GROUP_DM)

	function myId() {
		try { return stores().UserStore.getCurrentUser().id } catch (e) { return undefined }
	}
	function myStatus() {
		try { return stores().SelfPresenceStore.getStatus() } catch (e) { return undefined }
	}
	const viewedChannelId = () => { try { return stores().SelectedChannelStore.getChannelId() } catch (e) { return undefined } }
	const userLabel = (id) => { const user = getUser(id); return user ? user.globalName || user.global_name || user.username : `User ${String(id).slice(-4)}` }
	const guildLabel = (id) => { const guild = getGuild(id); return guild ? guild.name : `Server ${String(id).slice(-4)}` }

	function channelLabel(id) {
		const channel = getChannel(id)
		if (!channel) return `Chat ${String(id).slice(-4)}`
		if (!isDirectMessage(channel)) {
			const guild = channel.guild_id ? getGuild(channel.guild_id) : null
			return `#${channel.name || 'channel'}${guild ? ` · ${guild.name}` : ''}`
		}
		if (channel.name) return channel.name
		const recipients = (channel.recipients || []).map((r) => (typeof r === 'string' ? r : r && r.id))
		return recipients.map(userLabel).join(', ') || 'Direct message'
	}
	function allDirectMessageIds() {
		try { return stores().PrivateChannelSortStore.getPrivateChannelIds().filter((id) => typeof id === 'string') } catch (e) { return [] }
	}
	function allGuilds() {
		try {
			const guilds = stores().GuildStore.getGuilds() || {}
			return Object.keys(guilds).map((id) => guilds[id]).filter((guild) => guild && guild.id)
		} catch (e) { return [] }
	}
	/** A 1:1 chat is saved as the person (so they also count in group chats). Any other chat is saved as itself. */
	function listEntryForChat(channelId) {
		const channel = getChannel(channelId)
		const other = channel && channel.type === DM && channel.recipients && channel.recipients[0]
		const userId = typeof other === 'string' ? other : other && other.id
		return userId ? { kind: 'users', id: userId } : { kind: 'channels', id: channelId }
	}

	// ---------------------------------------------------------------------------------------------------
	// 3. The rule: may this message bypass Do Not Disturb?
	// ---------------------------------------------------------------------------------------------------
	/** Said once per message by the hook below. Only the rule for "who" lives here: Discord still applies the rest. */
	function mayBypass(message, channelId) {
		if (!message || !message.author) return false
		if (setting('everyone')) return true
		const list = readList()
		const channel = getChannel(channelId || message.channel_id)
		const guildId = message.guild_id || (channel && channel.guild_id)
		return list.users.includes(message.author.id) || list.channels.includes(channelId || message.channel_id) || (!!guildId && list.guilds.includes(guildId))
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. The hook: Discord's own notification function
	// ---------------------------------------------------------------------------------------------------
	const hooks = { notificationUtils: 'not found', patched: [], error: '', bypassed: 0, last: '' }

	function findNotificationUtils() {
		const finders = valenced.modules.finders
		return finders.lookupModule(finders.filters.withProps('shouldNotify', 'shouldNotifyBase'))[0] || null
	}

	/** Wraps `shouldNotify`: for a message that may bypass, it is asked again with `ignoreStatus` set to true. */
	function letChosenMessagesThroughDoNotDisturb(cleanup) {
		const utils = findNotificationUtils()
		if (!utils || typeof utils.shouldNotify !== 'function') return
		hooks.notificationUtils = 'found'
		cleanup(valenced.patcher.instead(utils, 'shouldNotify', function (args, original) {
			const [message, channelId, includeSelectedChannel, ignoreStatus] = args
			const needsHelp = !ignoreStatus && myStatus() === 'dnd' && mayBypass(message, channelId)
			if (!needsHelp) return Reflect.apply(original, this, args)
			hooks.bypassed += 1
			hooks.last = String(message.author.id).slice(-4)
			return Reflect.apply(original, this, [message, channelId, includeSelectedChannel, true])
		}))
		hooks.patched.push('NotificationTextUtils.shouldNotify')
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. A banner of its own: used when Discord's function is not found, or when you turn it on
	// ---------------------------------------------------------------------------------------------------
	const SILENT_MESSAGE_FLAG = 1 << 12

	function findDispatcher() {
		const flux = valenced.discord.flux || {}
		const known = flux.FluxDispatcher || flux.dispatcher || flux.Dispatcher
		if (known && typeof known.dispatch === 'function') return known
		const finders = valenced.modules.finders
		const found = finders.lookupModule(finders.filters.withProps('dispatch', 'subscribe', 'unsubscribe'))[0]
		return found && typeof found.dispatch === 'function' ? found : null
	}
	/** "Anna: hello" or "Anna in #general: hello", with mentions turned into names. */
	function describeMessage(message) {
		const author = message.author.global_name || message.author.username || 'Someone'
		const channel = getChannel(message.channel_id)
		const place = channel && !isDirectMessage(channel) ? ` in #${channel.name || 'channel'}` : ''
		const text = String(message.content || '')
			.replace(/<@!?(\d{15,})>/g, (_, id) => `@${userLabel(id)}`)
			.replace(/<#(\d{15,})>/g, (_, id) => `#${(getChannel(id) || {}).name || 'channel'}`)
			.replace(/\s+/g, ' ')
			.trim()
		return `${author}${place}: ${text || '[attachment]'}`.slice(0, 160)
	}
	/** Whether the plugin's own banner should show for this new message. */
	function ownBannerWanted(event) {
		const message = event && event.message
		if (!event || event.type !== 'MESSAGE_CREATE' || !message || event.optimistic || !message.author) return false
		if (message.author.id === myId() || message.channel_id === viewedChannelId()) return false
		if (!message.content && !(message.attachments && message.attachments.length)) return false
		if (message.flags & SILENT_MESSAGE_FLAG) return false
		return myStatus() === 'dnd' && mayBypass(message, message.channel_id)
	}
	const banners = { shown: 0 }
	function showOwnBanner(message) {
		banners.shown += 1
		toast(describeMessage(message))
		if (setting('ownBannerBuzz')) {
			try { valenced.react.ReactNative.Vibration.vibrate(200) } catch (e) {}
		}
		redrawSettings()
	}
	function listenForOwnBanner(cleanup) {
		const dispatcher = findDispatcher()
		if (!dispatcher) return
		cleanup(valenced.patcher.instead(dispatcher, 'dispatch', function (args, original) {
			const event = args && args[0]
			const wanted = (setting('ownBanner') || hooks.notificationUtils !== 'found') && ownBannerWanted(event)
			try {
				return Reflect.apply(original, this, args)
			} finally {
				if (wanted) showOwnBanner(event.message)
			}
		}))
		hooks.patched.push('Dispatcher.dispatch (own banner)')
	}

	// ---------------------------------------------------------------------------------------------------
	// 6. The hold-down menu: a "Bypass Do Not Disturb" row next to Mute
	// ---------------------------------------------------------------------------------------------------
	const MENU_TARGET_MAX_AGE_MS = 5000
	let menuTarget = null // what the open sheet is about: { kind: 'users' | 'channels' | 'guilds', id, at }
	const iconsSeen = []

	/** What a piece of a sheet is about: a chat, a channel or a server. Messages are not. */
	function targetFromProps(props) {
		if (!props || typeof props !== 'object' || props.message) return null
		let guildTarget = null
		for (const [key, value] of Object.entries(props)) {
			if (value && typeof value === 'object' && typeof value.id === 'string') {
				const looksLikeChannel = key === 'channel' || /channel$/i.test(key) || isDirectMessage(value) || (typeof value.type === 'number' && (value.guild_id || value.guildId))
				if (looksLikeChannel) return isDirectMessage(value) ? listEntryForChat(value.id) : { kind: 'channels', id: value.id }
				if (key === 'guild' || /guild$/i.test(key)) guildTarget = guildTarget || { kind: 'guilds', id: value.id }
			} else if (typeof value === 'string' && /^\d{15,}$/.test(value)) {
				if (/channel/i.test(key) && getChannel(value)) return isDirectMessage(getChannel(value)) ? listEntryForChat(value) : { kind: 'channels', id: value }
				if (/guild/i.test(key)) guildTarget = guildTarget || { kind: 'guilds', id: value }
			}
		}
		return guildTarget
	}
	const IGNORED_SHEET_PARTS = /^MessagesItem|^MessagesFast|^MessagesHeader|^FastList|^_FastList|^Guild|^HomeDrawer/

	function rememberSheetTarget(element) {
		const name = componentName(element)
		if (!name || IGNORED_SHEET_PARTS.test(name)) return
		const props = element.props
		if (props && props.message) { menuTarget = null; return }
		const target = targetFromProps(props)
		if (target) menuTarget = { ...target, at: Date.now() }
	}

	const iconNameOf = (row) => { const icon = row && row.props && row.props.icon; return icon && typeof icon === 'object' ? componentName(icon) : '' }
	/** The Mute row is found by its icon, so this works in any language. */
	function isMuteRow(row) {
		if (!row || typeof row !== 'object' || !row.props) return false
		if (/mute|bell.*(slash|off)|notification.*(off|slash)/i.test(iconNameOf(row))) return true
		return typeof row.props.label === 'string' && /^(un)?mute\b/i.test(row.props.label.trim())
	}

	/** Adds the row to the group of rows that holds Mute. Everything else is returned untouched. */
	function addBypassRow(group) {
		const props = group && group.props
		if (!props || props.__bypassRowAdded || !props.children) return group
		const rows = (Array.isArray(props.children) ? props.children : [props.children]).filter((row) => row && typeof row === 'object')
		if (!rows.length || rows.length > 4) return group

		const muteRow = rows.find(isMuteRow)
		if (!muteRow) { rows.forEach(rememberIcon); return group }
		if (!menuTarget || Date.now() - menuTarget.at > MENU_TARGET_MAX_AGE_MS) return group

		const { kind, id } = menuTarget
		const chosen = isOnList(kind, id)
		const React = valenced.react.React
		const bypassRow = React.createElement(muteRow.type, {
			...muteRow.props,
			key: 'bypass-dnd',
			label: chosen ? 'Stop bypassing Do Not Disturb' : 'Bypass Do Not Disturb',
			icon: React.createElement(valenced.discord.design.Design.Text, { variant: 'text-md/bold' }, chosen ? '🔕' : '🔔'),
			subLabel: undefined,
			onPress: () => {
				try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
				setTimeout(() => {
					setOnList(kind, id, !chosen)
					toast(chosen ? 'No longer bypassing Do Not Disturb' : 'You will be notified in Do Not Disturb')
				}, 0)
			},
		})
		return React.cloneElement(group, { __bypassRowAdded: true }, [...rows, bypassRow])
	}
	function rememberIcon(row) {
		const name = iconNameOf(row)
		if (name && iconsSeen.length < 14 && !iconsSeen.includes(name)) iconsSeen.push(name)
	}

	function hookMenus(cleanup) {
		const finders = valenced.modules.finders
		const runtime = finders.lookupModule(finders.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		const onNewElement = (element) => {
			if (globalThis.__bypassStatusInstance !== INSTANCE) return element // an older copy of the plugin is still loaded
			rememberSheetTarget(element)
			return addBypassRow(element)
		}
		;['jsx', 'jsxs'].forEach((name) => {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, onNewElement))
		})
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function buildReport() {
		const list = readList()
		return [
			'Bypass Status report',
			`version: ${VERSION}`,
			`everyone: ${setting('everyone')}; list: ${list.users.length} people, ${list.channels.length} channels or chats, ${list.guilds.length} servers`,
			`my status now: ${myStatus()}`,
			`discord's notification function: ${hooks.notificationUtils}; hooked: ${hooks.patched.join(', ') || '-'}`,
			`messages let through Do Not Disturb: ${hooks.bypassed} (last author ends ...${hooks.last || '-'})`,
			`own banners shown: ${banners.shown}`,
			`icons seen in sheets: ${iconsSeen.join(', ')}`,
			hooks.error ? `problem: ${hooks.error}` : '',
		].filter(Boolean).join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()

		const [, setRedraws] = React.useState(0)
		const [search, setSearch] = React.useState('')
		const [pasted, setPasted] = React.useState('')
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const list = readList()
		const everyone = !!setting('everyone')
		const query = String(search).toLowerCase().trim()
		const matches = (label) => !query || String(label).toLowerCase().includes(query)

		const chosenRow = (kind, id, label, hint) =>
			h(Design.TableRow, { key: `${kind}${id}`, label, subLabel: `${hint} Tap to remove.`, onPress: () => { setOnList(kind, id, false); toast('Removed') } })
		const addRow = (kind, id, label) =>
			h(Design.TableRow, { key: `add${kind}${id}`, label, subLabel: 'Tap to add', onPress: () => { setOnList(kind, id, true); toast(`Added ${label}`) } })

		const peopleRows = list.users.map((id) => chosenRow('users', id, userLabel(id), `ID ${id}.`))
		const channelRows = list.channels.map((id) => chosenRow('channels', id, channelLabel(id), 'This chat or channel.'))
		const serverRows = list.guilds.map((id) => chosenRow('guilds', id, guildLabel(id), 'Every channel of this server.'))
		const chatsToAdd = allDirectMessageIds().filter((id) => { const entry = listEntryForChat(id); return !list[entry.kind].includes(entry.id) && matches(channelLabel(id)) }).slice(0, 40)
		const serversToAdd = allGuilds().filter((guild) => !list.guilds.includes(guild.id) && matches(guild.name)).slice(0, 40)

		const addPasted = () => {
			const count = addPeopleFromText(pasted)
			setPasted('')
			toast(count ? `Added ${count} ${count === 1 ? 'person' : 'people'}` : 'No new IDs found in that text')
		}
		const addFromClipboard = () => {
			Promise.resolve(valenced.externals.ReactNativeClipboard.Clipboard.getString()).then(
				(text) => { const count = addPeopleFromText(text); toast(count ? `Added ${count} from the clipboard` : 'No new IDs in the clipboard') },
				() => toast('Could not read the clipboard'),
			)
		}
		const count = listSize()

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				h(
					Card,
					null,
					h(Design.Text, { variant: 'heading-lg/bold' }, `Bypass Status ${VERSION}`),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, everyone
						? 'Everyone can notify you while your status is Do Not Disturb.'
						: `${count ? `${count} on the list. ` : 'The list is empty. '}Only they can notify you while your status is Do Not Disturb.`),
					h(
						RN.View,
						{ style: { flexDirection: 'row', gap: 10 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport })),
					),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Who can bypass' },
					h(Design.TableSwitchRow, { key: 'everyone', label: 'Everyone', subLabel: 'Off: only the people, chats and servers below. On: every message gets through Do Not Disturb.', value: everyone, onValueChange: (value) => saveSettings({ everyone: !!value }) }),
				),
				!everyone && h(
					Design.TableRowGroup,
					{ title: 'People (paste their IDs)' },
					h(Design.TextInput, { key: 'paste', label: 'User IDs', description: 'Paste one or more IDs, separated by commas, spaces or new lines.', placeholder: '123456789012345678, 234567890123456789', size: 'md', value: pasted, onChange: (value) => setPasted(value) }),
					h(RN.View, { key: 'pasteButtons', style: { flexDirection: 'row', gap: 10, paddingVertical: 8 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Add', variant: 'primary', size: 'sm', onPress: addPasted })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Add from clipboard', variant: 'secondary', size: 'sm', onPress: addFromClipboard }))),
					...(peopleRows.length ? peopleRows : [h(Design.TableRow, { key: 'nobody', label: 'Nobody yet', subLabel: 'Hold a direct message and choose Bypass Do Not Disturb, or paste an ID above.' })]),
				),
				!everyone && h(Design.TableRowGroup, { title: 'Channels and group chats' }, channelRows.length ? channelRows : [h(Design.TableRow, { key: 'nochannel', label: 'None yet', subLabel: 'Hold a channel or a group chat.' })]),
				!everyone && h(Design.TableRowGroup, { title: 'Servers' }, serverRows.length ? serverRows : [h(Design.TableRow, { key: 'noserver', label: 'None yet', subLabel: 'Hold a server.' })]),
				!everyone && h(Design.TextInput, { label: 'Find a chat or a server', placeholder: 'Search', size: 'md', value: search, onChange: (value) => setSearch(value) }),
				!everyone && h(Design.TableRowGroup, { title: 'Add a chat' }, chatsToAdd.length ? chatsToAdd.map((id) => addRow(listEntryForChat(id).kind, listEntryForChat(id).id, channelLabel(id))) : [h(Design.TableRow, { key: 'nochats', label: query ? 'No match' : 'No chats found', subLabel: 'Open the Messages tab once so Discord loads the list.' })]),
				!everyone && h(Design.TableRowGroup, { title: 'Add a server' }, serversToAdd.length ? serversToAdd.map((guild) => addRow('guilds', guild.id, guild.name)) : [h(Design.TableRow, { key: 'noservers', label: query ? 'No match' : 'No servers found' })]),
				h(
					Design.TableRowGroup,
					{ title: 'Notice' },
					h(Design.TableSwitchRow, { key: 'ownBanner', label: 'Also show a banner of this plugin', subLabel: 'Discord shows its own banner and sound. This adds a short message and one buzz as well. It turns itself on by itself if Discord\'s function cannot be found.', value: !!setting('ownBanner'), onValueChange: (value) => saveSettings({ ownBanner: !!value }) }),
					h(Design.TableSwitchRow, { key: 'ownBannerBuzz', label: 'Buzz with that banner', value: !!setting('ownBannerBuzz'), onValueChange: (value) => saveSettings({ ownBannerBuzz: !!value }) }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'About' },
					h(Design.TableRow, { key: 'about', label: 'What it can do', subLabel: 'While Discord is open, messages from your sources get Discord\'s normal notification even in Do Not Disturb. A notification Discord sends to your phone while the app is closed is decided by Discord\'s servers, which this plugin cannot change.' }),
					h(Design.TableRow, { key: 'state', label: 'Is it working?', subLabel: hooks.notificationUtils === 'found' ? `Hooked into Discord's notification function. ${hooks.bypassed} message(s) let through so far.` : 'Discord\'s notification function was not found, so only this plugin\'s own banner is used.' }),
					hooks.error && h(Design.TableRow, { key: 'error', label: 'Problem', subLabel: hooks.error }),
				),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 8. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			globalThis.__bypassStatusInstance = INSTANCE
			storage = api.jsonStorage
			const attempt = (what, step) => { try { step() } catch (e) { hooks.error = `${what}: ${String((e && e.message) || e).slice(0, 70)}` } }
			attempt('notification function', () => letChosenMessagesThroughDoNotDisturb(api.cleanup))
			attempt('own banner', () => listenForOwnBanner(api.cleanup))
			attempt('menus', () => hookMenus(api.cleanup))
			api.cleanup(() => { screenListeners = [] })
		},
	})
	return exports
})({})
