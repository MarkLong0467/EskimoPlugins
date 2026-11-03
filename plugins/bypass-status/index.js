(function (exports) {
	/*
	 * Bypass Status for Valenced
	 *
	 * Still get notified by the people, chats and servers you choose while your status is Do Not Disturb.
	 * The idea and the rules come from Bypass Status for Equicord. The code is written from scratch for Valenced.
	 *
	 * How it works, in one paragraph: the plugin listens to every new message. If your status is the one you
	 * picked (Do Not Disturb by default) and the message comes from something on your list, it shows its own
	 * banner and vibrates. It can also make Discord handle that one message as if you were online, so Discord
	 * shows its normal notification too.
	 *
	 * The file reads top to bottom:  1 Settings  2 The list  3 The rules  4 Notifying  5 Hold-down menu
	 *                                6 Settings screen  7 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '2.0.0'
	const INSTANCE = {}
	const DM = 1
	const GROUP_DM = 3
	const SILENT_MESSAGE_FLAG = 1 << 12

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
		listsJson: '{"users":[],"channels":[],"guilds":[]}',
		statusToUse: 'dnd', // the status in which the list is let through
		onlyMentions: true, // servers and channels: only when you are mentioned
		allowOutsideOfDms: false, // chosen people: also in servers, when they mention you
		respectSilentPings: true, // @silent messages stay silent
		showBanner: true,
		vibrate: true,
		letDiscordNotify: true, // experimental: Discord handles the message as if you were online
	}
	const STATUS_CHOICES = [
		{ value: 'dnd', label: 'Do Not Disturb' },
		{ value: 'idle', label: 'Idle' },
		{ value: 'online', label: 'Online' },
		{ value: 'invisible', label: 'Invisible' },
	]

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
		try {
			const own = stores().SelfPresenceStore
			if (own && typeof own.getStatus === 'function') return own.getStatus()
			return stores().PresenceStore.getStatus(myId())
		} catch (e) { return undefined }
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
	// 3. The rules: does this message get through?
	// ---------------------------------------------------------------------------------------------------
	function isMentioned(message) {
		const me = myId()
		if (message.mention_everyone) return true
		if ((message.mentions || []).some((user) => user && user.id === me)) return true
		try {
			const member = stores().GuildMemberStore.getMember(message.guild_id, me)
			return !!member && (message.mention_roles || []).some((role) => (member.roles || []).includes(role))
		} catch (e) { return false }
	}

	/**
	 * Messages that never get through, whatever the list says.
	 * @returns {string | null} the reason, or null when the message may be considered
	 */
	function reasonToIgnore(message, event) {
		if (event.optimistic || message.state === 'SENDING') return 'not sent yet'
		if (!message.channel_id || !message.author) return 'not a normal message'
		if (message.author.id === myId()) return 'your own message'
		if (!message.content && !(message.attachments && message.attachments.length)) return 'empty'
		if (setting('respectSilentPings') && (message.flags & SILENT_MESSAGE_FLAG)) return 'silent message'
		if (String(myStatus()) !== setting('statusToUse')) return 'your status does not match'
		if (message.channel_id === viewedChannelId() && appIsOpen()) return 'you are looking at it'
		return null
	}
	function appIsOpen() {
		try { return valenced.react.ReactNative.AppState.currentState === 'active' } catch (e) { return true }
	}

	/** Whether the list lets this message through. */
	function listAllows(message) {
		const list = readList()
		const channel = getChannel(message.channel_id)
		const mentioned = isMentioned(message)
		const fromChosenPerson = list.users.includes(message.author.id)

		if (isDirectMessage(channel)) return fromChosenPerson || list.channels.includes(channel.id)

		const guildId = message.guild_id || (channel && channel.guild_id)
		const fromChosenPlace = list.channels.includes(message.channel_id) || (!!guildId && list.guilds.includes(guildId))
		if (fromChosenPlace && (mentioned || !setting('onlyMentions'))) return true
		return fromChosenPerson && setting('allowOutsideOfDms') && mentioned
	}

	function shouldNotify(event) {
		const message = event && event.message
		if (!message) return false
		return reasonToIgnore(message, event) === null && listAllows(message)
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Notifying
	// ---------------------------------------------------------------------------------------------------
	const activity = { messages: 0, banners: 0, vibrations: 0, discordAnswers: 0, last: '' }

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
	function notify(message) {
		activity.messages += 1
		activity.last = describeMessage(message).slice(0, 60)
		if (setting('showBanner')) { activity.banners += 1; toast(describeMessage(message)) }
		if (setting('vibrate')) vibrate()
		redrawSettings()
	}
	function vibrate() {
		try { valenced.react.ReactNative.Vibration.vibrate(200); activity.vibrations += 1 } catch (e) {}
	}

	// ---- Optional: let Discord's own notification through too --------------------------------------------
	// While Discord handles a bypassing message, the status stores answer "online" instead of "do not disturb".
	let bypassDepth = 0

	function findDispatcher() {
		const flux = valenced.discord.flux || {}
		const known = flux.FluxDispatcher || flux.dispatcher || flux.Dispatcher
		if (known && typeof known.dispatch === 'function') return known
		const finders = valenced.modules.finders
		const found = finders.lookupModule(finders.filters.withProps('dispatch', 'subscribe', 'unsubscribe'))[0]
		return found && typeof found.dispatch === 'function' ? found : null
	}
	/** Every method name of a store, including inherited ones. */
	function methodNamesOf(store) {
		const names = new Set()
		for (let object = store, guard = 0; object && object !== Object.prototype && guard < 6; object = Object.getPrototypeOf(object), guard += 1) {
			Object.getOwnPropertyNames(object).forEach((name) => names.add(name))
		}
		return [...names]
	}
	function makeStatusStoresAnswerOnline(cleanup, hooked) {
		const isStatusGetter = (name) => /^get(Self)?(Presence)?Status$/.test(name)
		const isDndFlag = (name) => /^(is)?(DND|DoNotDisturb)$/i.test(name)
		;['SelfPresenceStore', 'PresenceStore', 'StatusStore'].forEach((storeName) => {
			const store = stores()[storeName]
			if (!store) return
			methodNamesOf(store).filter((name) => typeof store[name] === 'function' && (isStatusGetter(name) || isDndFlag(name))).forEach((method) => {
				cleanup(valenced.patcher.after(store, method, (result) => {
					if (bypassDepth === 0) return result
					if (isStatusGetter(method) && result === 'dnd') { activity.discordAnswers += 1; return 'online' }
					if (isDndFlag(method) && result === true) { activity.discordAnswers += 1; return false }
					return result
				}))
				hooked.push(`${storeName}.${method}`)
			})
		})
	}

	// ---- Listening to messages ---------------------------------------------------------------------------
	const hooks = { dispatcher: 'not found', patched: [], error: '' }

	function listenToMessages(cleanup) {
		const dispatcher = findDispatcher()
		if (!dispatcher) return
		hooks.dispatcher = 'found'
		cleanup(valenced.patcher.instead(dispatcher, 'dispatch', function (args, original) {
			const event = args && args[0]
			const passes = isNewMessage(event) && safely(() => shouldNotify(event))
			if (!passes) return Reflect.apply(original, this, args)

			if (setting('letDiscordNotify')) bypassDepth += 1
			try {
				return Reflect.apply(original, this, args)
			} finally {
				if (setting('letDiscordNotify')) bypassDepth -= 1
				notify(event.message)
			}
		}))
		hooks.patched.push('Dispatcher.dispatch')
		makeStatusStoresAnswerOnline(cleanup, hooks.patched)
	}
	const isNewMessage = (event) => !!event && event.type === 'MESSAGE_CREATE'
	function safely(work) {
		try { return work() } catch (e) { hooks.error = String((e && e.message) || e).slice(0, 80); return false }
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. The hold-down menu: a "Bypass Do Not Disturb" row next to Mute
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
	// 6. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function buildReport() {
		const list = readList()
		return [
			'Bypass Status report',
			`version: ${VERSION}`,
			`list: ${list.users.length} people, ${list.channels.length} channels or chats, ${list.guilds.length} servers`,
			`status to use: ${setting('statusToUse')}; my status now: ${myStatus()}`,
			`dispatcher: ${hooks.dispatcher}; hooked: ${hooks.patched.join(', ')}`,
			`messages let through: ${activity.messages}; banners: ${activity.banners}; vibrations: ${activity.vibrations}; status answers changed: ${activity.discordAnswers}`,
			`last: ${activity.last || '-'}`,
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
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const list = readList()
		const query = String(search).toLowerCase().trim()
		const matches = (label) => !query || String(label).toLowerCase().includes(query)

		const chosenRow = (kind, id, label, hint) =>
			h(Design.TableRow, { key: `${kind}${id}`, label, subLabel: `${hint} Tap to remove.`, onPress: () => { setOnList(kind, id, false); toast('Removed') } })
		const addRow = (kind, id, label) =>
			h(Design.TableRow, { key: `add${kind}${id}`, label, subLabel: 'Tap to add', onPress: () => { setOnList(kind, id, true); toast(`Added ${label}`) } })
		const toggleRow = (key, label, subLabel) =>
			h(Design.TableSwitchRow, { key, label, subLabel, value: !!setting(key), onValueChange: (value) => saveSettings({ [key]: !!value }) })

		const peopleRows = list.users.map((id) => chosenRow('users', id, userLabel(id), 'Their direct messages.'))
		const channelRows = list.channels.map((id) => chosenRow('channels', id, channelLabel(id), 'When you are mentioned there.'))
		const serverRows = list.guilds.map((id) => chosenRow('guilds', id, guildLabel(id), 'Every channel, when you are mentioned.'))

		const chatsToAdd = allDirectMessageIds().filter((id) => { const e = listEntryForChat(id); return !list[e.kind].includes(e.id) && matches(channelLabel(id)) }).slice(0, 40)
		const serversToAdd = allGuilds().filter((guild) => !list.guilds.includes(guild.id) && matches(guild.name)).slice(0, 40)

		const viewed = viewedChannelId()
		const viewedEntry = viewed ? listEntryForChat(viewed) : null
		const viewedIsChosen = !!viewedEntry && list[viewedEntry.kind].includes(viewedEntry.id)
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
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `${count ? `${count} on the list. ` : 'The list is empty. '}Messages from the list reach you while your status is ${STATUS_CHOICES.find((s) => s.value === setting('statusToUse')).label}. Hold a chat, a channel or a server and choose Bypass Do Not Disturb, or add them below.`),
					h(
						RN.View,
						{ style: { flexDirection: 'row', gap: 10 } },
						viewedEntry && h(RN.View, { style: { flex: 1 } }, h(Design.Button, {
							text: viewedIsChosen ? 'Remove this chat' : 'Add the chat I am in', variant: 'primary', size: 'sm',
							onPress: () => { setOnList(viewedEntry.kind, viewedEntry.id, !viewedIsChosen); toast(viewedIsChosen ? 'Removed' : `Added ${channelLabel(viewed)}`) },
						})),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport })),
					),
				),
				h(
					Design.TableRadioGroup,
					{ title: 'Let messages through when my status is', value: setting('statusToUse'), onChange: (value) => saveSettings({ statusToUse: value }) },
					STATUS_CHOICES.map((choice) => h(Design.TableRadioRow, { key: choice.value, label: choice.label, value: choice.value })),
				),
				h(Design.TableRowGroup, { title: 'People' }, peopleRows.length ? peopleRows : [h(Design.TableRow, { key: 'nobody', label: 'Nobody yet', subLabel: 'Hold a direct message to add the person.' })]),
				h(Design.TableRowGroup, { title: 'Channels and group chats' }, channelRows.length ? channelRows : [h(Design.TableRow, { key: 'nochannel', label: 'None yet', subLabel: 'Hold a channel or a group chat.' })]),
				h(Design.TableRowGroup, { title: 'Servers' }, serverRows.length ? serverRows : [h(Design.TableRow, { key: 'noserver', label: 'None yet', subLabel: 'Hold a server.' })]),
				h(Design.TextInput, { label: 'Find a chat or a server', placeholder: 'Search', size: 'md', value: search, onChange: (value) => setSearch(value) }),
				h(Design.TableRowGroup, { title: 'Add a chat' }, chatsToAdd.length ? chatsToAdd.map((id) => addRow(listEntryForChat(id).kind, listEntryForChat(id).id, channelLabel(id))) : [h(Design.TableRow, { key: 'nochats', label: query ? 'No match' : 'No chats found', subLabel: 'Open the Messages tab once so Discord loads the list.' })]),
				h(Design.TableRowGroup, { title: 'Add a server' }, serversToAdd.length ? serversToAdd.map((guild) => addRow('guilds', guild.id, guild.name)) : [h(Design.TableRow, { key: 'noservers', label: query ? 'No match' : 'No servers found' })]),
				h(
					Design.TableRowGroup,
					{ title: 'Rules' },
					toggleRow('onlyMentions', 'Servers and channels: only when I am mentioned', 'Off lets every message of a chosen channel or server through.'),
					toggleRow('allowOutsideOfDms', 'Chosen people: also in servers', 'When they mention you, wherever it is.'),
					toggleRow('respectSilentPings', 'Respect silent messages', 'A message sent with @silent stays silent.'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'How I am told' },
					toggleRow('showBanner', 'Show a banner', 'A short message at the top: who wrote what.'),
					toggleRow('vibrate', 'Vibrate', 'One short buzz.'),
					toggleRow('letDiscordNotify', 'Let Discord notify too (experimental)', 'Discord handles the message as if you were online, so its own notification and sound can appear. A notification Discord sends while the app is closed is decided by its servers, which this plugin cannot change.'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Diagnostics' },
					h(Design.TableRow, { key: 'report', label: 'Copy diagnostic report', subLabel: 'Paste it to the developer if something does not work.', onPress: copyReport }),
					h(Design.TableRow, { key: 'activity', label: 'So far', subLabel: `${activity.messages} message(s) let through · ${activity.banners} banner(s) · ${activity.vibrations} vibration(s) · Discord was told you are online ${activity.discordAnswers} time(s)` }),
					hooks.error && h(Design.TableRow, { key: 'error', label: 'Problem', subLabel: hooks.error }),
				),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			globalThis.__bypassStatusInstance = INSTANCE
			storage = api.jsonStorage
			const attempt = (what, step) => { try { step() } catch (e) { hooks.error = `${what}: ${String((e && e.message) || e).slice(0, 70)}` } }
			attempt('listening', () => listenToMessages(api.cleanup))
			attempt('menus', () => hookMenus(api.cleanup))
			api.cleanup(() => { bypassDepth = 0; screenListeners = [] })
		},
	})
	return exports
})({})
