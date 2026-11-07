'use strict'

/** Tests for Silence Users. Run with: node tests/silence-users.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Silence Users')

const ME = '500000000000000001'
const ANNOY = '100000000000000001'
const FRIEND = '200000000000000002'
const OTHER = '300000000000000003'
const COMMAND_ID = '-731003'

const USERS = {
	[ME]: { id: ME, username: 'me', globalName: 'Me' },
	[ANNOY]: { id: ANNOY, username: 'annoying', globalName: 'Annoying One', avatar: 'av1' },
	[FRIEND]: { id: FRIEND, username: 'friendly', globalName: null, avatar: 'a_av2' },
}

/** Discord's built-in commands. */
function fakeBuiltIns() {
	const dice = { id: '-18', untranslatedName: 'roll-dice', displayName: 'roll-dice', type: 1, inputType: 0, applicationId: '-1' }
	const items = [dice]
	return { items, getBuiltInCommands: (types, all) => (all || types.includes(1) ? items : []) }
}

const start = async (saved = {}, extra = {}) => {
	const builtIns = extra.builtIns ?? fakeBuiltIns()
	const s = await startPort('silence-users', {
		saved,
		reactExtras: true,
		stores: { UserStore: { getUser: id => USERS[id], getCurrentUser: () => (extra.noMe ? undefined : USERS[ME]) } },
		before: runtime => {
			runtime.valenced.modules.finders.loadModule(builtIns)
			if (extra.rest) runtime.valenced.modules.finders.loadModule({ HTTPResponseError: class {}, ...extra.rest })
		},
	})
	let last
	const mountSettings = s.mountSettings
	return Object.assign(s, {
		builtIns,
		mountSettings: async (...args) => {
			last?.unmount()
			last = await mountSettings(...args)
			return last
		},
	})
}

/** A message the way Discord's gateway sends it. */
const msg = (author, extra = {}) => ({ id: '9', channel_id: 'c', content: 'hello', author: { id: author, username: 'u' }, mentions: [{ id: ME }], mention_roles: ['r1'], mention_everyone: true, ...extra })
/** Sends a message through the plugin's hook and gives back what Discord would see. */
const create = (s, message, type = 'MESSAGE_CREATE') => s.runtime.through(type, { type, channelId: 'c', message })
const flameOf = list => list.find(item => item.id === COMMAND_ID)
const switchRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)
const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
/** A row of the "Pinged you recently" group: the one whose second line counts pings. */
const pingRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label && /pings?/.test(n.props.subLabel ?? ''))
const inputOf = view => findNode(view.tree, n => n.type === 'Design.TextInput')

;(async () => {
	// --- Nobody silenced: nothing changes
	{
		const s = await start()
		const out = create(s, msg(ANNOY))
		check('with nobody silenced a message keeps its pings', out.payload.message.mentions.length === 1 && out.payload.message.mention_everyone === true && out.payload.message.mention_roles.length === 1)
		check('every wrapper returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}

	// --- The same as Equicord: a silenced person's pings are taken out
	{
		const s = await start({ users: [ANNOY] })
		const out = create(s, msg(ANNOY))
		const m = out.payload.message
		check('the message is not blocked, it still arrives', !out.blocked && out.payload.message.content === 'hello')
		check('mention_everyone is made false', m.mention_everyone === false)
		check('mention_roles is emptied', Array.isArray(m.mention_roles) && m.mention_roles.length === 0)
		check('mentions is emptied', Array.isArray(m.mentions) && m.mentions.length === 0)
		check('the rest of the message is untouched', m.id === '9' && m.channel_id === 'c' && m.author.id === ANNOY)
		const other = create(s, msg(FRIEND)).payload.message
		check('a message from someone else keeps its pings', other.mentions.length === 1 && other.mention_everyone === true && other.mention_roles.length === 1)
		const edit = create(s, msg(ANNOY), 'MESSAGE_UPDATE').payload.message
		check('an edited message from the silenced person is cleaned too', edit.mentions.length === 0 && edit.mention_everyone === false && edit.mention_roles.length === 0)
		const partial = create(s, { id: '9', content: 'edited', mentions: [{ id: ME }] }, 'MESSAGE_UPDATE').payload.message
		check('an update with no author is left alone', partial.mentions.length === 1)
		const noMessage = s.runtime.through('MESSAGE_CREATE', { type: 'MESSAGE_CREATE' })
		check('an event with no message passes through', !noMessage.blocked)
		const camel = create(s, { ...msg(ANNOY), mentionEveryone: true, mentionRoles: ['r'] }).payload.message
		check('the camelCase fields are cleared too when a message has them', camel.mentionEveryone === false && camel.mentionRoles.length === 0)
		const numeric = create(s, { author: { id: Number(1) }, mentions: [{ id: ME }] })
		check('an author id that is a number does not break it', !numeric.blocked)
		const noMentions = create(s, { author: { id: ANNOY }, content: 'x' }).payload.message
		check('a message with no mention fields gets them empty, like Equicord', noMentions.mentions.length === 0 && noMentions.mention_roles.length === 0 && noMentions.mention_everyone === false)
		check('every wrapper returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		const after = create(s, msg(ANNOY)).payload.message
		check('turning the plugin off puts everything back', after.mentions.length === 1 && after.mention_everyone === true)
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- NOTIFICATION_CREATE, like Equicord
	{
		const s = await start({ users: [ANNOY] })
		check('a notification for a silenced person is stopped', s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE', message: msg(ANNOY) }).blocked)
		check('the message may be inside notification', s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE', notification: { message: msg(ANNOY) } }).blocked)
		check('a notification for someone else goes through', !s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE', message: msg(FRIEND) }).blocked)
		check('a notification with no message goes through', !s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE' }).blocked)
		s.storage.set({ silenceAll: true })
		check('silencing everyone’s pings does not stop every notification', !s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE', message: msg(FRIEND) }).blocked)
		s.stop()
	}

	// --- The extras: everyone, @everyone, roles
	{
		const s = await start({ silenceAll: true })
		const m = create(s, msg(FRIEND)).payload.message
		check('silencing everyone’s pings takes the pings out of anyone’s message', m.mentions.length === 0 && m.mention_everyone === false && m.mention_roles.length === 0)
		s.stop()
	}
	{
		const s = await start({ silenceEveryone: true })
		const m = create(s, msg(FRIEND)).payload.message
		check('@everyone can be silenced alone', m.mention_everyone === false && m.mentions.length === 1 && m.mention_roles.length === 1)
		s.stop()
	}
	{
		const s = await start({ silenceRoles: true })
		const m = create(s, msg(FRIEND)).payload.message
		check('role pings can be silenced alone', m.mention_roles.length === 0 && m.mentions.length === 1 && m.mention_everyone === true)
		s.stop()
	}

	// --- Who pinged you
	{
		const s = await start({ users: [ANNOY] })
		create(s, msg(ANNOY))
		create(s, msg(ANNOY))
		create(s, msg(FRIEND, { mentions: [{ id: ME }], mention_everyone: false }))
		create(s, msg(OTHER, { mentions: [{ id: '777' }], mention_everyone: false, mention_roles: [] }))
		create(s, { ...msg(ME), mentions: [{ id: ME }] })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('people who pinged you are listed, newest first', text.includes('Annoying One') === true && /Annoying One[\s\S]*friendly|friendly[\s\S]*Annoying One/.test(text), text)
		check('they are counted and the silenced ones too', /2 pings, 2 silenced/.test(text) && /1 ping\b/.test(text), text)
		check('someone who pinged someone else is not listed', !/Unknown|u\b.*0 ping/.test(text) && !text.includes('300000000000000003'))
		check('your own messages are not listed', findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Me').length === 0)
		check('a person who is already silenced shows as silenced', pingRow(view, 'Annoying One')?.props.trailing.props.disabled === true && pingRow(view, 'Annoying One').props.trailing.props.text === 'Silenced')
		pingRow(view, 'friendly').props.trailing.props.onPress()
		await sleep(5)
		check('the Silence button silences them', s.storage.cache.users.includes(FRIEND) && s.toasts().some(t => /is silenced/.test(t ?? '')), s.storage.cache)
		const after = create(s, msg(FRIEND)).payload.message
		check('and their pings are taken out from then on', after.mentions.length === 0)
		s.stop()
	}
	{
		const s = await start({ users: [] })
		for (let i = 0; i < 20; i++) create(s, msg(`4000000000000${String(10000 + i)}`))
		const view = await s.mountSettings()
		const rows = findNodes(view.tree, n => n.type === 'Design.TableRow' && /pings?$/.test(n.props.subLabel ?? ''))
		check('only the last twelve are kept', rows.length === 12, rows.length)
		s.stop()
	}

	// --- /silence
	{
		const s = await start()
		const all = s.builtIns.getBuiltInCommands([1], true, false)
		const cmd = flameOf(all)
		check('/silence is added to the built-in commands', !!cmd && all.length === 2)
		check('it is a built-in command like Discord’s', cmd.applicationId === '-1' && cmd.untranslatedName === 'silence' && cmd.type === 1 && cmd.inputType === 0, cmd)
		check('it has one required user option', cmd.options.length === 1 && cmd.options[0].name === 'user' && cmd.options[0].type === 6 && cmd.options[0].required === true)
		check('asking again gives the same list', s.builtIns.getBuiltInCommands([1], true, false) === all)
		check('Discord’s own list is not changed', s.builtIns.items.length === 1)
		const result = cmd.execute([{ name: 'user', value: FRIEND, type: 6 }], {})
		check('running it silences that person and sends nothing', result === undefined && s.storage.cache.users.includes(FRIEND))
		check('with a toast', s.toasts().some(t => t === 'friendly is silenced'), s.toasts())
		cmd.execute([{ name: 'user', value: FRIEND, type: 6 }], {})
		check('running it again lets them ping you', !s.storage.cache.users.includes(FRIEND) && s.toasts().some(t => t === 'friendly is no longer silenced'), s.toasts())
		cmd.execute([], {})
		check('running it with nobody picked changes nothing', (s.storage.cache.users ?? []).length === 0)
		s.stop()
		check('turning the plugin off takes it out', !flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
	}
	{
		const s = await start({ command: false })
		check('with the command switched off it is not in the list', !flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
		const view = await s.mountSettings()
		switchRow(view, '/silence command').props.onValueChange(true)
		await sleep(5)
		check('switching it on adds it', !!flameOf(s.builtIns.getBuiltInCommands([1], true, false)))
		s.stop()
	}

	// --- The settings screen
	{
		const s = await start({ users: [ANNOY, FRIEND] })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('it opens with a short intro', /Silences the pings/.test(text))
		check('it says what is going on', /Working/.test(text) && /0 pings silenced/.test(text), text)
		check('the silenced people are listed with their names', !!rowOf(view, 'Annoying One') && !!rowOf(view, 'friendly'), text)
		check('with the @name under it', /@annoying/.test(text) && /@friendly/.test(text))
		const row = rowOf(view, 'Annoying One')
		check('with their picture, animated ones as gifs', row.props.icon.props.source.uri === 'https://cdn.discordapp.com/avatars/' + ANNOY + '/av1.png?size=64' && rowOf(view, 'friendly').props.icon.props.source.uri === 'https://cdn.discordapp.com/avatars/' + FRIEND + '/a_av2.gif?size=64')
		check('the list has a count in its title', /Silenced people \(2\)/.test(text) || findNodes(view.tree, n => n.type === 'Design.TableRowGroup').some(n => /\(2\)/.test(n.props.title ?? '')))
		row.props.onPress()
		check('tapping a person copies their ID', s.copied.at(-1) === ANNOY, s.copied)
		row.props.trailing.props.onPress()
		await sleep(5)
		check('Remove takes them off the list', s.storage.cache.users.join() === FRIEND && s.toasts().some(t => /no longer silenced/.test(t ?? '')), s.storage.cache)
		check('and their pings come back', create(s, msg(ANNOY)).payload.message.mentions.length === 1)
		s.stop()
	}
	{
		const s = await start()
		const view = await s.mountSettings()
		check('with nobody silenced the list says so', /Nobody yet/.test(textOf(view.tree)) && /Nobody is silenced yet/.test(textOf(view.tree)))
		check('the Silence them button waits for some text', button(view, 'Silence them').props.disabled === true)
		inputOf(view).props.onChange(`${ANNOY}, <@${FRIEND}> ${ANNOY} nonsense 12`)
		await view.settle()
		button(view, 'Silence them').props.onPress()
		await view.settle()
		check('ids, mentions and several at once are understood, once each', s.storage.cache.users.join() === `${ANNOY},${FRIEND}`, s.storage.cache.users)
		check('what could not be understood is said', /2 not understood/.test(textOf(view.tree)) && /2 people silenced/.test(textOf(view.tree)), textOf(view.tree))
		check('the box is cleared', inputOf(view).props.value === '')
		inputOf(view).props.onChange(ANNOY)
		await view.settle()
		button(view, 'Silence them').props.onPress()
		await view.settle()
		check('adding someone again says they already are', /1 already silenced/.test(textOf(view.tree)) && s.storage.cache.users.length === 2)
		inputOf(view).props.onChange('abc')
		await view.settle()
		button(view, 'Silence them').props.onPress()
		await view.settle()
		check('text that is no id is explained and not added', /1 not understood/.test(textOf(view.tree)) && s.storage.cache.users.length === 2)
		check('there is help on finding an ID', /Developer Mode/.test(textOf(view.tree)) && /\/silence/.test(textOf(view.tree)))
		switchRow(view, 'Silence everyone’s pings').props.onValueChange(true)
		switchRow(view, 'Silence @everyone and @here').props.onValueChange(true)
		switchRow(view, 'Silence role pings').props.onValueChange(true)
		await view.settle()
		check('the switches save', s.storage.cache.silenceAll === true && s.storage.cache.silenceEveryone === true && s.storage.cache.silenceRoles === true)
		check('the screen has no credits', !hasCredits(textOf(view.tree)))
		check('it ends with the debugging section', textOf(view.tree).includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		s.stop()
	}
	{
		// A person Discord does not know is asked for, once
		const asked = []
		const rest = { get: async ({ url }) => (asked.push(url), url === `/users/${OTHER}/profile` ? { body: { user: { id: OTHER, username: 'stranger', global_name: 'Stranger', avatar: null } } } : { body: { message: 'nope' } }), post() {}, patch() {} }
		const s = await start({ users: [OTHER] }, { rest })
		const view = await s.mountSettings()
		await sleep(30)
		await view.settle()
		check('then looked up and shown by name', !!rowOf(view, 'Stranger') && /@stranger/.test(textOf(view.tree)), textOf(view.tree))
		check('the web API was asked for the profile', asked.includes(`/users/${OTHER}/profile`), asked)
		s.stop()
	}

	// --- The report
	{
		const s = await start({ users: [ANNOY, 'not-an-id'], silenceEveryone: true })
		create(s, msg(ANNOY))
		create(s, msg(FRIEND, { mentions: [], mention_roles: [] }))
		s.runtime.through('NOTIFICATION_CREATE', { type: 'NOTIFICATION_CREATE', message: msg(ANNOY) })
		const cmd = flameOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'user', value: FRIEND }], {})
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('the report starts with the plugin and Discord versions', /Silence Users debug report/.test(report) && /Discord: 354\.5/.test(report), report.slice(0, 300))
		check('it says the hook is registered', /Hook in Discord's events \(MESSAGE_CREATE, MESSAGE_UPDATE, NOTIFICATION_CREATE\): registered/.test(report), report)
		check('it counts messages and what was taken out', /2 created, 0 edited; from someone silenced: 1/.test(report) && /direct 1, @everyone\/@here 2, roles 1/.test(report), report)
		check('it counts notifications seen and stopped', /Notification events seen: 1; stopped: 1/.test(report), report)
		check('it says what a message looked like, as yes and no', /author yes, mentions list, mention_roles list, mention_everyone flag/.test(report), report)
		check('it says whether the own id is readable', /Your own id readable: yes; errors while handling events: 0/.test(report))
		check('it says what the command did', /Command: module found; patch registered/.test(report) && /\/silence was in the answer [1-9]/.test(report) && /run 1 time\(s\)/.test(report), report)
		check('it has the settings and counts the people', /"silencedPeople": 3/.test(report) && /"invalidEntries": 1/.test(report) && /"silenceEveryone": true/.test(report), report)
		check('it holds no id, name or picture', !new RegExp(`${ANNOY}|${FRIEND}|${ME}|Annoying|friendly|annoying|av1`).test(report), report)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^[✓✗]/.test(n.props.label ?? '')).map(n => n.props.label)
		check('the self-check lists its steps', checks.length >= 8 && checks.some(c => /hook/.test(c)) && checks.some(c => /filter takes pings out/.test(c)), checks)
		check('the filter test passes', checks.some(c => /^✓ The filter takes pings out/.test(c)), checks)
		check('and it finds the bad id', checks.some(c => /^✗ Every silenced person has a valid id/.test(c)), checks)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}
	{
		// Nothing seen: the self-check says to wait; a Discord without our own id still works
		const s = await start({ users: [ANNOY] }, { noMe: true })
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const failed = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^✗/.test(n.props.label ?? '')).map(n => n.props.label)
		check('before any message the self-check says messages are not reaching it yet', failed.some(c => /Messages are reaching the plugin/.test(c)), failed)
		const m = create(s, msg(ANNOY)).payload.message
		check('without your own id the pings are still taken out', m.mentions.length === 0)
		s.stop()
	}
	{
		const s = await startPort('silence-users', { reactExtras: true })
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		check('with no Discord modules the report says what is missing', /not found yet/.test(s.copied.at(-1) ?? ''))
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
