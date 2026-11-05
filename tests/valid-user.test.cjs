'use strict'

/**
 * Tests for Valid User. Run with: node tests/valid-user.test.cjs
 * (build first: bun run build:dev valid-user, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Valid User')

// The plugin waits 300 ms between two lookups. The tests do not need to wait that long, so that wait is run on the
// next tick. (A short real timer is not enough: Windows timers are coarse, so many lookups in a row would be slow.)
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...rest) => (ms === 300 ? setImmediate(fn, ...rest) : realSetTimeout(fn, ms, ...rest))

/** Discord snowflakes are 17 to 20 digits. This makes a distinct one for each number. */
const id = n => String(10000000000000000n + BigInt(n))

/**
 * Builds a fake Discord for one scenario: user and message stores, the user actions module, and the plugin running.
 * `getUser` adds the user to the store after a short delay, unless the id is in `failIds`.
 */
async function setup({ withActions = true } = {}) {
	const known = new Set()
	const stored = new Map()
	const failIds = new Set()
	const throwIds = new Set()
	const fetched = []

	const runtime = createRuntime({
		stores: {
			UserStore: { getUser: userId => (known.has(userId) ? { id: userId } : undefined) },
			MessageStore: { getMessage: (channelId, messageId) => stored.get(`${channelId}:${messageId}`) },
		},
	}).install()

	const actions = {
		getUser(userId) {
			fetched.push(userId)
			if (throwIds.has(userId)) throw new Error('boom')
			return new Promise((resolve, reject) =>
				setImmediate(() => {
					if (failIds.has(userId)) return reject(new Error('Unknown User'))
					known.add(userId)
					resolve({ id: userId })
				}),
			)
		},
		fetchCurrentUser() {},
	}

	const { definition } = loadPlugin('valid-user')
	const running = await startPlugin(definition, runtime)
	if (withActions) {
		runtime.finders.loadModule(actions)
		await sleep(5)
	}

	/** Stores a message so the plugin can look it up when it redraws it, and returns it. */
	const store = message => {
		stored.set(`${message.channel_id}:${message.id}`, message)
		return message
	}
	const updates = () => runtime.log.dispatched.filter(action => action.type === 'MESSAGE_UPDATE')

	return { runtime, running, actions, known, stored, failIds, throwIds, fetched, store, updates }
}

;(async () => {
	// --- A mention of an unknown user is fetched, and the message is drawn again
	{
		const s = await setup()
		const message = s.store({ id: 'm1', channel_id: 'c1', content: `hello <@${id(1)}>`, embeds: [] })
		s.runtime.fire('MESSAGE_CREATE', { message })
		await sleep(20)
		check('an unknown user in a new message is fetched', s.fetched.length === 1 && s.fetched[0] === id(1), s.fetched)
		const [update] = s.updates()
		check('the message is redrawn once the user is known', s.updates().length === 1 && update.message.id === 'm1' && update.message.channel_id === 'c1', s.updates())
		check('the redraw carries the content and embeds, and nothing else', Object.keys(update.message).sort().join() === 'channel_id,content,embeds,id' && update.message.content === message.content)
	}
	{
		const s = await setup()
		s.known.add(id(2))
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(2)}>`, embeds: [] }) })
		await sleep(20)
		check('a user Discord already knows is not fetched', s.fetched.length === 0 && s.updates().length === 0)
	}
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_UPDATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `edited <@${id(3)}>`, embeds: [] }) })
		await sleep(20)
		check('an edited message (MESSAGE_UPDATE) is scanned too', s.fetched.includes(id(3)))
	}

	// --- What counts as a mention
	{
		const s = await setup()
		const text = `nick <@!${id(4)}> short <@${'1'.repeat(16)}> long <@${'1'.repeat(21)}> plain ${id(5)} role <@&${id(6)}> channel <#${id(7)}>`
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: text, embeds: [] }) })
		await sleep(20)
		check('the nickname form <@!id> is found', s.fetched.includes(id(4)))
		check('ids that are too short, too long, bare, role or channel mentions are ignored', s.fetched.length === 1, s.fetched)
	}

	// --- Every place Discord draws markdown is scanned
	{
		const s = await setup()
		const embed = {
			title: `<@${id(10)}>`,
			description: `<@${id(11)}>`,
			author: { name: `<@${id(12)}>` },
			footer: { text: `<@${id(13)}>` },
			rawTitle: `<@${id(14)}>`,
			rawDescription: `<@${id(15)}>`,
			fields: [{ name: `<@${id(16)}>`, value: `<@${id(17)}>`, rawName: `<@${id(18)}>`, rawValue: `<@${id(19)}>` }],
		}
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: '', embeds: [embed] }) })
		await sleep(60)
		const wanted = [10, 11, 12, 13, 14, 15, 16, 17, 18, 19].map(id)
		check('embed title, description, author, footer, raw text and all four field values are scanned', wanted.every(userId => s.fetched.includes(userId)), s.fetched)
	}
	{
		const s = await setup()
		const message = s.store({
			id: 'm1',
			channel_id: 'c1',
			content: 'forwarded',
			embeds: [],
			message_snapshots: [{ message: { content: `<@${id(20)}>`, embeds: [{ description: `<@${id(21)}>` }] } }, undefined, {}],
		})
		s.runtime.fire('MESSAGE_CREATE', { message })
		await sleep(40)
		check('forwarded messages (snapshots) are scanned, including their embeds', s.fetched.includes(id(20)) && s.fetched.includes(id(21)), s.fetched)
		check('a redraw for a forwarded mention targets the outer message', s.updates().every(update => update.message.id === 'm1'), s.updates())
	}
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: { id: 'm1', channel_id: 'c1', content: { not: 'a string' }, embeds: [{ title: 5, fields: [{ name: null }, null] }, null] } })
		await sleep(10)
		check('odd message shapes do not break the scan', s.fetched.length === 0)
	}

	// --- Message lists use the list's channel when a message has none
	{
		const s = await setup()
		const withChannel = { id: 'a', channel_id: 'c-own', content: `<@${id(30)}>`, embeds: [] }
		const withoutChannel = { id: 'b', content: `<@${id(31)}>`, embeds: [] }
		s.stored.set('c-own:a', withChannel)
		s.stored.set('c-list:b', { ...withoutChannel, channel_id: undefined })
		s.runtime.fire('LOAD_MESSAGES_SUCCESS', { messages: [withChannel, withoutChannel], channelId: 'c-list' })
		await sleep(60)
		check('messages in a loaded list are scanned', s.fetched.includes(id(30)) && s.fetched.includes(id(31)), s.fetched)
		const lateUpdate = s.updates().find(update => update.message.id === 'b')
		check('a message without channel_id is found and redrawn using the list channel', lateUpdate && lateUpdate.message.channel_id === 'c-list', s.updates())
	}
	for (const type of ['LOAD_MESSAGES_AROUND_SUCCESS', 'LOAD_PINNED_MESSAGES_SUCCESS', 'LOAD_RECENT_MENTIONS_SUCCESS']) {
		const s = await setup()
		s.runtime.fire(type, { messages: [{ id: 'a', channel_id: 'c1', content: `<@${id(32)}>`, embeds: [] }] })
		await sleep(20)
		check(`${type} is scanned`, s.fetched.includes(id(32)))
	}
	{
		const s = await setup()
		s.runtime.fire('LOAD_MESSAGES_SUCCESS', { messages: 'not a list' })
		s.runtime.fire('LOAD_MESSAGES_SUCCESS', {})
		await sleep(10)
		check('a list event without a message array is ignored', s.fetched.length === 0)
	}
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: { content: `<@${id(33)}>` } })
		s.runtime.fire('MESSAGE_CREATE', { message: { id: 'x', content: `<@${id(34)}>` } })
		s.runtime.fire('MESSAGE_CREATE', {})
		await sleep(10)
		check('messages with no id, or no channel anywhere, are ignored', s.fetched.length === 0, s.fetched)
	}

	// --- Several messages, one user
	{
		const s = await setup()
		const first = s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(40)}>`, embeds: [] })
		const second = s.store({ id: 'm2', channel_id: 'c2', content: `again <@${id(40)}>`, embeds: [] })
		s.runtime.fire('MESSAGE_CREATE', { message: first })
		s.runtime.fire('MESSAGE_CREATE', { message: second })
		await sleep(30)
		check('one user mentioned in two messages is fetched once', s.fetched.filter(userId => userId === id(40)).length === 1, s.fetched)
		check('and both messages are redrawn', s.updates().length === 2 && s.updates().map(update => update.message.id).sort().join() === 'm1,m2', s.updates())
	}
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(41)}> <@${id(42)}> <@${id(43)}>`, embeds: [] }) })
		await sleep(60)
		check('several users in one message are all fetched, one after another', s.fetched.length === 3 && new Set(s.fetched).size === 3, s.fetched)
	}

	// --- Redraw details
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: { id: 'gone', channel_id: 'c1', content: `<@${id(44)}>`, embeds: [] } }) // not in the store
		await sleep(30)
		check('a message Discord no longer has is not redrawn', s.fetched.length === 1 && s.updates().length === 0)
	}

	// --- Failures
	{
		const s = await setup()
		s.failIds.add(id(50))
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(50)}>`, embeds: [] }) })
		await sleep(30)
		check('a user that cannot be fetched is not redrawn', s.fetched.length === 1 && s.updates().length === 0)
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm2', channel_id: 'c1', content: `<@${id(50)}> again`, embeds: [] }) })
		await sleep(30)
		check('and it is not asked for again', s.fetched.length === 1, s.fetched)
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm3', channel_id: 'c1', content: `<@${id(51)}>`, embeds: [] }) })
		await sleep(30)
		check('a failure does not stop the queue', s.fetched.includes(id(51)) && s.updates().length === 1, s.fetched)
	}
	if (!process.env.BUNDLE_DIR) {
		// The previous version stalled forever here, so this is only checked on the current build.
		const s = await setup()
		s.throwIds.add(id(52))
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(52)}> <@${id(53)}>`, embeds: [] }) })
		await sleep(60)
		check('a lookup that throws at once counts as failed and the queue carries on', s.fetched.includes(id(53)) && s.updates().length === 1, s.fetched)
	}

	// --- The queue limit
	{
		const s = await setup()
		const mentions = Array.from({ length: 205 }, (_, index) => `<@${id(1000 + index)}>`).join(' ')
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'big', channel_id: 'c1', content: mentions, embeds: [] }) })
		await sleep(900)
		check('at most 200 users are queued at once, the rest are ignored', s.fetched.length === 200, s.fetched.length)
	}

	// --- Waiting for Discord's module
	{
		const s = await setup({ withActions: false })
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(60)}>`, embeds: [] }) })
		await sleep(20)
		check('nothing is fetched while Discord\'s user actions have not been found', s.fetched.length === 0)
		s.runtime.finders.loadModule(s.actions)
		await sleep(30)
		check('the waiting user is fetched as soon as the module appears', s.fetched.includes(id(60)) && s.updates().length === 1, s.fetched)
	}

	// --- Stopping
	{
		const s = await setup()
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm1', channel_id: 'c1', content: `<@${id(70)}>`, embeds: [] }) })
		await s.running.stop() // the lookup for id(70) is in flight
		await sleep(30)
		check('a lookup that finishes after stopping does not redraw', s.updates().length === 0, s.updates())
		s.runtime.fire('MESSAGE_CREATE', { message: s.store({ id: 'm2', channel_id: 'c1', content: `<@${id(71)}>`, embeds: [] }) })
		await sleep(30)
		check('after stopping, new mentions are not fetched', !s.fetched.includes(id(71)), s.fetched)
		check('stopping leaves no module subscription behind', s.runtime.finders.activeSubscriptions() === 0)
	}

	// --- A broken payload must not escape the event handler
	{
		const s = await setup()
		const warn = console.warn
		const warnings = []
		console.warn = (...args) => warnings.push(args.join(' '))
		const hostile = {
			get message() {
				throw new Error('bad payload')
			},
		}
		let returned
		let threw = false
		try {
			returned = s.runtime.fire('MESSAGE_CREATE', hostile)
		} catch {
			threw = true
		}
		console.warn = warn
		check('an error while scanning is caught and logged, not thrown', !threw && warnings.some(line => line.includes('[valid-user]') && line.includes('scan failed')), warnings)
		check('and the event payload is passed on unchanged', returned === hostile)
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
