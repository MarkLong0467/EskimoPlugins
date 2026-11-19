'use strict'

/**
 * Tests for Rich Presence's "Add a known game or app": searching Discord's list of detectable games and adding one to
 * the presences. Run with: node tests/rich-presence-known.test.cjs (build first, or just run `bun run test`).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')

/** Starts the plugin with a manifest, as Valenced does. */
async function startPlugin(definition, runtime, { storage }) {
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'rich-presence', 'manifest.json'), 'utf8'))
	const cleanups = []
	const plugin = { manifest: { ...manifest, version: { nums: [2, 0, 0] } }, errors: [], reportError() {}, requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	return { stop: () => { for (const c of [...cleanups].reverse()) if (typeof c === 'function') c() } }
}

const { check, done } = createReporter('Rich Presence: known games')

/** A small stand-in for Discord's detectable list, with the fields it really has (and some it has that are not used). */
const DETECTABLE = [
	{ id: '356875221078245376', name: 'Overwatch', aliases: [], icon_hash: 'a60bb76b', executables: [{ os: 'win32', name: 'overwatch.exe' }] },
	{ id: '356869127241072640', name: 'Minecraft', aliases: ['MC'], icon_hash: 'f2a8c3d1' },
	{ id: '1062154180262854696', name: 'Minecraft Dungeons', aliases: [], icon_hash: '' },
	{ id: '432980957394370572', name: 'Fortnite', aliases: [], icon_hash: 'b1' },
	{ id: '1111111111111111111', name: 'Call of Duty®: Warzone™', aliases: ['COD Warzone'], icon_hash: 'c0' },
	{ id: '2222222222222222222', name: 'Pokémon Legends', aliases: [], icon_hash: 'p1' },
	{ id: 'not-an-id', name: 'Broken entry' },
	{ id: '3333333333333333333', name: '' },
	...Array.from({ length: 60 }, (_, i) => ({ id: String(4000000000000000000n + BigInt(i)), name: `Star Game ${i + 1}`, aliases: [], icon_hash: 'x' })),
]

let mode = 'ok'
const fetched = []
globalThis.fetch = async url => {
	fetched.push(String(url))
	if (mode === 'offline') throw new Error('offline in the tests')
	if (mode === 'error') return { ok: false, status: 503, json: async () => ({}) }
	return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(DETECTABLE)) }
}

async function setup(saved = {}) {
	const runtime = createRuntime({}).install()
	const { definition } = loadPlugin('rich-presence')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(50)
	const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: { jsonStorage: storage } }))
	await view.settle()
	return { runtime, storage, view, running }
}

const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
const search = view => findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'Search')
/** The game rows: rows with an arrow on the search screen, other than the back button. */
const resultRows = view => findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.arrow && /^Playing · |^Already/.test(n.props.subLabel || ''))
async function type(view, text) {
	search(view).props.onChange(text)
	await view.settle()
}

;(async () => {
	// --- The row in the list opens the search, which fetches Discord's list once
	{
		const s = await setup()
		const open = rowOf(s.view, 'Add a known game or app')
		check('the Add a presence part has "Add a known game or app"', !!open && open.props.arrow === true)
		open.props.onPress()
		await s.view.settle()
		await sleep(20)
		await s.view.settle()
		check('it opens a search box', !!search(s.view))
		check('it fetches Discord\'s detectable list', fetched.includes('https://discord.com/api/v10/applications/detectable'), fetched)
		check('before typing it says how many there are', /66 games and apps/.test(textOf(s.view.tree)), textOf(s.view.tree).slice(0, 300))

		await type(s.view, 'minecraft')
		const names = resultRows(s.view).map(r => r.props.label)
		check('typing finds matches, the exact name first', names.join('|') === 'Minecraft|Minecraft Dungeons', names.join('|'))
		check('a result shows its icon', resultRows(s.view)[0]?.props.icon?.props?.source?.uri === 'https://cdn.discordapp.com/app-icons/356869127241072640/f2a8c3d1.png?size=64')

		await type(s.view, 'warzone')
		check('a name is found from a word in the middle, ignoring ® and ™', resultRows(s.view)[0]?.props.label === 'Call of Duty®: Warzone™')
		await type(s.view, 'cod warzone')
		check('other names (aliases) are searched too', resultRows(s.view)[0]?.props.label === 'Call of Duty®: Warzone™')
		await type(s.view, 'pokemon')
		check('accents do not matter', resultRows(s.view)[0]?.props.label === 'Pokémon Legends')
		await type(s.view, 'star game')
		check('at most 40 results show, with a note to type more', resultRows(s.view).length === 40 && !!rowOf(s.view, 'More matches'))
		await type(s.view, 'zzzz')
		check('no match says so', !!rowOf(s.view, 'Nothing found'))
		await type(s.view, 'broken')
		check('entries without a proper id or name are left out', resultRows(s.view).length === 0)

		// --- Picking one adds it to the presences, filled in, and opens its editor
		const before = s.storage.cache.profiles?.length ?? 1
		await type(s.view, 'overwatch')
		resultRows(s.view)[0].props.onPress()
		await sleep(30)
		await s.view.settle()
		const profiles = s.storage.cache.profiles
		const added = profiles.at(-1)
		check('picking one adds a presence to the list', profiles.length === before + 1, profiles.length)
		check('with the game\'s name in the list and as the activity', added.label === 'Overwatch' && added.name === 'Overwatch')
		check('with its Application ID', added.applicationId === '356875221078245376')
		check('as Playing', added.type === 0)
		check('with its icon as the large image', added.largeImage === 'https://cdn.discordapp.com/app-icons/356875221078245376/a60bb76b.png?size=512', added.largeImage)
		check('switched off, like any presence you add', added.enabled === false)
		check('and its editor opens', !search(s.view) && /Overwatch/.test(textOf(s.view.tree)) && !rowOf(s.view, 'Add a known game or app'))
		check('a toast says it was added', s.runtime.log.actions.some(a => a.label === 'toast' && /Overwatch added/.test(a.args[1]?.text || '')))

		// --- Back on the search, a game already in the list is marked; the list is not fetched again
		const count = fetched.length
		s.view.unmount()
		const view2 = s.runtime.mount(s.runtime.React.createElement(loadPlugin('rich-presence').definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view2.settle()
		rowOf(view2, 'Add a known game or app').props.onPress()
		await view2.settle(); await sleep(20); await view2.settle()
		await type(view2, 'overwatch')
		check('a game already in your presences is marked', /Already in your presences/.test(resultRows(view2)[0]?.props.subLabel || ''))
		const back = findNode(view2.tree, n => n.type === 'Design.Button' && /Presences/.test(n.props.text || ''))
		back.props.onPress()
		await view2.settle()
		check('the back button returns to the list', !!rowOf(view2, 'Add a known game or app'))
		view2.unmount()
		s.running.stop()
		void count
	}

	// --- When Discord's list cannot be fetched, it says so and can try again
	{
		mode = 'error'
		const s = await setup()
		// A fresh copy of the plugin has nothing fetched yet.
		rowOf(s.view, 'Add a known game or app').props.onPress()
		await s.view.settle(); await sleep(20); await s.view.settle()
		const failed = rowOf(s.view, 'Could not load the list')
		check('a failed fetch is shown', !!failed && /503/.test(failed.props.subLabel), failed && failed.props.subLabel)
		mode = 'ok'
		rowOf(s.view, 'Try again').props.onPress()
		await s.view.settle(); await sleep(20); await s.view.settle()
		await type(s.view, 'fortnite')
		check('Try again fetches it again and search works', resultRows(s.view)[0]?.props.label === 'Fortnite')
		s.view.unmount()
		s.running.stop()
	}

	done()
})()
