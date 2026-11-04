(function (exports) {
	/*
	 * Show Hidden Channels for Valenced
	 *
	 * Shows the channels of a server that you are not allowed to open, marks them (lock, dimmed) and, when you tap
	 * one, opens an info sheet instead: topic, when it was made, when it was last used and who is allowed in.
	 * Servers, channel types, channels, categories and names can be allowed or blocked in the settings.
	 *
	 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) already has
	 * every channel of a server in `ChannelStore`: Discord only hides the ones you may not view when it draws the
	 * list. In `discord_app/modules/guild_sidebar/ChannelListState.tsx` each channel row asks
	 *
	 *     PermissionStore.can(VIEW_CHANNEL, channel)
	 *
	 * and when the answer is no, it asks one more question before it gives up:
	 *
	 *     GatedChannelStore.isChannelGatedAndVisible(guildId, channelId)
	 *
	 * (a channel you can see but need a role for). This plugin wraps that second question and answers "yes" for the
	 * channels your rules allow, so Discord draws them with its own code. Nothing else about permissions changes:
	 * messages, sending and joining still follow your real permissions. Tapping a revealed channel is caught in
	 * `discord_app/modules/routing/transitionToChannel.tsx` (text channels) and on the voice row, because Discord's
	 * servers would answer "Missing Access".
	 *
	 * The file reads top to bottom:  1 Settings  2 Rules  3 Hooks  4 Info sheet  5 Settings screens
	 *                                6 Report and self-check  7 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '1.0.0'
	const INSTANCE = {}
	const VIEW_CHANNEL = 1024 // Permission bit 1 << 10

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const stores = () => (valenced.discord.flux && valenced.discord.flux.Stores) || {}
	const store = (name) => { try { return stores()[name] } catch (e) { return undefined } }
	const parseJson = (text, fallback) => {
		try { const value = JSON.parse(text); return value === undefined || value === null ? fallback : value } catch (e) { return fallback }
	}
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_SHOW_HIDDEN', { text: String(text) }) } catch (e) {}
	}
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}
	/** The name of a React component, also for memo and forwardRef wrappers. */
	function componentName(element) {
		const type = element && element.type
		if (!type || typeof type === 'string') return ''
		const inner = type.type || type.render || type
		return type.displayName || type.name || (inner && (inner.displayName || inner.name)) || ''
	}
	const ids = (text) => [...new Set(String(text || '').match(/\d{15,20}/g) || [])]
	const words = (text) => [...new Set(String(text || '').split(/[,\n;]+/).map((w) => w.trim().toLowerCase()).filter(Boolean))]

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	const TYPES = [
		{ key: 'text', label: 'Text channels', numbers: [0] },
		{ key: 'announcement', label: 'Announcement channels', numbers: [5] },
		{ key: 'voice', label: 'Voice channels', numbers: [2] },
		{ key: 'stage', label: 'Stage channels', numbers: [13] },
		{ key: 'forum', label: 'Forum channels', numbers: [15] },
		{ key: 'media', label: 'Media channels', numbers: [16] },
		{ key: 'other', label: 'Other kinds (directory and so on)', numbers: [] },
	]
	const NEVER_REVEALED = new Set([1, 3, 4, 10, 11, 12]) // DMs, group DMs, categories, threads
	const typeKeyOf = (number) => { const found = TYPES.find((t) => t.numbers.includes(number)); return found ? found.key : 'other' }
	const typeLabelOf = (number) => ({ 0: 'Text channel', 2: 'Voice channel', 5: 'Announcement channel', 13: 'Stage channel', 15: 'Forum channel', 16: 'Media channel', 14: 'Directory' }[number] || `Channel (type ${number})`)

	const defaults = {
		enabled: true,
		scopeMode: 'all', // 'all': every server except the blocked ones. 'whitelist': only the allowed servers
		guildAllowJson: '[]',
		guildBlockJson: '[]',
		channelAllowJson: '[]', // revealed even when its server is not allowed
		channelBlockJson: '[]',
		categoryBlockJson: '[]',
		typesJson: JSON.stringify({ text: true, announcement: true, voice: true, stage: true, forum: true, media: true, other: false }),
		blockWords: '', // channels whose name has one of these words stay hidden
		onlyWords: '', // when filled in, only channels whose name has one of these words are shown
		skipNsfw: false,
		tap: 'info', // 'info': info sheet. 'try': let Discord try to open it. 'nothing'
		marker: 'lock', // 'lock', 'forbidden', 'eye', 'key', 'custom', 'none'
		markerCustom: '🔒',
		markerPosition: 'before', // 'before' or 'after' the name
		dim: true, // draw revealed channels like muted ones
		sheetTopic: true,
		sheetDates: true,
		sheetWho: true,
		sheetIds: true,
	}

	let storage
	let screenListeners = []
	const redrawSettings = () => screenListeners.slice().forEach((redraw) => { try { redraw() } catch (e) {} })
	function setting(key) {
		const saved = storage && storage.cache && storage.cache[key]
		return saved !== undefined ? saved : defaults[key]
	}
	function saveSettings(patch, refresh = true) {
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		cache.rules = null
		if (refresh) scheduleRefresh()
		redrawSettings()
	}

	// ---------------------------------------------------------------------------------------------------
	// 2. Rules: which hidden channels are shown
	// ---------------------------------------------------------------------------------------------------
	const cache = { rules: null } // the settings turned into sets once, until the next change
	function rules() {
		if (cache.rules) return cache.rules
		const set = (key) => new Set((Array.isArray(parseJson(setting(key), [])) ? parseJson(setting(key), []) : []).filter((id) => typeof id === 'string'))
		const types = parseJson(setting('typesJson'), {})
		cache.rules = {
			enabled: !!setting('enabled'),
			scopeMode: setting('scopeMode') === 'whitelist' ? 'whitelist' : 'all',
			guildAllow: set('guildAllowJson'),
			guildBlock: set('guildBlockJson'),
			channelAllow: set('channelAllowJson'),
			channelBlock: set('channelBlockJson'),
			categoryBlock: set('categoryBlockJson'),
			types: TYPES.reduce((all, t) => ({ ...all, [t.key]: types[t.key] !== undefined ? !!types[t.key] : !!JSON.parse(defaults.typesJson)[t.key] }), {}),
			blockWords: words(setting('blockWords')),
			onlyWords: words(setting('onlyWords')),
			skipNsfw: !!setting('skipNsfw'),
		}
		return cache.rules
	}
	const listOf = (key) => { const value = parseJson(setting(key), []); return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [] }
	const putInList = (key, id, wanted) => {
		const without = listOf(key).filter((x) => x !== id)
		saveSettings({ [key]: JSON.stringify(wanted ? [...without, id] : without) })
	}

	const getChannel = (id) => { try { return store('ChannelStore').getChannel(id) } catch (e) { return null } }
	const getGuild = (id) => { try { return store('GuildStore').getGuild(id) } catch (e) { return null } }
	const guildName = (id) => { const guild = getGuild(id); return guild ? guild.name : `Server ${String(id).slice(-4)}` }
	const channelName = (id) => { const channel = getChannel(id); return channel ? `#${channel.name || 'channel'}` : `Channel ${String(id).slice(-4)}` }

	/** True when Discord says you may not open the channel. */
	function cannotView(channel) {
		try {
			const permissions = store('PermissionStore')
			if (!permissions || typeof permissions.can !== 'function') return false
			return permissions.can(BigInt(VIEW_CHANNEL), channel) === false
		} catch (e) { return false }
	}

	/** Why a hidden channel is shown or not. `ok` is the answer. */
	function decide(channel) {
		const r = rules()
		if (!r.enabled) return { ok: false, why: 'The plugin is off' }
		if (!channel || !channel.guild_id) return { ok: false, why: 'Not a server channel' }
		if (NEVER_REVEALED.has(channel.type)) return { ok: false, why: 'Categories, threads and DMs are never changed' }
		if (!r.types[typeKeyOf(channel.type)]) return { ok: false, why: `${typeLabelOf(channel.type)}s are turned off` }
		if (r.channelBlock.has(channel.id)) return { ok: false, why: 'This channel is on your blocked list' }
		if (channel.parent_id && r.categoryBlock.has(channel.parent_id)) return { ok: false, why: 'Its category is on your blocked list' }
		if (r.channelAllow.has(channel.id)) return { ok: true, why: 'This channel is on your allowed list' }
		if (r.scopeMode === 'whitelist') {
			if (!r.guildAllow.has(channel.guild_id)) return { ok: false, why: 'The server is not on your allowed list' }
		} else if (r.guildBlock.has(channel.guild_id)) return { ok: false, why: 'The server is on your blocked list' }
		const name = String(channel.name || '').toLowerCase()
		if (r.blockWords.some((w) => name.includes(w))) return { ok: false, why: 'The name has a blocked word' }
		if (r.onlyWords.length && !r.onlyWords.some((w) => name.includes(w))) return { ok: false, why: 'The name has none of your "only" words' }
		if (r.skipNsfw && channel.nsfw) return { ok: false, why: 'Age-restricted channels are skipped' }
		return { ok: true, why: 'Allowed by your rules' }
	}
	/** A hidden channel that the rules show. */
	const isRevealed = (channel) => !!channel && cannotView(channel) && decide(channel).ok

	// ---------------------------------------------------------------------------------------------------
	// 3. Hooks
	// ---------------------------------------------------------------------------------------------------
	const hooks = { gated: 'not found', transition: 'not found', preload: 'not found', rows: 0, list: 'not found', patched: [], problems: [] }
	const stats = { asked: 0, shown: new Set(), taps: 0, decorated: 0, refreshes: 0 }
	const log = []
	function addLog(text, ok = true) {
		log.unshift({ at: Date.now(), text, ok })
		if (log.length > 12) log.length = 12
		redrawSettings()
	}
	const problem = (what, error) => {
		const text = `${what}: ${(error && error.message) || error}`
		if (!hooks.problems.includes(text)) hooks.problems.push(text)
		addLog(text, false)
	}

	/** Wraps Discord's "can you see this gated channel" question. */
	function hookGatedQuestion(cleanup) {
		let gated = store('GatedChannelStore')
		if (!gated || typeof gated.isChannelGatedAndVisible !== 'function') {
			const mod = findModule('isChannelGatedAndVisible', 'isChannelGated')
			gated = mod && (typeof mod.isChannelGatedAndVisible === 'function' ? mod : mod.default)
		}
		if (!gated || typeof gated.isChannelGatedAndVisible !== 'function') return
		hooks.gated = 'found'
		cleanup(valenced.patcher.instead(gated, 'isChannelGatedAndVisible', function (args, original) {
			const answer = Reflect.apply(original, this, args)
			if (answer) return answer
			try {
				stats.asked += 1
				const channel = getChannel(args[1])
				if (channel && cannotView(channel) && decide(channel).ok) { stats.shown.add(channel.id); return true }
			} catch (e) {}
			return answer
		}))
		hooks.patched.push('GatedChannelStore.isChannelGatedAndVisible')
	}

	function findModule(...names) {
		const finders = valenced.modules.finders
		return finders.lookupModule(finders.filters.withProps(...names))[0] || null
	}

	/** A tap on a revealed text channel: show the info sheet (or whatever the settings say) instead of opening it. */
	function hookTransition(cleanup) {
		const mod = findModule('transitionToChannel', 'transitionToThread')
		if (!mod) return
		const holders = [mod, mod.default].filter((m, i, all) => m && typeof m === 'object' && typeof m.transitionToChannel === 'function' && all.indexOf(m) === i)
		holders.forEach((holder) => {
			cleanup(valenced.patcher.instead(holder, 'transitionToChannel', function (args, original) {
				try {
					const channel = getChannel(args[0])
					if (channel && isRevealed(channel)) {
						stats.taps += 1
						const how = setting('tap')
						if (how === 'info') { openInfo(channel.id); return undefined }
						if (how === 'nothing') return undefined
					}
				} catch (e) {}
				return Reflect.apply(original, this, args)
			}))
		})
		if (holders.length) { hooks.transition = 'found'; hooks.patched.push('transitionToChannel') }
	}

	/** Discord loads the messages of a channel when you touch it. For a revealed channel that would only fail. */
	function hookPreload(cleanup) {
		const mod = findModule('preload', 'ensurePrivateChannel')
		const holder = mod && (typeof mod.preload === 'function' ? mod : mod.default)
		if (!holder || typeof holder.preload !== 'function') return
		cleanup(valenced.patcher.instead(holder, 'preload', function (args, original) {
			try { const channel = getChannel(args[1]); if (channel && isRevealed(channel)) return undefined } catch (e) {}
			return Reflect.apply(original, this, args)
		}))
		hooks.preload = 'found'
		hooks.patched.push('ChannelActionCreators.preload')
	}

	// The marker and the dimmed look: Discord draws a row from a `channel` prop. Revealed channels get a copy
	// of it with another name and `muted` on. The copy is kept so the row's memo still works.
	const MARKERS = { lock: '🔒', forbidden: '🚫', eye: '👁️', key: '🔑' }
	const markerText = () => {
		const kind = setting('marker')
		if (kind === 'none') return ''
		return kind === 'custom' ? String(setting('markerCustom') || '').slice(0, 8) : MARKERS[kind] || '🔒'
	}
	const copies = new WeakMap()
	function decorated(channel) {
		const marker = markerText()
		const after = setting('markerPosition') === 'after'
		const dim = !!setting('dim')
		const signature = `${marker}|${after}|${dim}|${channel.name}|${channel.muted}`
		const known = copies.get(channel)
		if (known && known.signature === signature) return known.copy
		const name = marker ? (after ? `${channel.name} ${marker}` : `${marker} ${channel.name}`) : channel.name
		const extra = { name: { value: name, enumerable: true, writable: true, configurable: true } }
		if (dim) extra.muted = { value: true, enumerable: true, writable: true, configurable: true }
		const copy = Object.create(channel, extra)
		copies.set(channel, { signature, copy })
		return copy
	}
	const ROW_COMPONENTS = new Set(['TextChannel', 'ChannelItem'])

	function hookRows(cleanup) {
		const finders = valenced.modules.finders
		const runtime = finders.lookupModule(finders.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		const onNewElement = (element) => {
			try {
				if (globalThis.__showHiddenChannelsInstance !== INSTANCE) return element // an older copy is still loaded
				const props = element && element.props
				const channel = props && props.channel
				if (!channel || typeof channel !== 'object' || !channel.guild_id || !channel.id || !ROW_COMPONENTS.has(componentName(element))) return element
				if (!rules().enabled || !isRevealed(channel)) return element
				hooks.rows += 1
				stats.decorated += 1
				const React = valenced.react.React
				const next = { channel: decorated(channel) }
				if (componentName(element) === 'ChannelItem' && typeof props.onPress === 'function' && setting('tap') !== 'try') {
					const original = props.onPress
					next.onPress = function (...args) {
						stats.taps += 1
						if (setting('tap') === 'info') openInfo(channel.id)
						else return Reflect.apply(original, this, args)
					}
				}
				return React.cloneElement(element, next)
			} catch (e) { return element }
		}
		;['jsx', 'jsxs'].forEach((name) => {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, onNewElement))
		})
		hooks.patched.push('channel rows (marker, dim, voice tap)')
	}

	/** Makes Discord build the channel list again, so a changed rule shows at once. */
	let refreshTimer
	function listStates() {
		const mod = findModule('ChannelListSections', 'SECTION_INDEX_RECENTS')
		const states = mod && (mod.default || mod)
		return states && typeof states.clear === 'function' ? states : null
	}
	function refreshList() {
		try {
			const states = listStates()
			if (!states) { hooks.list = 'not found'; return false }
			hooks.list = 'found'
			states.clear()
			const listStore = store('ChannelListStore')
			if (listStore && typeof listStore.emitChange === 'function') listStore.emitChange()
			stats.refreshes += 1
			return true
		} catch (e) { problem('refresh', e); return false }
	}
	function scheduleRefresh() {
		clearTimeout(refreshTimer)
		refreshTimer = setTimeout(refreshList, 250)
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Info sheet
	// ---------------------------------------------------------------------------------------------------
	const SHEET_KEY = 'MARKLONG_SHOW_HIDDEN_INFO'
	const DISCORD_EPOCH = 1420070400000
	const snowflakeTime = (id) => (id ? Math.floor(Number(id) / 4194304) + DISCORD_EPOCH : 0)
	function dateLabel(ms) {
		if (!ms) return 'unknown'
		const date = new Date(ms)
		const ago = Math.max(0, Date.now() - ms)
		const days = Math.floor(ago / 86400000)
		const rough = days >= 365 ? `${Math.floor(days / 365)} y ago` : days >= 30 ? `${Math.floor(days / 30)} mo ago` : days >= 1 ? `${days} d ago` : 'today'
		return `${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })} (${rough})`
	}
	function hasBit(value, bit) {
		try { return (BigInt(value) & BigInt(bit)) !== BigInt(0) } catch (e) { return false }
	}

	/** The roles and people the channel's own settings let in (the "allowed" ones), by name. */
	function whoCanSee(channel) {
		const overwrites = channel.permissionOverwrites || {}
		const roles = []
		const members = []
		let everyoneDenied = false
		Object.keys(overwrites).forEach((id) => {
			const o = overwrites[id] || {}
			const isMember = o.type === 1 || o.type === 'member'
			if (!isMember && id === channel.guild_id && hasBit(o.deny, VIEW_CHANNEL)) everyoneDenied = true
			if (!hasBit(o.allow, VIEW_CHANNEL)) return
			if (isMember) {
				const user = (() => { try { return store('UserStore').getUser(id) } catch (e) { return null } })()
				members.push(user ? user.globalName || user.global_name || user.username : `User ${String(id).slice(-4)}`)
			} else {
				const role = (() => { try { return store('GuildRoleStore').getRole(channel.guild_id, id) } catch (e) { return null } })()
				roles.push(role ? role.name : `Role ${String(id).slice(-4)}`)
			}
		})
		return { roles, members, everyoneDenied }
	}

	function copyText(text, done) {
		try { valenced.externals.ReactNativeClipboard.Clipboard.setString(String(text)); toast(done || 'Copied') } catch (e) { toast('Could not copy') }
	}

	// A sheet that scrolls: Discord's own bottom-sheet scroll view when it can be found, else a plain one.
	let scrollPick
	let boundaryClass
	function sheetScrollComponent() {
		const RN = valenced.react.ReactNative
		if (scrollPick) return scrollPick
		let pick = RN.ScrollView
		try {
			const D = valenced.discord.design.Design
			let c = D && (D.BottomSheetScrollView || D.ActionSheetScrollView)
			if (!c) { const m = findModule('BottomSheetScrollView'); c = m && m.BottomSheetScrollView }
			if (c) pick = c
		} catch (e) {}
		scrollPick = pick
		return pick
	}
	function scrollBoundary() {
		if (boundaryClass) return boundaryClass
		const React = valenced.react.React
		if (typeof React.Component !== 'function') return null
		boundaryClass = class extends React.Component {
			constructor(p) { super(p); this.state = { bad: false } }
			static getDerivedStateFromError() { return { bad: true } }
			componentDidCatch() {}
			render() { return this.state.bad ? this.props.fallback : this.props.children }
		}
		return boundaryClass
	}
	function scrollView(RN, scrollProps, ...children) {
		const Scroll = sheetScrollComponent()
		const plain = h(RN.ScrollView, scrollProps, ...children)
		const Boundary = Scroll === RN.ScrollView ? null : scrollBoundary()
		if (!Boundary) return plain
		return h(Boundary, { fallback: plain }, h(Scroll, scrollProps, ...children))
	}

	function InfoSheet({ channelId }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const size = RN.useWindowDimensions ? RN.useWindowDimensions() : { height: 800 }
		const [, redraw] = React.useState(0)
		const channel = getChannel(channelId)
		if (!channel) return h(Design.ActionSheet, null, h(RN.View, { style: { padding: 20 } }, h(Design.Text, { variant: 'text-md/medium' }, 'This channel is not there any more.')))
		const parent = channel.parent_id ? getChannel(channel.parent_id) : null
		const who = setting('sheetWho') ? whoCanSee(channel) : null
		const decision = decide(channel)
		const close = () => { try { valenced.discord.actions.ActionSheetActionCreators.hideActionSheet(SHEET_KEY) } catch (e) {} }
		const row = (label, value) => h(Design.TableRow, { key: label, label, subLabel: value, onPress: () => copyText(value, `${label} copied`) })
		const link = `https://discord.com/channels/${channel.guild_id}/${channel.id}`
		const rows = [
			row('Server', guildName(channel.guild_id)),
			row('Kind', typeLabelOf(channel.type)),
			parent ? row('Category', parent.name || 'unknown') : null,
			channel.nsfw ? row('Age-restricted', 'Yes') : null,
			setting('sheetTopic') ? row('Topic', channel.topic ? String(channel.topic) : 'No topic') : null,
			setting('sheetDates') ? row('Created', dateLabel(snowflakeTime(channel.id))) : null,
			setting('sheetDates') ? row('Last message', channel.lastMessageId || channel.last_message_id ? dateLabel(snowflakeTime(channel.lastMessageId || channel.last_message_id)) : 'none known') : null,
			channel.rateLimitPerUser ? row('Slowmode', `${channel.rateLimitPerUser} seconds`) : null,
		].filter(Boolean)
		const whoRows = who ? [
			who.everyoneDenied ? h(Design.TableRow, { key: 'everyone', label: 'Everyone else', subLabel: 'Not allowed to see it' }) : null,
			row('Roles let in', who.roles.length ? who.roles.join(', ') : 'None named in its settings'),
			who.members.length ? row('People let in', who.members.join(', ')) : null,
		].filter(Boolean) : []
		return h(
			Design.ActionSheet,
			null,
			scrollView(
				RN,
				{ style: { maxHeight: Math.max(240, Math.round(size.height - 230)) }, contentContainerStyle: { padding: 16, paddingBottom: 24, gap: 14 }, nestedScrollEnabled: true, scrollEnabled: true, showsVerticalScrollIndicator: true },
				h(Design.Text, { variant: 'heading-lg/bold' }, `${markerText() || '🔒'} ${channel.name || 'channel'}`.trim()),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'You cannot open this channel. Discord would say "Missing Access". This is what the app knows about it.'),
				h(Design.TableRowGroup, { title: 'About' }, ...rows),
				who && h(Design.TableRowGroup, { title: 'Who can see it' }, ...whoRows),
				setting('sheetIds') && h(
					Design.TableRowGroup,
					{ title: 'Copy' },
					h(Design.TableRow, { key: 'cid', label: 'Channel ID', subLabel: channel.id, onPress: () => copyText(channel.id, 'Channel ID copied') }),
					h(Design.TableRow, { key: 'gid', label: 'Server ID', subLabel: channel.guild_id, onPress: () => copyText(channel.guild_id, 'Server ID copied') }),
					h(Design.TableRow, { key: 'link', label: 'Channel link', subLabel: link, onPress: () => copyText(link, 'Link copied') }),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Your rules' },
					h(Design.TableRow, { key: 'why', label: 'Why it is shown', subLabel: decision.why }),
					h(Design.TableRow, { key: 'blockc', label: 'Stop showing this channel', onPress: () => { putInList('channelBlockJson', channel.id, true); addLog(`Blocked ${channelName(channel.id)}`); toast('This channel is hidden again'); close() } }),
					channel.parent_id ? h(Design.TableRow, { key: 'blockcat', label: 'Stop showing this whole category', subLabel: parent && parent.name, onPress: () => { putInList('categoryBlockJson', channel.parent_id, true); addLog(`Blocked category ${parent && parent.name}`); toast('This category is hidden again'); close() } }) : null,
					h(Design.TableRow, { key: 'blocks', label: 'Stop showing hidden channels in this server', onPress: () => { putInList('guildBlockJson', channel.guild_id, true); putInList('guildAllowJson', channel.guild_id, false); addLog(`Blocked server ${guildName(channel.guild_id)}`); toast('Done for this server'); close() } }),
				),
				h(Design.Button, { text: 'Close', variant: 'secondary', onPress: close }),
			),
		)
	}

	function openInfo(channelId) {
		try {
			addLog(`Opened info for ${channelName(channelId)}`)
			valenced.discord.actions.ActionSheetActionCreators.openLazy(Promise.resolve({ default: function () { return h(InfoSheet, { channelId }) } }), SHEET_KEY, {})
		} catch (e) {
			problem('info sheet', e)
			toast('Could not open the info sheet')
		}
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. Settings screens
	// ---------------------------------------------------------------------------------------------------
	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}
	function Pill({ text, color }) {
		const { View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(View, { style: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: `${color}33` } }, h(Text, { variant: 'text-xs/bold', style: { color } }, text))
	}
	function Chip({ text, selected, onPress }) {
		const { Pressable, View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(Pressable, { onPress, accessibilityRole: 'button' }, h(View, { style: { minHeight: 36, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? '#5865f2' : '#383a40' } }, h(Text, { variant: 'text-sm/semibold', style: { color: '#fff' } }, text)))
	}
	function Field({ label, description, value, placeholder, maxLength, multiline, onCommit }) {
		const { React } = valenced.react
		const { TextInput } = valenced.discord.design.Design
		const [text, setText] = React.useState(value == null ? '' : String(value))
		React.useEffect(() => {
			if (text === (value == null ? '' : String(value))) return undefined
			const timer = setTimeout(() => onCommit(text), 400)
			return () => clearTimeout(timer)
		}, [text])
		return h(TextInput, { label, description, placeholder, size: 'md', maxLength, multiline, value: text, onChange: setText, autoCapitalize: 'none', autoCorrect: false })
	}
	function Radio({ title, value, items, onChange }) {
		const Design = valenced.discord.design.Design
		return h(Design.TableRadioGroup, { title, value, onChange }, items.map((item) => h(Design.TableRadioRow, { key: String(item.v), label: item.l, subLabel: item.s, value: item.v })))
	}

	const guildList = () => {
		try {
			const all = store('GuildStore').getGuilds()
			return Object.keys(all).map((id) => all[id]).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)))
		} catch (e) { return [] }
	}
	const currentGuildId = () => { try { return store('SelectedGuildStore').getGuildId() } catch (e) { return undefined } }
	/** The hidden channels of a server, and how many of them the rules would show. */
	function hiddenIn(guildId) {
		let hidden = 0
		let shown = 0
		try {
			const all = store('ChannelStore').getMutableGuildChannelsForGuild(guildId)
			Object.keys(all).forEach((id) => {
				const channel = all[id]
				if (!channel || NEVER_REVEALED.has(channel.type) || !cannotView(channel)) return
				hidden += 1
				if (decide(channel).ok) shown += 1
			})
		} catch (e) {}
		return { hidden, shown }
	}
	const ruleOf = (guildId) => (listOf('guildAllowJson').includes(guildId) ? 'allow' : listOf('guildBlockJson').includes(guildId) ? 'block' : 'default')
	function setRule(guildId, rule) {
		const allow = listOf('guildAllowJson').filter((id) => id !== guildId)
		const block = listOf('guildBlockJson').filter((id) => id !== guildId)
		saveSettings({ guildAllowJson: JSON.stringify(rule === 'allow' ? [...allow, guildId] : allow), guildBlockJson: JSON.stringify(rule === 'block' ? [...block, guildId] : block) })
	}

	function ServerRow({ guild, index }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [counts, setCounts] = React.useState(null)
		React.useEffect(() => {
			const timer = setTimeout(() => setCounts(hiddenIn(guild.id)), 30 + index * 15)
			return () => clearTimeout(timer)
		}, [guild.id, rules()])
		const rule = ruleOf(guild.id)
		const mode = rules().scopeMode
		const effective = mode === 'whitelist' ? (rule === 'allow' ? 'shown' : 'not shown') : rule === 'block' ? 'not shown' : 'shown'
		return h(
			RN.View,
			{ style: { gap: 8, paddingHorizontal: 4 } },
			h(Design.TableRow, { label: guild.name, subLabel: `${counts ? `${counts.hidden} hidden channels${counts.hidden ? `, ${counts.shown} shown` : ''}` : 'counting...'} · ${effective}` }),
			h(RN.View, { style: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 6 } },
				h(Chip, { text: 'Default', selected: rule === 'default', onPress: () => setRule(guild.id, 'default') }),
				h(Chip, { text: 'Allow', selected: rule === 'allow', onPress: () => setRule(guild.id, 'allow') }),
				h(Chip, { text: 'Block', selected: rule === 'block', onPress: () => setRule(guild.id, 'block') })),
		)
	}

	function ServersScreen({ onBack }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [query, setQuery] = React.useState('')
		const here = currentGuildId()
		const all = guildList()
		const q = query.trim().toLowerCase()
		const shownGuilds = all.filter((g) => !q || String(g.name).toLowerCase().includes(q))
		const ordered = [...shownGuilds.filter((g) => g.id === here), ...shownGuilds.filter((g) => g.id !== here)]
		const mode = rules().scopeMode
		return h(
			RN.View,
			{ style: { gap: 16 } },
			h(Design.TableRow, { key: 'back', label: '‹ Back', onPress: onBack }),
			h(Card, null,
				h(Design.Text, { variant: 'heading-lg/bold' }, 'Servers'),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, mode === 'whitelist' ? 'Only servers set to Allow show their hidden channels.' : 'Every server shows its hidden channels, except the ones set to Block.'),
				h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
					h(Chip, { text: 'Allow all', onPress: () => saveSettings({ guildAllowJson: JSON.stringify(all.map((g) => g.id)), guildBlockJson: '[]' }) }),
					h(Chip, { text: 'Block all', onPress: () => saveSettings({ guildBlockJson: JSON.stringify(all.map((g) => g.id)), guildAllowJson: '[]' }) }),
					h(Chip, { text: 'Clear all', onPress: () => saveSettings({ guildAllowJson: '[]', guildBlockJson: '[]' }) }))),
			h(Design.TextInput, { key: 'search', placeholder: 'Search your servers', size: 'md', value: query, onChange: setQuery, autoCapitalize: 'none', autoCorrect: false }),
			ordered.length ? ordered.map((guild, index) => h(ServerRow, { key: guild.id, guild, index })) : h(Design.TableRow, { label: all.length ? 'No server matches' : 'No servers found', subLabel: all.length ? undefined : 'The server list was not available. Paste server IDs under "Allowed and blocked" instead.' }),
		)
	}

	function ListEditor({ title, description, storageKey, label }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [text, setText] = React.useState('')
		const current = listOf(storageKey)
		return h(
			RN.View,
			{ style: { gap: 10 } },
			h(Design.TableRowGroup, { title },
				...(current.length ? current.map((id) => h(Design.TableRow, { key: id, label: label(id), subLabel: `${id} · tap to remove`, onPress: () => putInList(storageKey, id, false) })) : [h(Design.TableRow, { key: 'empty', label: 'Nothing here yet', subLabel: description })])),
			h(Design.TextInput, { key: 'paste', placeholder: 'Paste IDs (several allowed)', size: 'md', value: text, onChange: setText, autoCapitalize: 'none', autoCorrect: false }),
			h(Design.Button, { text: 'Add', variant: 'secondary', size: 'sm', disabled: !ids(text).length, onPress: () => { const fresh = ids(text); saveSettings({ [storageKey]: JSON.stringify([...new Set([...current, ...fresh])]) }); setText(''); toast(`Added ${fresh.length}`) } }),
		)
	}

	function ListsScreen({ onBack }) {
		const { ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		return h(
			RN.View,
			{ style: { gap: 18 } },
			h(Design.TableRow, { key: 'back', label: '‹ Back', onPress: onBack }),
			h(Card, null, h(Design.Text, { variant: 'heading-lg/bold' }, 'Allowed and blocked'), h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Copy IDs from the info sheet of a hidden channel, or turn on Developer Mode in Discord and long-press a server, channel or category.')),
			h(ListEditor, { key: 'ca', title: 'Channels always shown', description: 'Shown even when their server is not allowed', storageKey: 'channelAllowJson', label: channelName }),
			h(ListEditor, { key: 'cb', title: 'Channels never shown', description: 'Stay hidden, whatever else is set', storageKey: 'channelBlockJson', label: channelName }),
			h(ListEditor, { key: 'cat', title: 'Categories never shown', description: 'Every channel in them stays hidden', storageKey: 'categoryBlockJson', label: channelName }),
			h(ListEditor, { key: 'ga', title: 'Allowed servers', description: 'Used when "Only allowed servers" is chosen', storageKey: 'guildAllowJson', label: guildName }),
			h(ListEditor, { key: 'gb', title: 'Blocked servers', description: 'Used when "Every server except blocked ones" is chosen', storageKey: 'guildBlockJson', label: guildName }),
		)
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()
		const [, setRedraws] = React.useState(0)
		const [view, setView] = React.useState('main')
		const [checks, setChecks] = React.useState(null)
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const types = parseJson(setting('typesJson'), {})
		const r = rules()
		const here = currentGuildId()
		const hereCounts = here ? hiddenIn(here) : null
		const on = !!setting('enabled')
		const state = !on ? { text: 'Off', color: '#80848e' } : hooks.gated !== 'found' ? { text: 'Not found', color: '#f23f43' } : { text: 'On', color: '#23a55a' }
		const switchRow = (key, label, subLabel) => h(Design.TableSwitchRow, { key, label, subLabel, value: !!setting(key), onValueChange: (value) => saveSettings({ [key]: !!value }) })

		let body
		if (view === 'servers') body = h(ServersScreen, { onBack: () => setView('main') })
		else if (view === 'lists') body = h(ListsScreen, { onBack: () => setView('main') })
		else body = [
			h(Card, { key: 'top' },
				h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 10 } }, h(Design.Text, { variant: 'heading-lg/bold' }, `Show Hidden Channels ${VERSION}`), h(Pill, { text: state.text, color: state.color })),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, here && hereCounts ? `This server: ${hereCounts.hidden} hidden channels, ${hereCounts.shown} shown by your rules.` : 'Open a server to see how many hidden channels it has.'),
				h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Refresh the list', variant: 'secondary', size: 'sm', onPress: () => toast(refreshList() ? 'Channel list rebuilt' : 'Could not rebuild it. Switch server instead.') })),
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Self-check', variant: 'primary', size: 'sm', onPress: () => setChecks(runSelfCheck()) })))),
			h(Design.TableRowGroup, { key: 'general', title: 'General' },
				switchRow('enabled', 'Show hidden channels', 'The main switch'),
			),
			h(Radio, { key: 'tap', title: 'When I tap a hidden channel', value: setting('tap'), onChange: (v) => saveSettings({ tap: v }, false), items: [
				{ v: 'info', l: 'Open an info sheet', s: 'Topic, dates, who is let in (recommended)' },
				{ v: 'try', l: 'Let Discord try to open it', s: 'Usually shows an empty chat or an error' },
				{ v: 'nothing', l: 'Do nothing' },
			] }),
			h(Radio, { key: 'scope', title: 'Which servers', value: r.scopeMode, onChange: (v) => saveSettings({ scopeMode: v }), items: [
				{ v: 'all', l: 'Every server except blocked ones', s: `${listOf('guildBlockJson').length} blocked` },
				{ v: 'whitelist', l: 'Only allowed servers', s: `${listOf('guildAllowJson').length} allowed` },
			] }),
			h(Design.TableRowGroup, { key: 'places', title: 'Servers, channels and categories' },
				h(Design.TableRow, { key: 'servers', label: 'Choose servers', subLabel: 'Allow or block each server, with a count of its hidden channels', onPress: () => setView('servers') }),
				h(Design.TableRow, { key: 'lists', label: 'Allowed and blocked lists', subLabel: `${listOf('channelAllowJson').length} channels always, ${listOf('channelBlockJson').length} never, ${listOf('categoryBlockJson').length} categories never`, onPress: () => setView('lists') }),
			),
			h(Design.TableRowGroup, { key: 'types', title: 'Kinds of channel' },
				...TYPES.map((t) => h(Design.TableSwitchRow, { key: t.key, label: t.label, value: types[t.key] !== undefined ? !!types[t.key] : !!JSON.parse(defaults.typesJson)[t.key], onValueChange: (value) => saveSettings({ typesJson: JSON.stringify({ ...JSON.parse(defaults.typesJson), ...types, [t.key]: !!value }) }) }))),
			h(Design.TableRowGroup, { key: 'filters', title: 'Filters by name' },
				switchRow('skipNsfw', 'Skip age-restricted channels', 'They stay hidden'),
			),
			h(Field, { key: 'blockWords', label: 'Never show names with these words', description: 'Separate with commas, for example: staff, mod, admin', placeholder: 'staff, mod', value: setting('blockWords'), onCommit: (v) => saveSettings({ blockWords: v }) }),
			h(Field, { key: 'onlyWords', label: 'Only show names with these words', description: 'Leave empty to show all. For example: rules, announcements', placeholder: '', value: setting('onlyWords'), onCommit: (v) => saveSettings({ onlyWords: v }) }),
			h(Radio, { key: 'marker', title: 'Mark hidden channels with', value: setting('marker'), onChange: (v) => saveSettings({ marker: v }), items: [
				{ v: 'lock', l: '🔒 Lock' }, { v: 'forbidden', l: '🚫 Forbidden' }, { v: 'eye', l: '👁️ Eye' }, { v: 'key', l: '🔑 Key' }, { v: 'custom', l: 'My own text' }, { v: 'none', l: 'Nothing' },
			] }),
			setting('marker') === 'custom' && h(Field, { key: 'markerCustom', label: 'Your marker', placeholder: '🔒', maxLength: 8, value: setting('markerCustom'), onCommit: (v) => saveSettings({ markerCustom: v }) }),
			h(Radio, { key: 'pos', title: 'Marker position', value: setting('markerPosition'), onChange: (v) => saveSettings({ markerPosition: v }), items: [{ v: 'before', l: 'Before the name' }, { v: 'after', l: 'After the name' }] }),
			h(Design.TableRowGroup, { key: 'look', title: 'Look' },
				switchRow('dim', 'Dim hidden channels', 'Draw them like muted channels'),
			),
			h(Design.TableRowGroup, { key: 'sheet', title: 'Info sheet shows' },
				switchRow('sheetTopic', 'Topic'),
				switchRow('sheetDates', 'Created and last message'),
				switchRow('sheetWho', 'Who can see it'),
				switchRow('sheetIds', 'IDs and link to copy'),
			),
			checks && h(Design.TableRowGroup, { key: 'checks', title: 'Self-check' },
				...checks.map((c, i) => h(Design.TableRow, { key: `c${i}`, label: `${c.ok ? '✓' : '✗'} ${c.label}`, subLabel: c.detail || undefined })),
				h(Design.TableRow, { key: 'copy', label: 'Copy report', onPress: () => copyText(buildReport(), 'Report copied. Paste it in the chat.') })),
			log.length > 0 && h(Design.TableRowGroup, { key: 'log', title: 'Last actions' },
				...log.slice(0, 6).map((l, i) => h(Design.TableRow, { key: `l${i}`, label: `${l.ok ? '✓' : '✗'} ${l.text}`, subLabel: new Date(l.at).toLocaleTimeString() }))),
			h(Design.TableRowGroup, { key: 'good', title: 'Good to know' },
				h(Design.TableRow, { key: 'g1', label: 'Looking only', subLabel: 'You still cannot read, write in or join these channels. Discord’s servers decide that.' }),
				h(Design.TableRow, { key: 'g2', label: 'Changes show at once', subLabel: 'If a channel list does not update, switch server or tap "Refresh the list".' }),
			),
		]

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(Design.Stack, { style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 }, body),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 6. Report and self-check
	// ---------------------------------------------------------------------------------------------------
	function runSelfCheck() {
		const out = []
		const add = (ok, label, detail) => out.push({ ok, label, detail })
		add(hooks.gated === 'found', 'Found Discord’s "gated channel" question', hooks.gated === 'found' ? 'GatedChannelStore.isChannelGatedAndVisible is wrapped' : 'Without it no channel can be shown')
		add(hooks.transition === 'found', 'Found the channel opener', hooks.transition === 'found' ? 'Taps on text channels are caught' : 'A tap would try to open the channel')
		add(hooks.preload === 'found', 'Found the message preloader', hooks.preload === 'found' ? 'Revealed channels are not preloaded' : 'Optional: some failed requests may happen')
		add(!!listStates(), 'Can rebuild the channel list', listStates() ? 'Rule changes show at once' : 'Switch server after changing a rule')
		let canWorks = false
		try { canWorks = typeof store('PermissionStore').can(BigInt(VIEW_CHANNEL), getChannel(store('SelectedChannelStore').getChannelId())) === 'boolean' } catch (e) {}
		add(canWorks, 'Can read your permissions', canWorks ? 'PermissionStore.can works' : 'Open a server channel first, then run this again')
		const here = currentGuildId()
		if (here) {
			const counts = hiddenIn(here)
			add(counts.hidden > 0, `${guildName(here)} has hidden channels`, `${counts.hidden} hidden, ${counts.shown} shown by your rules${counts.hidden === 0 ? ' (maybe you can see everything here)' : ''}`)
		} else add(false, 'A server is open', 'Open a server’s channel list, then run this again')
		add(stats.asked > 0, 'Discord asked about hidden channels', stats.asked > 0 ? `${stats.asked} time(s), ${stats.shown.size} shown` : 'Open a server’s channel list or tap "Refresh the list"')
		add(stats.decorated > 0, 'Marked rows were drawn', stats.decorated > 0 ? `${stats.decorated} row(s)` : 'Scroll the channel list of a server with hidden channels')
		return out
	}
	function buildReport() {
		const r = rules()
		const here = currentGuildId()
		return [
			'Show Hidden Channels report',
			`version: ${VERSION}`,
			`enabled: ${r.enabled}; scope: ${r.scopeMode} (allowed servers ${r.guildAllow.size}, blocked ${r.guildBlock.size})`,
			`channels always ${r.channelAllow.size}, never ${r.channelBlock.size}; categories never ${r.categoryBlock.size}`,
			`kinds: ${TYPES.filter((t) => r.types[t.key]).map((t) => t.key).join(', ') || 'none'}`,
			`words: block [${r.blockWords.join(', ')}] only [${r.onlyWords.join(', ')}]; skip NSFW ${r.skipNsfw}`,
			`tap: ${setting('tap')}; marker: ${setting('marker')} ${setting('markerPosition')}; dim ${setting('dim')}`,
			`hooks: gated ${hooks.gated}; transition ${hooks.transition}; preload ${hooks.preload}; list rebuild ${hooks.list}`,
			`patched: ${hooks.patched.join(', ') || '-'}`,
			`asked ${stats.asked}, shown ${stats.shown.size}, rows drawn ${stats.decorated}, taps caught ${stats.taps}, refreshes ${stats.refreshes}`,
			here ? `this server: ${guildName(here)} ${JSON.stringify(hiddenIn(here))}` : 'this server: none open',
			hooks.problems.length ? `problems: ${hooks.problems.join(' | ')}` : '',
		].filter(Boolean).join('\n')
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			storage = api.jsonStorage
			globalThis.__showHiddenChannelsInstance = INSTANCE
			cache.rules = null
			const attempt = (what, step) => { try { step() } catch (e) { problem(what, e) } }
			attempt('gated question', () => hookGatedQuestion(api.cleanup))
			attempt('channel opener', () => hookTransition(api.cleanup))
			attempt('preloader', () => hookPreload(api.cleanup))
			attempt('rows', () => hookRows(api.cleanup))
			attempt('list rebuild', () => { if (listStates()) hooks.list = 'found' })
			setTimeout(refreshList, 800) // so channel lists that were already built are drawn again with the hook in place
			api.cleanup(() => {
				clearTimeout(refreshTimer)
				screenListeners = []
				if (globalThis.__showHiddenChannelsInstance === INSTANCE) globalThis.__showHiddenChannelsInstance = undefined
				setTimeout(refreshList, 100)
			})
		},
	})
	return exports
})({})
