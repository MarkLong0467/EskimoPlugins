'use strict'

/**
 * Tests for Server Info. Run with: node tests/server-info.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, textOf, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Server Info')

const GUILD = '81384788765712384' // A real-looking snowflake: created 2015-05-06
const OWNER = '80351110224678912'
const SHEET_KEY = 'marklong-server-info'
const FRIENDS_KEY = 'marklong-server-info-friends'

/**
 * Builds a fake Discord with one server and the stores the sheet reads. Every part can be changed per scenario.
 * Returns the running plugin and helpers to open the menu item and the sheets it leads to.
 */
async function setup({ guild, counts = { members: 1234567, online: 4321 }, roles = 7, channels = { text: 9, voice: 3 }, emojis = 5, stickers = 2, joined = new Date(Date.now() - 200 * 86400000), status = 'online', users = {}, friends = [], members = {}, rest = null, profileModule = null, extraStores = {}, gorhom = true, token = null } = {}) {
	const g = guild === undefined ? { id: GUILD, name: 'Test Server', description: 'About us', icon: 'icon1', banner: 'a_banner1', ownerId: OWNER, vanityURLCode: 'test', premiumTier: 1, premiumSubscriberCount: 5, features: new Set(['COMMUNITY']), verificationLevel: 1, preferredLocale: 'en-US' } : guild
	const copied = []
	const requested = []
	const listeners = []
	const runtime = createRuntime({
		stores: {
			GuildStore: { getGuild: id => (id === GUILD ? g : undefined), addChangeListener: l => listeners.push(l), removeChangeListener: l => listeners.splice(listeners.indexOf(l), 1) },
			UserStore: { getUser: id => users[id], addChangeListener() {}, removeChangeListener() {} },
			GuildRoleStore: { getSortedRoles: () => new Array(roles).fill({}), addChangeListener() {}, removeChangeListener() {} },
			GuildChannelStore: { getChannels: () => ({ id: GUILD, SELECTABLE: new Array(channels.text).fill({ channel: {} }), VOCAL: new Array(channels.voice).fill({ channel: {} }), 4: [{ channel: {} }], count: channels.text + channels.voice }), addChangeListener() {}, removeChangeListener() {} },
			EmojiStore: { getGuildEmoji: () => (emojis === null ? undefined : new Array(emojis).fill({})) },
			StickersStore: { getStickersByGuildId: () => (stickers === null ? undefined : new Array(stickers).fill({})) },
			PresenceStore: { getStatus: () => status, addChangeListener() {}, removeChangeListener() {} },
			GuildMemberStore: { getMembers: () => members, getMember: (guildId, id) => members[id], getMemberIds: () => Object.keys(members), getSelfMemberJoinedAt: () => joined },
			GuildMemberCountStore: { getMemberCount: () => counts.members, getOnlineCount: () => counts.online, addChangeListener() {}, removeChangeListener() {} },
			RelationshipStore: { getFriendIDs: () => friends },
			...extraStores,
		},
		overrides: { externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } }, Gorhom: gorhom ? { BottomSheet: { BottomSheetScrollView: 'Gorhom.ScrollView' } } : undefined } },
	}).install()
	runtime.valenced.react.ReactNative.useWindowDimensions = () => ({ height: 800 })
	if (friends.length) runtime.finders.loadModule({ requestMembersById: (guildId, ids) => requested.push({ guildId, ids }) })
	// Discord's own connection is the module with HTTPResponseError. A look-alike with get and post that rejects calls (a
	// native module) is loaded too, to show it is not used.
	runtime.finders.loadModule({ get() { throw new Error('Exception in HostFunction: Expected argument 1 of method') }, post() {}, patch() {} })
	if (rest) runtime.finders.loadModule({ HTTPResponseError: class {}, ...rest })
	if (token) runtime.finders.loadModule({ getToken: () => token })
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

/** The element with this accessibility label: the sheet puts one on each thing the person sees as a unit. */
const labelled = (view, label) => findNode(view.tree, n => n.props?.accessibilityLabel === label)
/** Presses the X in the top bar. It is given to Discord's title bar as its `trailing` part. */
const pressClose = view => findNode(view.tree, n => n.type === 'Design.BottomSheetTitleHeader').props.trailing.props.onPress()
/** The element a person can tap, by label. */
const tappable = (view, label) => findNode(view.tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === label)
/** All the words inside an element. */
const wordsIn = node => (node ? textOf(node) : '')
/** All the words in a sheet that are drawn with Design.Text. */
const allText = view => findNodes(view.tree, n => n.type === 'Design.Text').map(n => (Array.isArray(n.props.children) ? n.props.children.join('') : String(n.props.children))).join(' | ')

/** The long date the plugin shows for a snowflake, worked out here independently. */
const dateOf = id => new Date(Number(BigInt(id) >> 22n) + 1420070400000).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

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
		check('the sheet scrolls with the own scroll view of the sheet, so it can be scrolled and pulled open', !!scroller && scroller.props.nestedScrollEnabled === true && scroller.props.maxHeight === undefined, scroller && scroller.props)
		const sheet = findNode(view.tree, n => n.type === 'Design.ActionSheet')
		check('the sheet opens expanded and scrollable, so its own scroll view gets the drag', sheet?.props.scrollable === true && sheet?.props.startExpanded === true && sheet?.props.contentStyles?.paddingHorizontal === 0, sheet?.props)
		const header = findNode(view.tree, n => n.type === 'Design.BottomSheetTitleHeader')
		check('the top bar has the title Server info', header?.props.title === 'Server info')
		check('and the title is outside the scrolling part, so it stays', !findNode(scroller, n => n.type === 'Design.BottomSheetTitleHeader'))
		check('the list fills the room under the title instead of being capped', scroller.props.style.flex === 1 && scroller.props.style.maxHeight === undefined, scroller.props.style)
		check('the sheet has the server name', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'Test Server'))
		check('the sheet has the description', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'About us'))
		check('the banner is shown, animated hashes as gifs', !!findNode(view.tree, n => n.type === 'Image' && n.props.source?.uri === `https://cdn.discordapp.com/banners/${GUILD}/a_banner1.gif?size=512`))
		const icon = findNode(view.tree, n => n.type === 'Image' && n.props.source?.uri === `https://cdn.discordapp.com/icons/${GUILD}/icon1.png?size=256`)
		check('the icon is shown as a rounded square', !!icon && icon.props.style.borderRadius < icon.props.style.width / 2)
		check('a Community server has the Community badge', !!labelled(view, 'Community'))
		check('members are counted and formatted', !!labelled(view, `${(1234567).toLocaleString()} members`), allText(view))
		check('online members are counted', !!labelled(view, `${(4321).toLocaleString()} online`))
		check('channels are counted as text and voice together', !!labelled(view, 'Channels: 12') && /9 text, 3 voice/.test(allText(view)), allText(view))
		check('roles are counted', !!labelled(view, 'Roles: 7'))
		check('emojis are counted', !!labelled(view, 'Emojis: 5'))
		check('stickers are counted', !!labelled(view, 'Stickers: 2'))
		check('the tiles sit in a row that wraps, and the last grows to fill the row', findNodes(view.tree, n => n.type === 'View' && n.props.style?.flexGrow === 1 && n.props.style?.flexBasis === '30%').length === 4)
		check('the boost card says the level and the boosts', !!labelled(view, 'Level 1, 5 boosts'))
		check('it says how many more boosts the next level needs', /2 more boosts for Level 2/.test(allText(view)), allText(view))
		const bar = findNode(view.tree, n => n.props?.accessibilityRole === 'progressbar')
		check('the boost bar shows how far it is to the next level', bar?.props.accessibilityValue.now === 71, bar?.props)
		check('the vanity link is shown', /discord\.gg\/test/.test(wordsIn(labelled(view, 'Vanity URL')) + allText(view)))
		check('the creation date is worked out from the id, with how long ago', allText(view).includes(`${dateOf(GUILD)} · `) && /\d+ years? ago/.test(allText(view)), allText(view))
		check('the day you joined is shown with how long ago', /· 6 months ago/.test(allText(view)), allText(view))
		check('the verification level is named', /Verification/.test(allText(view)) && allText(view).includes('Low'))
		check('the language is named', allText(view).includes('English'))
		check('the id is shown', allText(view).includes(GUILD))
		check('with no friends the card says so', allText(view).includes('None of your friends are here') && !!labelled(view, 'Friends: none'))
		check('the sections have their titles', ['Friends', 'Owner', 'Details'].every(t => !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === t)))

		tappable(view, 'Server ID').props.onPress()
		check('tapping the id copies it', s.copied.includes(GUILD), s.copied)
		check('a toast says it was copied', s.toasts().includes('Server ID copied'), s.toasts())
		tappable(view, 'Vanity URL').props.onPress()
		check('tapping the vanity link copies it with https', s.copied.includes('https://discord.gg/test'), s.copied)

		check('there is no Close button at the bottom any more', !findNode(view.tree, n => n.type === 'Design.Button'))
		pressClose(view)
		check('the X in the top bar hides the sheet', s.sheetCalls().some(a => a.name === 'hideActionSheet' && a.args[0] === SHEET_KEY))
	}
	{
		const s = await setup({ guild: undefined })
		s.menu.default(GUILD)[1].action()
		await s.mountSheet(SHEET_KEY)
		check('the sheet draws again when a store changes', s.listeners.length > 0, s.listeners.length)
	}
	{
		const s = await setup({ guild: { id: GUILD, name: 'Plain', ownerId: OWNER, premiumTier: 0 }, counts: { members: undefined, online: undefined }, emojis: null, stickers: null })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('without counts the member count is the number of known members', !!labelled(view, '0 members'), allText(view))
		check('without an online count no online line is shown', !findNode(view.tree, n => /^[\d,]+ online$/.test(n.props?.accessibilityLabel ?? '')))
		check('without a vanity link no row is shown', !labelled(view, 'Vanity URL'))
		check('a server without an icon shows its first letters', !!findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'Pl'))
		check('boosts default to no level', !!labelled(view, 'No boost level yet, 0 boosts') && /2 more boosts for Level 1/.test(allText(view)), allText(view))
		const empty = findNode(view.tree, n => n.props?.accessibilityRole === 'progressbar')
		check('and the boost bar is empty', empty.props.accessibilityValue.now === 0)
		check('without emoji or sticker stores those tiles are left out', !labelled(view, 'Emojis: 5') && !findNode(view.tree, n => /^(Emojis|Stickers): /.test(n.props?.accessibilityLabel ?? '')))
		check('without a Community feature there is no badge', !labelled(view, 'Community'))
		check('a server that does not say its level is None', /None/.test(allText(view)))
		check('a server that does not say its language is English', /English/.test(allText(view)))
	}
	{
		// A server with no text or voice split: counted by what the store has
		const s = await setup({ guild: undefined, channels: { text: 0, voice: 0 } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('a server with no channels has 0', !!labelled(view, 'Channels: 0'))
	}
	{
		const s = await setup({ guild: undefined, joined: null })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('when the join date is not known the row is left out', !/You joined/.test(allText(view)))
	}
	{
		const s = await setup({ guild: { id: GUILD, name: 'Maxed', ownerId: OWNER, premiumTier: 3, premiumSubscriberCount: 20, features: ['COMMUNITY', 'VERIFIED', 'PARTNERED'], verificationLevel: 4, preferredLocale: 'de' } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		check('a top level server says so and its bar is full', /top level/.test(allText(view)) && findNode(view.tree, n => n.props?.accessibilityRole === 'progressbar').props.accessibilityValue.now === 100)
		check('a list of features works too, and shows all three badges', !!labelled(view, 'Community') && !!labelled(view, 'Verified') && !!labelled(view, 'Partnered'))
		check('the highest verification level and the language are named', /Highest/.test(allText(view)) && /German/.test(allText(view)), allText(view))
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
		check('the online count is asked from Discord when the stores lack it', !!labelled(view, '321 online') && asked.includes('/guilds/' + GUILD + '{"with_counts":true}'), asked)
	}
	{
		// Discord refuses both questions: no online line, and the sheet is still fine.
		const rest = { get: async () => { throw Object.assign(new Error('x'), { status: 403, body: { message: 'Missing Access' } }) }, post() {}, patch() {} }
		const s = await setup({ counts: { members: 1000, online: undefined }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('when Discord refuses there is no online line and the members still show', !findNode(view.tree, n => /^[\d,]+ online$/.test(n.props?.accessibilityLabel ?? '')) && !!labelled(view, '1,000 members'), allText(view))
	}
	{
		// The preview answers when the server question does not.
		const rest = { get: async ({ url }) => (url.endsWith('/preview') ? { body: { approximate_presence_count: 77 } } : { body: {} }), post() {}, patch() {} }
		const s = await setup({ counts: { members: 1000, online: undefined }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('the preview is the second try', !!labelled(view, '77 online'))
	}
	{
		// Discord's own connection is not there: a plain request with the account token is sent.
		const urls = []
		const realFetch = globalThis.fetch
		globalThis.fetch = async (url, init) => (urls.push({ url: String(url), auth: init?.headers?.Authorization }), { ok: true, status: 200, json: async () => ({ approximate_presence_count: 55 }) })
		const s = await setup({ counts: { members: 1000, online: undefined }, token: 'TOKEN' })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		globalThis.fetch = realFetch
		check('without the Discord connection the account token is used for a plain request', !!labelled(view, '55 online') && urls.some(u => u.url === 'https://discord.com/api/v9/guilds/' + GUILD + '?with_counts=true' && u.auth === 'TOKEN'), urls)
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
		const owner = tappable(view, 'Owner: The Owner')
		check('the owner is named from the user store', !!owner, allText(view))
		check('the owner’s @name is shown under the name', allText(view).includes('@ownerguy'), allText(view))
		check('the owner’s avatar is shown', !!findNode(owner, n => n.type === 'Image' && n.props.source.uri === `https://cdn.discordapp.com/avatars/${OWNER}/av1.png?size=64`))
		check('the owner has a status dot', !!findNode(owner, n => n.props?.accessibilityLabel === 'Status: online'))
		check('and a crown', !!findNode(owner, n => n.type === 'Design.Text' && n.props.children === '👑'))
		owner.props.onPress()
		check('tapping the owner closes the sheets first', s.sheetCalls().some(a => a.name === 'hideAllActionSheets'))
		check('with no profile code found a toast says so', s.toasts().includes("Couldn't open this profile."), s.toasts())
	}
	{
		const s = await setup({ users: { [OWNER]: { id: OWNER, username: 'o', globalName: null, avatar: null } }, status: null })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		await view.settle()
		check('a status that is not known has no dot', !findNode(view.tree, n => /^Status: /.test(n.props?.accessibilityLabel ?? '')))
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
		const owner = tappable(view, 'Owner: o')
		check('without a global name the username is used', !!owner)
		check('the owner has the default avatar when they have none', !!findNode(owner, n => n.type === 'Image' && n.props.source.uri.startsWith('https://cdn.discordapp.com/embed/avatars/')))
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
		check('the looked up owner is shown by name and @name', !!tappable(view, 'Owner: Fetched Owner') && allText(view).includes('@fetched'), allText(view))
		check('the user is given to Discord', s.runtime.log.dispatched.some(a => a.type === 'USER_UPDATE' && a.user.username === 'fetched'), s.runtime.log.dispatched)

		// Opening it again uses the remembered owner without asking again.
		calls.length = 0
		const again = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		check('a second look uses the remembered owner', !!tappable(again, 'Owner: Fetched Owner') && !calls.includes(`/guilds/${GUILD}`), calls)
	}
	{
		const rest = { get: async () => { throw new Error('offline') }, post() {}, patch() {} }
		const s = await setup({ guild: { id: GUILD, name: 'Offline', premiumTier: 0 }, rest })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(20)
		await view.settle()
		check('when the owner cannot be found there is no owner section', !findNode(view.tree, n => /^Owner: /.test(n.props?.accessibilityLabel ?? '')) && !findNode(view.tree, n => n.type === 'Design.Text' && n.props.children === 'Owner'))
	}
	{
		const s = await setup({ users: {} })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		await sleep(10)
		await view.settle()
		check('an owner who cannot be looked up is shown by a short id', !!tappable(view, `Owner: User (${OWNER.slice(0, 6)})`), allText(view))
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
		check('the card says friends are loading', !!labelled(view, 'Friends: loading') && allText(view).includes('Loading...'))
		check('Discord is asked for the friends’ membership', s.requested.length === 1 && s.requested[0].guildId === GUILD && s.requested[0].ids.length === 3, s.requested)
		check('a card that is loading cannot be tapped', !tappable(view, 'Friends: loading'))

		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: GUILD })
		await sleep(20)
		await view.settle()
		const card = tappable(view, 'Friends: 2')
		check('friends who are members are counted', !!card && allText(view).includes('2 of your friends are here'), allText(view))
		check('their avatars are shown in a row', findNodes(card, n => n.type === 'Image').length === 2)
		card.props.onPress()
		check('tapping it opens the friends sheet', s.opened(FRIENDS_KEY).length === 1)

		const list = await s.mountSheet(FRIENDS_KEY)
		check('the friends sheet has a title', findNode(list.tree, n => n.type === 'Design.BottomSheetTitleHeader')?.props.title === 'Friends')
		check('and says how many friends there are', !!findNode(list.tree, n => n.type === 'Design.Text' && n.props.children === '2 friends in this server'))
		const rows = findNodes(list.tree, n => n.type === 'Pressable' && /^Friend: /.test(n.props.accessibilityLabel ?? ''))
		check('each friend is a row', rows.length === 2, rows.map(r => r.props.accessibilityLabel))
		check('the server name is preferred, with the @name under it', rows[0].props.accessibilityLabel === 'Friend: Nick One' && wordsIn(rows[0]) !== undefined && !!findNode(rows[0], n => n.type === 'Design.Text' && n.props.children === '@one'))
		check('without a server name the username is used', rows[1].props.accessibilityLabel === 'Friend: two')
		check('animated avatars are gifs', !!findNode(rows[1], n => n.type === 'Image' && n.props.source.uri === 'https://cdn.discordapp.com/avatars/f2/a_av.gif?size=64'))
		rows[0].props.onPress()
		check('tapping a friend opens their profile', opens.length === 1 && opens[0].userId === 'f1' && opens[0].guildId === GUILD, opens)
		pressClose(list)
		check('the X hides the friends sheet', s.sheetCalls().some(a => a.name === 'hideActionSheet' && a.args[0] === FRIENDS_KEY))
	}
	{
		const s = await setup({ friends: ['f1'], members: { f1: { nick: null } }, users: { f1: { id: 'f1', username: 'one' } } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: 'some other server' })
		await sleep(30)
		await view.settle()
		check('a chunk for another server does not end the wait', !!labelled(view, 'Friends: loading'))
		view.unmount()
	}
	{
		const s = await setup({ friends: ['f1'], members: { f1: { nick: null } }, users: { f1: { id: 'f1', username: 'one' } } })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guild_id: GUILD })
		await sleep(20)
		await view.settle()
		check('the chunk may name the server either way', !!tappable(view, 'Friends: 1') && allText(view).includes('1 of your friends is here'), allText(view))
	}
	{
		const s = await setup({ friends: ['f1', 'f2'], members: {}, users: {} })
		s.menu.default(GUILD)[1].action()
		const view = await s.mountSheet(SHEET_KEY)
		s.runtime.fire('GUILD_MEMBERS_CHUNK', { guildId: GUILD })
		await sleep(20)
		await view.settle()
		check('with no friends in the server the card says none are here', !!labelled(view, 'Friends: none'))
	}

	// --- Stopping
	{
		const s = await setup()
		await s.running.stop()
		const hidden = s.sheetCalls().filter(a => a.name === 'hideActionSheet').map(a => a.args[0])
		check('stopping closes both sheets', hidden.includes(SHEET_KEY) && hidden.includes(FRIENDS_KEY), hidden)
		check('after stopping the menu is no longer changed', s.menu.default(GUILD).length === 1)
	}

	// --- The owner and their profile
	{
		// The profile route is used first, and an error answer is never taken for a user.
		const calls2 = []
		const rest2 = {
			get: async ({ url }) => {
				calls2.push(url)
				if (url === `/guilds/${GUILD}`) return { body: { owner_id: OWNER } }
				if (url.startsWith(`/users/${OWNER}/profile`)) return { body: { user: { id: OWNER, username: 'viaprofile', global_name: 'Profile Owner', avatar: null } } }
				return { body: { message: '405: Method Not Allowed', code: 0 } }
			},
			post() {},
			patch() {},
		}
		const s2 = await setup({ guild: { id: GUILD, name: 'No Owner', premiumTier: 1 }, rest: rest2 })
		s2.menu.default(GUILD)[1].action()
		const view2 = await s2.mountSheet(SHEET_KEY)
		await sleep(30)
		await view2.settle()
		check('the owner is asked from the profile route first', calls2.some(u => u.startsWith(`/users/${OWNER}/profile`)), calls2)
		check('and shown by name', !!tappable(view2, 'Owner: Profile Owner'))
		const bad = {
			get: async ({ url }) => (url === `/guilds/${GUILD}` ? { body: { owner_id: OWNER } } : { body: { message: '405: Method Not Allowed', code: 0 } }),
			post() {},
			patch() {},
		}
		const s3 = await setup({ guild: { id: GUILD, name: 'No Owner', premiumTier: 1 }, rest: bad })
		s3.menu.default(GUILD)[1].action()
		const view3 = await s3.mountSheet(SHEET_KEY)
		await sleep(30)
		await view3.settle()
		check('an error answer is not shown as the owner', !!findNode(view3.tree, n => /^Owner: User \(/.test(n.props?.accessibilityLabel ?? '')))
		check('and is not given to Discord as a user', !s3.runtime.log.dispatched.some(a => a.type === 'USER_UPDATE'))
	}
	{
		const opens = []
		const mod = { default: args => opens.push(args), USER_PROFILE_ACTION_SHEET_KEY_PREFIX: 'UserProfile', getUserProfileActionSheetKey: id => 'UserProfile' + id }
		const s4 = await setup({ profileModule: mod })
		s4.menu.default(GUILD)[1].action()
		const view4 = await s4.mountSheet(SHEET_KEY)
		findNode(view4.tree, n => n.type === 'Pressable' && /^Owner: /.test(n.props.accessibilityLabel ?? '')).props.onPress()
		check('the profile opens through the profile sheet of Discord', opens.length === 1 && opens[0].userId === OWNER && opens[0].guildId === GUILD, opens)
	}


	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
