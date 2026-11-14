'use strict'

/** Tests for I Remember You. Run with: node tests/i-remember-you.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('I Remember You')

/**
 * React Native's FlatList, which the harness does not have: draws the header, every row and the footer, and keeps its
 * props (the rows' data) for the checks.
 */
function FlatList(props) {
	const { React } = globalThis.valenced.react
	const rows = (props.data ?? []).map(item => React.createElement('Row', { key: props.keyExtractor(item), rowKey: props.keyExtractor(item) }, props.renderItem({ item })))
	return React.createElement('FlatList', props, props.ListHeaderComponent, ...rows, props.ListFooterComponent)
}
const overrides = { react: { ReactNative: { FlatList } } }

const ME = '100000000000000001'
const user = (id, username, more = {}) => ({ id, username, discriminator: '0', tag: `${username}#0`, getAvatarURL: () => `https://cdn.discordapp.com/avatars/${id}/a.png`, ...more })
const USERS = {
	[ME]: user(ME, 'me'),
	'200000000000000002': user('200000000000000002', 'owner2'),
	'300000000000000003': user('300000000000000003', 'member3'),
	'400000000000000004': user('400000000000000004', 'robot', { bot: true }),
	'500000000000000005': user('500000000000000005', 'replied5'),
	'600000000000000006': user('600000000000000006', 'mentioned6', { discriminator: '1234', tag: 'mentioned6#1234' }),
}
const GUILDS = {
	g1: { id: 'g1', name: 'My Server', ownerId: ME },
	g2: { id: 'g2', name: 'Their Server', ownerId: '200000000000000002' },
}

;(async () => {
	const sent = []
	const messages = { sendMessage: (...args) => { sent.push(args); return 'sent' }, receiveMessage() {} }
	const stores = {
		ChannelStore: { getChannel: id => ({ c1: { guild_id: 'g1' }, dm1: { guild_id: null } })[id] },
		GuildStore: { getGuild: id => GUILDS[id], getGuilds: () => GUILDS },
		GuildMemberStore: { getMembers: id => (id === 'g1' ? [{ userId: ME }, { userId: '300000000000000003' }, { userId: '400000000000000004' }, { userId: 'gone' }] : [{ userId: '200000000000000002' }]) },
		MessageStore: { getMessage: (channelId, messageId) => (messageId === 'm1' ? { author: USERS['500000000000000005'] } : undefined) },
		UserStore: { getUser: id => USERS[id], getCurrentUser: () => USERS[ME] },
	}
	const start = (more = {}) => startPort('i-remember-you', { stores, overrides, before: runtime => runtime.finders.loadModule(messages), ...more })
	const s = await start()
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)

	// What the running plugin holds is read through the settings screen: nothing is saved before three minutes.
	const view = await s.mountSettings()
	const rowsOf = v => findNode(v.tree, n => n.type === 'FlatList').props.data
	const people = v => rowsOf(v).filter(r => r.kind === 'user')
	const owner2 = people(view).find(r => r.user.id === '200000000000000002')
	check('the owner of every server you are in is remembered as its owner', owner2 && owner2.user.extra.isOwner === true && typeof owner2.user.extra.updatedAt === 'number', owner2)
	const inMine = rowsOf(view).filter(r => r.key.startsWith('g1:')).map(r => r.user.username)
	check('the members of a server you own are remembered (bots and unknown users left out)', inMine.includes('member3') && inMine.includes('me') && !inMine.includes('robot'), inMine)
	check('of a server you do not own, only the owner is taken', rowsOf(view).filter(r => r.key.startsWith('g2:')).length === 1)
	check('servers are sorted by how many people they have', rowsOf(view)[0].kind === 'header' && rowsOf(view)[0].name === 'My Server' && rowsOf(view)[0].isGuild === true, rowsOf(view)[0])

	// Sending a message.
	const result = messages.sendMessage('c1', { content: 'hi <@600000000000000006> and <@!300000000000000003>' }, true, { messageReference: { channel_id: 'c1', message_id: 'm1' } })
	check('the message is still sent, with the same arguments', result === 'sent' && sent.length === 1 && sent[0][0] === 'c1' && sent[0][3].messageReference.message_id === 'm1', sent)
	check('nothing is saved before three minutes (as in Equicord)', s.storage.cache?.data?.g1 === undefined)
	s.stop()
	const saved = s.storage.cache.data
	check('stopping saves everything', saved?.g1?.users?.['500000000000000005']?.username === 'replied5', saved && Object.keys(saved))
	check('mentioned people are remembered, with their tag (or the username when the discriminator is 0)', saved.g1.users['600000000000000006'].tag === 'mentioned6#1234' && saved.g1.users['500000000000000005'].tag === 'replied5', saved.g1.users)
	check('their picture is kept', saved.g1.users['600000000000000006'].iconURL === 'https://cdn.discordapp.com/avatars/600000000000000006/a.png')
	check('a server group keeps its name and id', saved.g1.name === 'My Server' && saved.g1.id === 'g1')
	check('an owner who is met again keeps "owner"', saved.g2.users['200000000000000002'].extra.isOwner === true)

	// A second start reads what was saved.
	const s2 = await start({ saved: { data: saved } })
	messages.sendMessage('dm1', { content: '<@600000000000000006>' }, true, {})
	messages.sendMessage('c1', { content: '<@300000000000000003>' }, true, { messageReference: { channel_id: 'c1', message_id: 'unknown' } })
	const v2 = await s2.mountSettings()
	const dm = rowsOf(v2).find(r => r.kind === 'header' && r.name === 'dm')
	check('outside a server, people go under "dm", which has no id to copy', dm && dm.isGuild === false, dm)
	check('what was saved before is there after a restart', people(v2).some(r => r.user.id === '500000000000000005'))

	// The screen.
	check("the intro is Equicord's text", textOf(v2.tree).includes('Provides a list of users you have mentioned or replied to'), textOf(v2.tree).slice(0, 200))
	const input = () => findNode(v2.tree, n => n.type === 'Design.TextInput')
	check('there is a filter box', input()?.props.placeholder === 'Filter by tag, username')
	input().props.onChange('ention')
	await v2.settle()
	const found = rowsOf(v2).filter(r => r.key.startsWith('s:'))
	check('the filter finds people by part of their tag or username, without "(owner)"', found.length >= 1 && found.every(r => /ention/.test(r.user.username) && r.allowOwner === false), found)
	check('and the list stays under it, as in Equicord', rowsOf(v2).some(r => r.kind === 'header'))
	input().props.onChange('')
	await v2.settle()

	// A person's row and a server's heading.
	const row = key => findNode(v2.tree, n => n.type === 'Row' && n.props.rowKey === key)
	const ownerRow = row('g2:200000000000000002')
	check('a row shows the tag with "(owner)" and the id', textOf(ownerRow).includes('owner2 (owner)') && textOf(ownerRow).includes('200000000000000002'), textOf(ownerRow))
	findNodes(ownerRow, n => typeof n.props?.onPress === 'function').find(n => textOf(n) === '200000000000000002').props.onPress()
	check('tapping the id copies it with a toast', s2.copied.includes('200000000000000002') && s2.toasts().includes('User ID copied to clipboard'), [s2.copied, s2.toasts()])
	findNodes(ownerRow, n => typeof n.props?.onLongPress === 'function').find(n => textOf(n).includes('owner2 (owner)')).props.onLongPress()
	check("a long press on the name shows when they were last seen (Equicord's tooltip)", s2.toasts().some(t => /^owner2, updated at /.test(t ?? '')), s2.toasts())
	const heading = row('g:g2')
	check('a server heading shows its name and id', textOf(heading).includes('Their Server') && textOf(heading).includes('(g2)'), textOf(heading))
	findNodes(heading, n => typeof n.props?.onPress === 'function')[0].props.onPress()
	check('tapping the server id copies it', s2.copied.includes('g2') && s2.toasts().includes('Server ID copied to clipboard'))
	check('the dm group has no id to tap', findNodes(row('g:dm'), n => typeof n.props?.onPress === 'function').length === 0)

	// A store that throws never stops a message.
	const before = sent.length
	stores.ChannelStore.getChannel = () => { throw new Error('boom') }
	check('a message is sent even when remembering fails', messages.sendMessage('c1', { content: 'x' }, true, {}) === 'sent' && sent.length === before + 1)
	s2.stop()
	await sleep(5)
	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
