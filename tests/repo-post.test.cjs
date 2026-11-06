'use strict'

/**
 * Tests for Repo Post. Run with: node tests/repo-post.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Discord's server connection, the user and `fetch` are fakes. The plugin's timers are captured so a test can make it
 * look whenever it likes.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')
const { makePost, fallbackShort } = require('../tools/post.cjs')

const { check, done } = createReporter('Repo Post')

const CHANNEL = '1567899938896220160'
const MESSAGE = '1567899938896220160'

/** A list made the way `tools/post.cjs` makes it, from the real short descriptions: 31 plugins at version 1.2.3. */
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'post.config.json'), 'utf8'))
const titleOf = id =>
	id
		.replace('marklong.', '')
		.split('-')
		.map(w => w[0].toUpperCase() + w.slice(1))
		.join(' ')
const index = {
	plugins: Object.fromEntries(Object.keys(config.short).map(id => [id, { name: titleOf(id), description: `${titleOf(id)} does things. More text.`, channels: { latest: '1.2.3' } }])),
}
const listFor = (version = '1.2.3') => {
	const copy = JSON.parse(JSON.stringify(index))
	for (const p of Object.values(copy.plugins)) p.channels.latest = version
	return makePost(copy, config)
}

/** A fake Discord with the plugin running. */
async function setup({ saved = {}, list = listFor(), author = 'me', me = 'me', content = 'the old post', premium = 0, missingMessage = false, noHttp = false } = {}) {
	const intervals = []
	const timeouts = []
	const real = { setInterval: globalThis.setInterval, setTimeout: globalThis.setTimeout }
	globalThis.setInterval = fn => {
		intervals.push(fn)
		return intervals.length
	}
	globalThis.setTimeout = (fn, ms, ...rest) => (ms >= 10_000 ? (timeouts.push(fn), timeouts.length) : real.setTimeout(fn, ms, ...rest))

	const state = { list, fetchOk: true, fetched: [], gets: [], patches: [], message: { id: MESSAGE, content, author: { id: author } }, failPatch: false }
	globalThis.fetch = async url => {
		state.fetched.push(url)
		return { ok: state.fetchOk, status: state.fetchOk ? 200 : 503, json: async () => state.list }
	}
	const http = {
		HTTPResponseError: class {},
		get: async ({ url }) => {
			state.gets.push(url)
			return { body: missingMessage ? [] : [state.message] }
		},
		patch: async ({ url, body }) => {
			if (state.failPatch) throw { status: 403, body: { message: 'Missing Permissions' } }
			state.patches.push({ url, body })
			state.message.content = body.content
			return {}
		},
	}
	const copied = []
	const runtime = createRuntime({
		stores: { UserStore: { getCurrentUser: () => ({ id: me, premiumType: premium }) } },
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
			discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } } },
		},
	}).install()
	if (!noHttp) runtime.valenced.modules.finders.loadModule(http)
	const { definition } = loadPlugin('repo-post')
	const storage = runtime.makeStorage({ ...saved })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'repo-post', 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: [1, 0, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	globalThis.setInterval = real.setInterval
	globalThis.setTimeout = real.setTimeout

	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	/** Lets the plugin look, as its interval does, and waits for it to finish. */
	const look = async () => {
		for (const fn of intervals) fn()
		await sleep(30)
	}
	const stop = () => {
		for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
	}
	const mountSettings = async () => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api }))
		await view.settle()
		await sleep(30)
		await view.settle()
		return view
	}
	return { runtime, state, storage, copied, errors, toasts, look, stop, mountSettings, definition, api }
}

const btn = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)
const lines = text => text.split('\n')

;(async () => {
	// --- The list the repository makes
	{
		const list = listFor()
		check('the list has every plugin with a short line', list.plugins.length === Object.keys(config.short).length && list.plugins.every(p => p.short && p.version === '1.2.3'), list.plugins.length)
		const names = list.plugins.map(p => p.name.toLowerCase())
		check('the list is in alphabetical order', names.every((n, i) => i === 0 || names[i - 1] <= n), names.slice(0, 5))
		check('Custom Sounds is marked beta', list.plugins.find(p => p.id === 'marklong.custom-sounds').suffix === '(beta)')
		check('a plugin with no short line gets the first sentence of its description', fallbackShort('Does a thing. And more.') === 'Does a thing')
		check('a long fallback is cut at a word with an ellipsis', fallbackShort(`${'word '.repeat(40)}.`).endsWith('…') && fallbackShort(`${'word '.repeat(40)}.`).length <= 101)
		const publish = fs.readFileSync(path.join(ROOT, 'tools', 'publish.cjs'), 'utf8')
		check('publishing writes the list every time', publish.includes("require('./post.cjs').writePost(indexDir)"))
	}

	// --- Updating by itself
	{
		const s = await setup()
		await s.look()
		check('the first look edits the post', s.state.patches.length === 1, s.state.patches.length)
		const sent = s.state.patches[0]
		check('it edits the right message', sent && sent.url === `/channels/${CHANNEL}/messages/${MESSAGE}`, sent?.url)
		check('it reads the right message', s.state.gets.length === 1 && s.state.gets[0].includes(`/channels/${CHANNEL}/messages?around=${MESSAGE}`), s.state.gets)
		const text = sent.body.content
		const rows = lines(text)
		check('the post starts with the header lines', rows[0] === '**EskimoPlugins**' && rows[1].startsWith('Add this in Settings') && rows[2].startsWith('`https://raw.githubusercontent.com/'), rows.slice(0, 4))
		check('it has the Plugins heading and the GitHub link', rows.includes('**Plugins**') && rows.includes('https://github.com/MarkLong0467/EskimoPlugins/'))
		const bullets = rows.filter(r => r.startsWith('• '))
		check('every plugin has a bullet', bullets.length === Object.keys(config.short).length, bullets.length)
		check('every bullet has its version number', bullets.every(b => b.includes('`1.2.3`')), bullets.find(b => !b.includes('`1.2.3`')))
		check('a bullet looks like the old list with the version added', bullets.some(b => /^• \*\*Always Animate\*\* `1\.2\.3`: /.test(b)), bullets.slice(0, 3))
		check('the beta mark comes after the name', bullets.some(b => b.startsWith('• **Custom Sounds** (beta) `1.2.3`')))
		check('the post is within 2000 characters', text.length <= 2000, text.length)
		check('descriptions are shortened to fit and say so with an ellipsis', bullets.some(b => b.endsWith('…')))
		check('the previous text is kept for Restore', s.storage.cache.previousText === 'the old post')
		check('a toast says it was updated', s.toasts().some(t => /Repo post updated \(\d+ plugins\)/.test(t)), s.toasts())
		check('the list was fetched with a changing address, so a cached copy is not used for long', /post\.json\?t=\d+$/.test(s.state.fetched[0]), s.state.fetched)

		await s.look()
		check('a second look changes nothing and does not ask Discord again', s.state.patches.length === 1 && s.state.gets.length === 1, [s.state.patches.length, s.state.gets.length])

		s.state.list = listFor('2.0.0')
		await s.look()
		check('a new version in the list edits the post again', s.state.patches.length === 2 && s.state.patches[1].body.content.includes('`2.0.0`'), s.state.patches.length)
		check('the old text is now the one before', s.storage.cache.previousText.includes('`1.2.3`'))
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Nitro
	{
		const s = await setup({ premium: 2 })
		await s.look()
		const text = s.state.patches[0]?.body.content || ''
		check('with Nitro the limit is 4000 and the full descriptions fit', text.length > 2000 && text.length <= 4000 && text.includes('removes the untrusted link confirmation') && !text.includes('…'), text.length)
		s.stop()
	}
	{
		const s = await setup({ saved: { limit: '2000' }, premium: 2 })
		await s.look()
		check('the length can be forced to 2000 even with Nitro', (s.state.patches[0]?.body.content || '').length <= 2000)
		s.stop()
	}

	// --- Version numbers off
	{
		const s = await setup({ saved: { versions: false } })
		await s.look()
		check('with versions off the bullets have none', !(s.state.patches[0]?.body.content || '').includes('`1.2.3`'))
		s.stop()
	}

	// --- Safety
	{
		const s = await setup({ author: 'someone-else' })
		await s.look()
		check('a post written by somebody else is never edited', s.state.patches.length === 0)
		const view = await s.mountSettings()
		check('and the screen says why', textOf(view.tree).includes('not written by this account'), textOf(view.tree).slice(-600))
		view.unmount()
		await s.look()
		check('after a failure it waits instead of trying again at once', s.state.gets.length === 1, s.state.gets.length)
		s.stop()
	}
	{
		const s = await setup({ missingMessage: true })
		await s.look()
		const view = await s.mountSettings()
		check('a message that cannot be found is reported', s.state.patches.length === 0 && textOf(view.tree).includes('Could not find the post'), textOf(view.tree).slice(-500))
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ noHttp: true })
		await s.look()
		check('without Discord’s server connection nothing is sent', s.state.patches.length === 0)
		s.stop()
	}
	{
		const s = await setup()
		s.state.failPatch = true
		await s.look()
		const view = await s.mountSettings()
		check('a refusal from Discord is shown with its reason', textOf(view.tree).includes('HTTP 403: Missing Permissions'), textOf(view.tree).slice(-500))
		check('a refused edit is not remembered as done', !s.storage.cache.syncedHash)
		view.unmount()
		s.stop()
	}
	{
		const s = await setup()
		s.state.fetchOk = false
		await s.look()
		check('a list that cannot be fetched changes nothing', s.state.patches.length === 0 && s.state.gets.length === 0)
		s.state.fetchOk = true
		s.state.list = { nope: true }
		await s.look()
		check('a list in the wrong form changes nothing', s.state.patches.length === 0)
		s.stop()
	}
	{
		const s = await setup({ saved: { auto: false } })
		await s.look()
		check('with automatic updates off nothing is fetched or sent', s.state.fetched.length === 0 && s.state.patches.length === 0)
		s.stop()
	}

	// --- A post that already matches
	{
		const first = await setup()
		await first.look()
		const matching = first.state.patches[0].body.content
		first.stop()
		const s = await setup({ content: matching })
		await s.look()
		check('a post that already says the same is not edited', s.state.patches.length === 0 && s.state.gets.length === 1)
		check('and it is remembered as matching', !!s.storage.cache.syncedHash)
		s.stop()
	}

	// --- The settings screen: the preview comes first
	{
		const s = await setup({ saved: { auto: false } })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		const at = word => text.indexOf(word)
		check('the preview is the first thing on the screen', at('What the post will say') >= 0 && at('What the post will say') < at('Your post') && at('What the post will say') < at('Options'), [at('What the post will say'), at('Your post')])
		check('it shows the header and the plugins with versions', text.includes('**EskimoPlugins**') && text.includes('**Always Animate** `1.2.3`'), text.slice(0, 300))
		check('it shows how long the post is', /\d+ of 2000 characters\. Descriptions shortened to fit/.test(text), text.slice(0, 200))
		check('it makes no change to the post while only previewing', s.state.patches.length === 0)
		btn(view, 'Copy the text').props.onPress()
		check('Copy the text copies exactly the preview', s.copied.at(-1)?.startsWith('**EskimoPlugins**') && s.copied.at(-1).includes('`1.2.3`'))
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { auto: false }, premium: 2 })
		const view = await s.mountSettings()
		check('with Nitro the preview says full descriptions', /of 4000 characters\. Full descriptions\./.test(textOf(view.tree)))
		view.unmount()
		s.stop()
	}
	{
		const s = await setup({ saved: { auto: false } })
		s.state.fetchOk = false
		const view = await s.mountSettings()
		check('if the list cannot be loaded the preview says so', textOf(view.tree).includes('The list answered HTTP 503'), textOf(view.tree).slice(0, 200))
		view.unmount()
		s.stop()
	}

	// --- Update now, and Restore
	{
		const s = await setup({ saved: { auto: false } })
		const view = await s.mountSettings()
		check('there is no Restore button before anything changed', !btn(view, 'Restore the previous text'))
		btn(view, 'Update the post now').props.onPress()
		await sleep(60)
		check('Update the post now edits the post even with automatic updates off', s.state.patches.length === 1)
		const after = await s.mountSettings()
		check('then the screen says it was edited', /Post edited: \d+ plugins, \d+ of 2000 characters/.test(textOf(after.tree)), textOf(after.tree).slice(0, 400))
		const restore = btn(after, 'Restore the previous text')
		check('and a Restore button appears', !!restore)
		const alerts = []
		const reactNative = s.runtime.valenced.react.ReactNative
		const originalAlert = reactNative.Alert
		reactNative.Alert = { alert: (title, message, buttons) => alerts.push(buttons) }
		restore.props.onPress()
		reactNative.Alert = originalAlert
		const confirm = alerts[0]?.find(b => b.text === 'Restore')
		check('Restore asks first', !!confirm)
		confirm.onPress()
		await sleep(60)
		check('Restore puts the previous text back', s.state.patches.length === 2 && s.state.patches[1].body.content === 'the old post', s.state.patches.map(p => p.body.content.slice(0, 20)))
		check('and turns automatic updates off', s.storage.cache.auto === false)
		view.unmount()
		after.unmount()
		s.stop()
	}
	{
		const s = await setup()
		await s.look()
		await s.storage.set({ auto: false })
		const view = await s.mountSettings()
		s.state.list = listFor('3.0.0')
		await s.look()
		check('with auto off a new version does not edit the post', s.state.patches.length === 1)
		view.unmount()
		s.stop()
	}

	// --- Copy logs
	{
		const s = await setup()
		await s.look()
		const view = await s.mountSettings()
		btn(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs puts a report on the clipboard', report.length > 200)
		check('the report names the plugin and credits the author', report.includes('marklong.repo-post 1.0.0') && report.includes('Made by MarkLong0467'))
		check('the report has the ids, the counts and the last result', report.includes(CHANNEL) && /List: \d+ plugins/.test(report) && /Last result: updated/.test(report), report.split('\n').slice(6, 24))
		check('the report holds no text of the post', !report.includes('removes the untrusted link confirmation') && !report.includes('the old post'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the screen has no credits on it', !/Made by|kmmiio/.test(textOf(view.tree)))
		view.unmount()
		s.stop()
	}

	done()
})()
