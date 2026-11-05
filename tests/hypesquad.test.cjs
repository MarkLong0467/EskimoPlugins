'use strict'

/**
 * Tests for HypeSquad Switcher. Run with: node tests/hypesquad.test.cjs
 * (build first: bun run build:dev hypesquad, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep, findNode, findNodes, textOf } = require('./lib/harness.cjs')

const { check, done } = createReporter('HypeSquad Switcher')

// The plugin gives up on a request after 15 seconds. The tests do not wait that long.
const realSetTimeout = globalThis.setTimeout
globalThis.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms === 15000 ? 40 : ms, ...rest)

const FLAGS = { 1: 64, 2: 128, 3: 256 }

/**
 * Sets up a fake Discord with a current user, Discord's own HTTP module (unless `http` is false) and the plugin
 * running, and renders the settings screen.
 */
async function setup({ flags = 0, flagField = 'publicFlags', http = {}, token = 'secret-token', withHttp = true } = {}) {
	const user = { [flagField]: flags }
	const listeners = new Set()
	const calls = []
	const runtime = createRuntime({
		stores: {
			UserStore: {
				getCurrentUser: () => user,
				addChangeListener: listener => listeners.add(listener),
				removeChangeListener: listener => listeners.delete(listener),
			},
		},
	}).install()

	if (withHttp) {
		const module = {
			HTTPResponseError: class {},
			get() {},
			post: http.post ?? (async request => calls.push(['POST', request])),
			del: http.del ?? (async request => calls.push(['DELETE', request])),
		}
		if (http.useDelete) {
			delete module.del
			module.delete = async request => calls.push(['DELETE', request])
		}
		runtime.finders.loadModule(module)
	}
	if (token) runtime.finders.loadModule({ getToken: () => token })

	const { definition } = loadPlugin('hypesquad')
	const running = await startPlugin(definition, runtime)
	const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: {} }))
	await view.settle()

	const rows = () => findNodes(view.tree, node => node.type === 'Design.TableRow')
	const row = label => rows().find(node => node.props.label === label)
	const toasts = () => runtime.log.actions.filter(action => action.label === 'toast').map(action => action.args[1].text)
	/** Taps a row and waits for the change to finish (`wait` is longer for a request that has to time out). */
	const tap = async (label, wait = 30) => {
		row(label).props.onPress()
		await sleep(wait)
		await view.settle()
	}
	return { runtime, running, view, user, listeners, calls, rows, row, toasts, tap, definition }
}

;(async () => {
	// --- What the screen shows
	{
		const s = await setup()
		check('the three houses are listed in order', s.rows().map(row => row.props.label).join() === 'Bravery,Brilliance,Balance', s.rows().map(row => row.props.label))
		check('with no house, nothing says Current', s.rows().every(row => row.props.subLabel === undefined))
		check('and there is no Leave row', !s.row('Leave HypeSquad'))
	}
	for (const [id, name] of [[1, 'Bravery'], [2, 'Brilliance'], [3, 'Balance']]) {
		const s = await setup({ flags: FLAGS[id] })
		check(`profile flag ${FLAGS[id]} shows ${name} as Current`, s.row(name).props.subLabel === 'Current' && s.rows().filter(row => row.props.subLabel === 'Current').length === 1)
		check(`and then a Leave row appears (in red)`, s.row('Leave HypeSquad')?.props.variant === 'danger')
	}
	{
		const s = await setup({ flags: 128 | 1 | 4096, flagField: 'flags' })
		check('the plain `flags` field is used when `publicFlags` is missing, and other flags are ignored', s.row('Brilliance').props.subLabel === 'Current')
	}
	{
		const s = await setup({ flags: 64 })
		s.user.publicFlags = null
		s.user.flags = 256
		await s.view.update(s.runtime.React.createElement(s.definition.SettingsComponent, { api: {} }))
		check('a null `publicFlags` falls back to `flags`', s.row('Balance').props.subLabel === 'Current')
	}

	// --- Joining a house
	{
		const s = await setup()
		await s.tap('Bravery')
		check('tapping a house sends POST /hypesquad/online with its house_id through Discord\'s own connection', s.calls.length === 1 && s.calls[0][0] === 'POST' && s.calls[0][1].url === '/hypesquad/online' && s.calls[0][1].body.house_id === 1, s.calls)
		check('toasts say joining, then joined', s.toasts().join('|') === 'Joining HypeSquad Bravery...|You are now in HypeSquad Bravery.', s.toasts())
		check('the screen shows the new house at once, before Discord\'s profile catches up', s.row('Bravery').props.subLabel === 'Current' && !!s.row('Leave HypeSquad'))
	}
	{
		const s = await setup({ flags: 64 })
		await s.tap('Balance')
		check('switching houses sends the new house_id', s.calls[0][1].body.house_id === 3, s.calls)
		check('and the Current mark moves', s.row('Balance').props.subLabel === 'Current' && s.row('Bravery').props.subLabel === undefined)
		s.user.publicFlags = 256
		s.listeners.forEach(listener => listener())
		await s.view.settle()
		check('when Discord\'s profile data agrees, the screen keeps showing it', s.row('Balance').props.subLabel === 'Current')
		s.user.publicFlags = 128
		s.listeners.forEach(listener => listener())
		await s.view.settle()
		check('and afterwards follows Discord\'s data again (the pending change is dropped)', s.row('Brilliance').props.subLabel === 'Current' && s.row('Balance').props.subLabel === undefined)
	}
	{
		const s = await setup({ flags: 128 })
		await s.tap('Brilliance')
		check('tapping the house you are already in only says so', s.calls.length === 0 && s.toasts().join() === 'You are already in HypeSquad Brilliance.', s.toasts())
	}

	// --- Leaving
	{
		const s = await setup({ flags: 256 })
		await s.tap('Leave HypeSquad')
		check('leaving sends DELETE /hypesquad/online with no body', s.calls.length === 1 && s.calls[0][0] === 'DELETE' && s.calls[0][1].url === '/hypesquad/online' && !('body' in s.calls[0][1]), s.calls)
		check('toasts say leaving, then left', s.toasts().join('|') === 'Leaving HypeSquad...|You left HypeSquad.', s.toasts())
		check('the screen shows no house and no Leave row', s.rows().every(row => row.props.subLabel === undefined) && !s.row('Leave HypeSquad'))
	}
	{
		const s = await setup({ flags: 64, http: { useDelete: true } })
		await s.tap('Leave HypeSquad')
		check('a connection that calls it `delete` instead of `del` also works', s.calls.length === 1 && s.calls[0][0] === 'DELETE', s.calls)
	}

	// --- One change at a time
	{
		let release
		const gate = new Promise(resolve => (release = resolve))
		const s = await setup({ http: { post: async () => gate } })
		s.row('Bravery').props.onPress()
		await sleep(5)
		s.row('Balance').props.onPress()
		await sleep(5)
		check('a second tap while one change is running is refused', s.toasts().includes('Still working on the last change.'), s.toasts())
		release()
		await sleep(20)
		check('and the first change still finishes', s.toasts().includes('You are now in HypeSquad Bravery.'), s.toasts())
		await s.view.settle()
		s.row('Balance').props.onPress()
		await sleep(20)
		check('afterwards another change is allowed again', s.toasts().includes('Joining HypeSquad Balance...'), s.toasts())
	}

	// --- Failures, and what the toast says
	const failure = async (post, expected, name, wait) => {
		const s = await setup({ http: { post } })
		await s.tap('Bravery', wait)
		const last = s.toasts().at(-1)
		check(name, last === expected, last)
		check(`${name} (and the screen stays as it was)`, s.row('Bravery').props.subLabel === undefined)
		return s
	}
	await failure(async () => { throw { status: 429, body: {} } }, 'Discord says slow down. Try again in a minute.', 'rate limiting (429)')
	await failure(async () => { throw { status: 400, body: { captcha_key: ['captcha-required'] } } }, 'Discord wants a captcha for this change, which a plugin cannot do. Try again later.', 'a captcha demand')
	await failure(async () => { throw { status: 403, body: { message: 'Missing Access' } } }, 'Missing Access (403)', 'Discord\'s own message with the status')
	await failure(async () => { throw { status: 403, body: JSON.stringify({ message: 'Nope' }) } }, 'Nope (403)', 'a message that arrives as JSON text')
	await failure(async () => { throw { body: { message: 'No status here' } } }, 'No status here', 'a message without a status')
	await failure(async () => { throw { status: 500, body: 'not json' } }, 'Discord said no (500).', 'a bare status when the body is not usable')
	await failure(async () => { throw { response: { status: 502 } } }, 'Discord said no (502).', 'a status inside `response`')
	{
		const s = await failure(() => new Promise(() => {}), 'Discord took too long to answer. Try again.', 'a request that never answers', 120)
		await s.tap('Balance')
		check('after a timeout the next change can be tried', s.toasts().filter(text => text.startsWith('Joining')).length === 2, s.toasts())
	}

	// --- When Discord's own connection is missing or breaks
	{
		const fetched = []
		globalThis.fetch = async (url, options) => {
			fetched.push({ url, options })
			return { ok: true, status: 204, json: async () => ({}) }
		}
		const s = await setup({ withHttp: false })
		await s.tap('Bravery')
		check('with no connection module the request goes straight to the API with the token', fetched.length === 1 && fetched[0].url === 'https://discord.com/api/v9/hypesquad/online' && fetched[0].options.method === 'POST' && fetched[0].options.headers.Authorization === 'secret-token', fetched)
		check('with a JSON body and the content type', fetched[0].options.body === JSON.stringify({ house_id: 1 }) && fetched[0].options.headers['Content-Type'] === 'application/json')
		check('and it succeeds like any other change', s.toasts().at(-1) === 'You are now in HypeSquad Bravery.', s.toasts())
	}
	{
		const fetched = []
		globalThis.fetch = async (url, options) => {
			fetched.push({ url, options })
			return { ok: true, status: 204, json: async () => ({}) }
		}
		const s = await setup({ flags: 64, withHttp: false })
		await s.tap('Leave HypeSquad')
		check('leaving without a connection module sends DELETE with no body', fetched[0].options.method === 'DELETE' && fetched[0].options.body === undefined, fetched)
	}
	{
		const fetched = []
		globalThis.fetch = async (url, options) => {
			fetched.push({ url, options })
			return { ok: true, status: 204, json: async () => ({}) }
		}
		const s = await setup({ http: { post: async () => { throw new TypeError('broken call') } } })
		await s.tap('Bravery')
		check('a connection that breaks without Discord answering falls back to the direct request', fetched.length === 1 && s.toasts().at(-1) === 'You are now in HypeSquad Bravery.', s.toasts())
	}
	{
		globalThis.fetch = async () => ({ ok: false, status: 401, json: async () => ({ message: '401: Unauthorized' }) })
		const s = await setup({ withHttp: false })
		await s.tap('Bravery')
		check('an error answer from the direct request is explained with its status', s.toasts().at(-1) === '401: Unauthorized (401)', s.toasts())
	}
	{
		globalThis.fetch = async () => ({ ok: false, status: 502, json: async () => { throw new Error('not json') } })
		const s = await setup({ withHttp: false })
		await s.tap('Bravery')
		check('an error answer without a JSON body gives a bare status', s.toasts().at(-1) === 'Discord said no (502).', s.toasts())
	}
	{
		const s = await setup({ withHttp: false, token: null })
		await s.tap('Bravery')
		check('with no way to reach Discord at all, the toast says so', s.toasts().at(-1) === 'Could not find a way to reach Discord.', s.toasts())
	}

	// --- The screen follows Discord's own user changes, and cleans up
	{
		const s = await setup()
		check('the screen listens for Discord user changes while it is showing', s.listeners.size === 1)
		s.user.publicFlags = 256
		s.listeners.forEach(listener => listener())
		await s.view.settle()
		check('and redraws when they happen', s.row('Balance').props.subLabel === 'Current')
		s.view.unmount()
		check('closing the screen removes the listener', s.listeners.size === 0)
	}
	{
		let release
		const gate = new Promise(resolve => (release = resolve))
		const s = await setup({ http: { post: async () => gate } })
		s.row('Bravery').props.onPress()
		await sleep(5)
		await s.running.stop()
		release()
		await sleep(20)
		const second = await setup()
		await second.tap('Bravery')
		check('stopping the plugin clears a change that was in flight, so the next start is not stuck', second.toasts().at(-1) === 'You are now in HypeSquad Bravery.', second.toasts())
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
