'use strict'

/**
 * Tests for Server Info. Run with: node tests/server-info.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Server Info')

const GUILD = '81384788765712384' // A real-looking snowflake: created 2015-05-06
const OWNER = '80351110224678912'
const SHEET_KEY = 'marklong-server-info'
const FRIENDS_KEY = 'marklong-server-info-friends'

/**
 * Builds a fake Discord with one server and the stores the sheet reads. Every part can be changed per scenario.
 * Returns the running plugin and helpers to open the menu item and the sheets it leads to.
 */
async function setup({ guild, counts = { members: 1234567, online: 4321 }, roles = 7, channels = 12, users = {}, friends = [], members = {}, rest = null, profileModule = null, extraStores = {}, gorhom = true } = {}) {
	const g = guild === undefined ? { id: GUILD, name: 'Test Server', description: 'About us', icon: 'icon1', banner: 'a_banner1', ownerId: OWNER, vanityURLCode: 'test', premiumTier: 2, premiumSubscriberCount: 15 } : guild
	const copied = []
	const requested = []
	const listeners = []
	const runtime = createRuntime({
		stores: {
			GuildStore: { getGuild: id => (id === GUILD ? g : undefined), addChangeListener: l => listeners.push(l), removeChangeListener: l => listeners.splice(listeners.indexOf(l), 1) },
			UserStore: { getUser: id => users[id], addChangeListener() {}, removeChangeListener() {} },
			GuildRoleStore: { getSortedRoles: () => new Array(roles).fill({}), addChangeListener() {}, removeChangeListener() {} },
			GuildChannelStore: { getChannels: () => Object.fromEntries(new Array(channels).fill(0).map((_, i) => [`c${i}`, {}])), addChangeListener() {}, removeChangeListener() {} },
			GuildMemberStore: { getMembers: () => members, getMember: (guildId, id) => members[id], getMemberIds: () => Object.keys(members) },
			GuildMemberCountStore: { getMemberCount: () => counts.members, getOnlineCount: () => counts.online, addChangeListener() {}, removeChangeListener() {} },
			RelationshipStore: { getFriendIDs: () => friends },
			...extraStores,
		},
		overrides: { externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } }, Gorhom: gorhom ? { BottomSheet: { BottomSheetScrollView: 'Gorhom.ScrollView' } } : undefined } },
	}).install()
	runtime.valenced.react.ReactNative.useWindowDimensions = () => ({ height: 800 })
	if (friends.length) runtime.finders.loadModule({ requestMembersById: (guildId, ids) => requested.push({ guildId, ids }) })
	if (rest) runtime.finders.loadModule(rest)
	if (profileModule) runtime.finders.loadModule(profileModule)

	const { definition } = loadPlugin('server-info')
	const running = await startPlugin(definition, runtime)
	const items = [{ label: 'Mark as Read', id: 'a', key: 'a', onPress() {}, action() {}, iconSource: 'x', IconComponent: 'y' }]
	const menu = { default: function getGuildsBarGuildMenuItems() { return items } }
	runtime.finders.loadModule(menu)
	await sleep(10)

	const sheetCalls = () => runtime.log.actions.filter(a => a.label === 'actionSheet')
	const opened = key => sheetCalls().filter(a => a.name === 'openLazy' && a.args[1] === key)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	/** Mounts the sheet that was opened with the given key. */
	const mountSheet = async key => {
		const call = opened(key).at(-1)
		const Component = (await call.args[0]).default
		const view = runtime.mount(runtime.React.createElement(Component, {}))
		await view.settle()
		return view
	}
	return { runtime, running, menu, items, copied, requested, sheetCalls, opened, toasts, mountSheet, guild: g, listeners }
}

const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)

/** The date the plugin shows for a snowflake, worked out here independently. */
const dateOf = id => new Date(Number(BigInt(id) >> 22n) + 1420070400000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })

;(async () => {
	// --- The server menu
	{
		const s = await setup()
		const out = s.menu.default(GUILD)
		check('Server Info is added to the end of the menu', out.length === 2 && out[1].label === 'Server Info', out)
		const item = out[1]
		check('the new item is a copy that looks like the others', item.IconComponent === undefined && item.id === undefined && item.key === undefined && item.onPress === undefined)
		check('the new item has an icon', item.iconSource === 'CircleInformationIcon', item.iconSource)
		check('the other items are left as they were', out[0] === s.items[0])
		item.action()
		check('choosing it opens the sheet for that server', s.opened(SHEET_KEY).length === 1)
	}
	{
		const s = await setup()
		s.items.push({ label: 'Server Info' })
		check('a menu that already has Server Info is unchanged', s.menu.default(GUILD).length === 2)
	}
	{
		const s = await setup()
		check('a menu without a server is unchanged', s.menu.default(undefined).length === 1)
		const m = { default: function getGuildsBarGuildMenuItems() { return 'not a list' } }
		s.runtime.finders.loadModule(m)
		await sleep(10)
		check('something that is not a list is unchanged', m.default(GUILD) === 'not a list')
		const m2 = { default: function getGuildsBarGuildMenuItems() { return [] } }
		s.runtime.finders.loadModule(m2)
		await sleep(10)
		check('an empty menu still gets the item', m2.default(GUILD).length === 1)
	}

	// --- The sheet
	{
		const s = await setup({ guild: undefined })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		const scroller = findNode(view.tree, n => n.type === 'Gorhom.ScrollView')
		check('the sheet scrolls with the own scroll view of the sheet, so it can be scrolled and pulled open', !!scroller && scroller.props.nestedScrollEnabled === true && scroller.props.maxHeight === undefined && scroller.props.style.maxHeight === 600, scroller && scroller.props)
		check('the sheet has the server name', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'Test Server'))
		check('the sheet has the description', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'About us'))
		check('the banner is shown, animated hashes as gifs', !!findNode(view.tree, n => n.type === 'Image' && n.props.source?.uri === `https://cdn.discordapp.com/banners/${GUILD}/a_banner1.gif?size=512`))
		check('the icon is shown', !!findNode(view.tree, n => n.type === 'Image' && n.props.source?.uri === `https://cdn.discordapp.com/icons/${GUILD}/icon1.png?size=256`))
		check('members are counted and formatted', rowOf(view, 'Members')?.props.subLabel === (1234567).toLocaleString(), rowOf(view, 'Members')?.props)
		check('online members are counted', rowOf(view, 'Online')?.props.subLabel === (4321).toLocaleString())
		check('roles are counted', rowOf(view, 'Roles')?.props.subLabel === '7')
		check('channels are counted', rowOf(view, 'Channels')?.props.subLabel === '12')
		check('boosts are shown', rowOf(view, 'Boost status')?.props.subLabel === 'Level 2 (15 boosts)')
		check('the vanity link is shown', rowOf(view, 'Vanity URL')?.props.subLabel === 'discord.gg/test')
		check('the creation date is worked out from the id', rowOf(view, 'Created on')?.props.subLabel === dateOf(GUILD), rowOf(view, 'Created on')?.props)
		check('the id is shown', rowOf(view, 'Server ID')?.props.subLabel === GUILD)
		check('with no friends the row says so', rowOf(view, 'Friends in this server')?.props.subLabel === '0 friends', rowOf(view, 'Friends in this server')?.props)

		rowOf(view, 'Server ID').props.onPress()
		check('tapping the id copies it', s.copied.includes(GUILD), s.copied)
		check('a toast says it was copied', s.toasts().includes('Server ID copied'), s.toasts())

		const close = findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Close')
		close.props.onPress()
		check('Close hides the sheet', s.sheetCalls().some(a => a.name === 'hideActionSheet' && a.args[0] === SHEET_KEY))
	}
	{
		const s = await setup({ guild: undefined })
		s.menu.default(GUILD)[1].action()
		await s.mountSheet(SHEET_KEY)
		check('the sheet draws again when a store changes', s.listeners.length > 0, s.listeners.length)
	}
	{
		const s = await setup({ guild: { id: GUILD, name: 'Plain', ownerId: OWNER, premiumTier: 0 }, counts: { members: undefined, online: undefined } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('without counts the member count is the number of known members', rowOf(view, 'Members')?.props.subLabel === '0', rowOf(view, 'Members')?.props)
		check('without an online count the Online row says it is looking, then why there is none', /^(Loading...|Not available)/.test(rowOf(view, 'Online')?.props.subLabel), rowOf(view, 'Online')?.props)
		check('without a vanity link no row is shown', !rowOf(view, 'Vanity URL'))
		check('a server without an icon shows its first letters', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'Pl'))
		check('boosts default to level 0', rowOf(view, 'Boost status')?.props.subLabel === 'Level 0 (0 boosts)')
	}
	{
		const s = await setup({ guild: null })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('a server Discord does not know draws nothing', !findNode(view.tree, n => n.type === 'Design.ActionSheet'))
	}

	{
		// The stores do not know how many are online: Discord's web API is asked.
		const asked = []
		const rest = { get: async ({ url, query }) => (asked.push(url + (query ? JSON.stringify(query) : '')), query?.with_counts ? { body: { approximate_presence_count: 321 } } : undefined), post() {}, patch() {} }
		const s = await setup({ counts: { members: 1000, online: undefined }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('the online count is asked from Discord when the stores lack it', rowOf(view, 'Online')?.props.subLabel === '321' && asked.includes('/guilds/' + GUILD + '{"with_counts":true}'), asked)
	}
	{
		// Discord refuses both questions: the row says so, with the reasons.
		const rest = { get: async () => { throw Object.assign(new Error('x'), { status: 403, body: { message: 'Missing Access' } }) }, post() {}, patch() {} }
		const s = await setup({ counts: { members: 1000, online: undefined }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('when Discord refuses, the Online row says why', /Not available.*server: 403 Missing Access.*preview: 403/.test(rowOf(view, 'Online')?.props.subLabel), rowOf(view, 'Online')?.props)
	}
	{
		// The preview answers when the server question does not.
		const rest = { get: async ({ url }) => (url.endsWith('/preview') ? { body: { approximate_presence_count: 77 } } : { body: {} }), post() {}, patch() {} }
		const s = await setup({ counts: { members: 1000, online: undefined }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('the preview is the second try', rowOf(view, 'Online')?.props.subLabel === '77', rowOf(view, 'Online')?.props)
	}
	{
		// Without the sheet library, the design components' own scroll view is used, then the plain one.
		const s = await setup({ gorhom: false })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('without the sheet library the sheet still scrolls', !!findNode(view.tree, n => n.type === 'Design.BottomSheetScrollView' || n.type === 'ScrollView'))
	}
	// --- The owner
	{
		const users = { [OWNER]: { id: OWNER, username: 'ownerguy', globalName: 'The Owner', avatar: 'av1' } }
		const s = await setup({ users })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		await view.settle()
		const owner = rowOf(view, 'Owner')
		check('the owner is named from the user store', owner?.props.subLabel === 'The Owner', owner?.props)
		check('the owner\'s avatar is shown', owner.props.icon.props.source.uri === `https://cdn.discordapp.com/avatars/${OWNER}/av1.png?size=64`, owner.props.icon.props)
		owner.props.onPress()
		check('tapping the owner closes the sheets first', s.sheetCalls().some(a => a.name === 'hideAllActionSheets'))
		check('with no profile code found a toast says so', s.toasts().includes("Couldn't open this profile."), s.toasts())
	}
	{
		const opens = []
		const s = await setup({
			users: { [OWNER]: { id: OWNER, username: 'o', globalName: null } },
			profileModule: { openUserProfileModal: args => opens.push(args) },
		})
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		await view.settle()
		const owner = rowOf(view, 'Owner')
		check('without a global name the username is used', owner.props.subLabel === 'o')
		check('the owner has the default avatar when they have none', owner.props.icon.props.source.uri.startsWith('https://cdn.discordapp.com/embed/avatars/'), owner.props.icon.props)
		owner.props.onPress()
		check('the profile opens with the user and the server', opens.length === 1 && opens[0].userId === OWNER && opens[0].guildId === GUILD, opens)
	}
	{
		// The server data does not say who owns it, and the user is not known: both are asked from Discord.
		const calls = []
		const rest = {
			get: async ({ url }) => {
				calls.push(url)
				if (url === `/guilds/${GUILD}`) return { body: { owner_id: OWNER } }
				if (url === `/users/${OWNER}`) return { body: { id: OWNER, username: 'fetched', global_name: 'Fetched Owner', avatar: null } }
			},
			post() {},
			patch() {},
		}
		const s = await setup({ guild: { id: GUILD, name: 'No Owner', premiumTier: 1 }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(30)
		await view.settle()
		check('the owner is looked up when the server does not say', calls.includes(`/guilds/${GUILD}`) && calls.includes(`/users/${OWNER}`), calls)
		check('the looked up owner is shown by name', rowOf(view, 'Owner')?.props.subLabel === 'Fetched Owner', rowOf(view, 'Owner')?.props)
		check('the user is given to Discord', s.runtime.log.dispatched.some(a => a.type === 'USER_UPDATE' && a.user.username === 'fetched'), s.runtime.log.dispatched)

		// Opening it again uses the remembered owner without asking again.
		calls.length = 0
		const again = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		check('a second look uses the remembered owner', rowOf(again, 'Owner')?.props.subLabel === 'Fetched Owner' && !calls.includes(`/guilds/${GUILD}`), calls)
	}
	{
		const rest = { get: async () => { throw new Error('offline') }, post() {}, patch() {} }
		const s = await setup({ guild: { id: GUILD, name: 'Offline', premiumTier: 0 }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('when the owner cannot be found there is no owner row', !rowOf(view, 'Owner'))
	}
	{
		const s = await setup({ users: {} })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		await view.settle()
		check('an owner who cannot be looked up is shown by a short id', rowOf(view, 'Owner')?.props.subLabel === `User (${OWNER.slice(0, 6)})`, rowOf(view, 'Owner')?.props)
	}

	// --- Friends
	{
		const friendIds = ['f1', 'f2', 'f3']
		const members = { f1: { nick: 'Nick One' }, f2: { nick: null } }
		const users = {
			f1: { id: 'f1', username: 'one', globalName: 'First', avatar: null },
			f2: { id: 'f2', username: 'two', globalName: null, avatar: 'a_av' },
			f3: { id: 'f3', username: 'three' },
		}
		const opens = []
		const s = await setup({ friends: friendIds, members, users: { ...users, [OWNER]: { id: OWNER, username: 'o' } }, profileModule: { openUserProfile: args => opens.push(args) } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('the row says friends are loading', rowOf(view, 'Friends in this server')?.props.subLabel === 'Loading...')
		check('Discord is asked for the friends\' membership', s.requested.length === 1 && s.requested[0].guildId === GUILD && s.requested[0].ids.length === 3, s.requested)
		check('a row that is loading cannot be tapped', rowOf(view, 'Friends in this server').props.onPress === undefined)

		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: GUILD })
		await sleep(20)
		await view.settle()
		const row = rowOf(view, 'Friends in this server')
		check('friends who are members are counted', row.props.subLabel === '2 friends', row.props)
		row.props.onPress()
		check('tapping it opens the friends sheet', s.opened(FRIENDS_KEY).length === 1)

		const list = await s.mountSheet(FRIENDS_KEY)
		check('the friends sheet has a heading', !!findNode(list.tree, n => n.type === 'Design.Text' && n.props.children === 'Friends in this server (2)'))
		const rows = findNodes(list.tree, n => n.type === 'Design.TableRow')
		check('each friend is a row', rows.length === 2, rows.map(r => r.props.label))
		check('the server name is preferred', rows[0].props.label === 'Nick One' && rows[0].props.subLabel === '@one', rows[0].props)
		check('without a server name the username is used', rows[1].props.label === 'two', rows[1].props)
		check('animated avatars are gifs', rows[1].props.icon.props.source.uri === 'https://cdn.discordapp.com/avatars/f2/a_av.gif?size=64', rows[1].props.icon.props)
		rows[0].props.onPress()
		check('tapping a friend opens their profile', opens.length === 1 && opens[0].userId === 'f1' && opens[0].guildId === GUILD, opens)
		findNode(list.tree, n => n.type === 'Design.Button' && n.props.text === 'Close').props.onPress()
		check('Close hides the friends sheet', s.sheetCalls().some(a => a.name === 'hideActionSheet' && a.args[0] === FRIENDS_KEY))
	}
	{
		const s = await setup({ friends: ['f1'], members: { f1: { nick: null } }, users: { f1: { id: 'f1', username: 'one' } } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: 'some other server' })
		await sleep(30)
		await view.settle()
		check('a chunk for another server does not end the wait', rowOf(view, 'Friends in this server')?.props.subLabel === 'Loading...')
		view.unmount()
	}
	{
		const s = await setup({ friends: ['f1'], members: { f1: { nick: null } }, users: { f1: { id: 'f1', username: 'one' } } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guild_id: GUILD })
		await sleep(20)
		await view.settle()
		check('the chunk may name the server either way', rowOf(view, 'Friends in this server')?.props.subLabel === '1 friend', rowOf(view, 'Friends in this server')?.props)
	}
	{
		const s = await setup({ friends: ['f1', 'f2'], members: {}, users: {} })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: GUILD })
		await sleep(20)
		await view.settle()
		const row = rowOf(view, 'Friends in this server')
		check('with no friends in the server the list is empty', row.props.subLabel === '0 friends')
		row.props.onPress()
		const list = await s.mountSheet(FRIENDS_KEY)
		check('an empty list says so', !!findNode(list.tree, n => n.type === 'Design.Text' && n.props.children === 'No friends found in this server.'))
	}

	// --- Stopping
	{
		const s = await setup()
		await s.running.stop()
		const hidden = s.sheetCalls().filter(a => a.name === 'hideActionSheet').map(a => a.args[0])
		check('stopping closes both sheets', hidden.includes(SHEET_KEY) && hidden.includes(FRIENDS_KEY), hidden)
		check('after stopping the menu is no longer changed', s.menu.default(GUILD).length === 1)
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
