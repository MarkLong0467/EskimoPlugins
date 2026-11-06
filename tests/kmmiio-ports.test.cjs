'use strict'

/**
 * Tests for the plugins ported from kmmiio99o. Run with: node tests/kmmiio-ports.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * For every plugin this starts the built bundle the way Valenced does, opens its settings, and checks the two things the
 * ports add to the original: the credit for kmmiio99o and the debugging section at the bottom. "Copy logs" must put a
 * report on the clipboard that names the plugin, credits the author and never contains a secret from the settings.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, findNode, textOf, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('kmmiio99o ports')

/** A value that must never show up in a report. */
const SECRET = 'SECRET-VALUE-9f3a'

/** The plugins, the secrets to plant in their settings, and what a started plugin is given to work with. */
const PLUGINS = [
	{ dir: 'kmmiio-lib', lib: true },
	{ dir: 'toast-api' },
	{ dir: 'altmaster', needsLib: true, secrets: { baseUrl: `https://user:${SECRET}@example.test/path?token=${SECRET}` } },
	{ dir: 'alwaystrust' },
	{ dir: 'better-devices', needsLib: true },
	{ dir: 'chatbox-avatar', needsLib: true },
	{ dir: 'chatbubbles', needsLib: true },
	{ dir: 'custom-rpc', needsLib: true, secrets: { clientId: SECRET, applicationName: SECRET, details: SECRET, state: SECRET } },
	{ dir: 'declutter', needsLib: true },
	{ dir: 'markdown-toolbar', needsLib: true },
	{ dir: 'materialcord' },
	{ dir: 'message-tweaks', needsLib: true, secrets: { persisted: { hidden: { c1: { m1: SECRET } } } } },
	{ dir: 'multi-scrobbler', needsLib: true, secrets: { username: SECRET, apiKey: SECRET, librefmApiKey: SECRET, listenbrainzToken: SECRET, listenbrainzUsername: SECRET, librefmUsername: SECRET } },
	{ dir: 'server-drawer', needsLib: true },
	{ dir: 'kmmiio-server-info', needsLib: true },
]

/** Reads a plugin's manifest the way Valenced hands it to a running plugin. */
function manifestOf(dir) {
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', dir, 'manifest.json'), 'utf8'))
	return { ...manifest, version: { nums: manifest.version.split('.').map(Number) } }
}

/** A fake Discord with the pieces these plugins reach for at start, and the clipboard watched. */
function makeRuntime(copied) {
	const runtime = createRuntime({
		overrides: {
			externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
			discord: {
				flux: { getStore: () => () => {} },
				utils: { modules: { finders: { getModuleWithImportedPath: () => () => {} } } },
				// Message Tweaks keeps its settings in tabs. Here the tab state is its own options and every tab is drawn, so the last one can be looked at.
				design: {
					Design: {
						useSegmentedControlState: options => options,
						SegmentedControl: () => null,
						SegmentedControlPages: ({ state }) => ({ type: 'Pages', props: { children: state.items.map(item => item.page) } }),
					},
				},
				native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } },
			},
			react: {
				ReactNative: {
					Platform: { OS: 'android', Version: 34 },
					// Enough of Animated for a card that spins an avatar.
					Animated: { Value: class { interpolate() { return '0deg' } }, timing: () => ({ start() {} }), View: 'Animated.View' },
				},
			},
		},
	}).install()
	return runtime
}

/** Runs a plugin's `start` with a plugin object like the one Valenced makes. Returns what a test needs to look inside. */
async function start(entry, runtime, libraries) {
	const { definition } = loadPlugin(entry.dir)
	const manifest = manifestOf(entry.dir)
	const cleanups = []
	const decorators = []
	const errors = []
	const storage = runtime.makeStorage({ ...(definition.jsonStorage?.default ?? {}), ...(entry.secrets ?? {}) })
	const unscoped = runtime.valenced
	const plugin = { manifest, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false, api: { unscoped } }
	const api = {
		cleanup: (...fns) => cleanups.push(...fns),
		decorate: fn => decorators.push(fn),
		jsonStorage: storage,
		logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
		plugin,
		unscoped,
	}
	plugin.api = api
	// The library decorates every plugin's api, so a dependent sees `api.unscoped.kmmiio`.
	for (const lib of libraries) for (const fn of lib.decorators) fn(plugin)
	let threw = null
	try {
		await definition.start?.call(plugin, { ...api, plugin })
	} catch (error) {
		threw = error
	}
	return { definition, plugin, api, storage, cleanups, decorators, errors, threw, manifest }
}

/** Mounts a plugin's settings screen. */
async function mountSettings(running, runtime) {
	const Settings = running.definition.SettingsComponent
	const view = runtime.mount(runtime.React.createElement(Settings, { api: running.api }))
	await view.settle()
	return view
}

const buttonOf = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)

;(async () => {
	// The library is started first, as Valenced does for a dependency, and decorates the others.
	const libraries = []
	const copied = []

	for (const entry of PLUGINS) {
		const name = entry.dir
		const runtime = makeRuntime(copied)
		copied.length = 0
		let running
		try {
			running = await start(entry, runtime, libraries)
		} catch (error) {
			check(`${name}: the bundle can be started`, false, error)
			continue
		}
		if (entry.lib) libraries.push(running)

		// --- The manifest: credit and identity
		const manifest = running.manifest
		check(`${name}: MarkLong0467 is the author`, manifest.author.startsWith('MarkLong0467'), manifest.author)
		check(`${name}: kmmiio99o is credited as the original author with their Discord ID and website`, manifest.contributors.some(c => /^kmmiio99o <879393496627306587>/.test(c) && c.includes('https://kmmiio99o.dev')), manifest.contributors)
		check(`${name}: the id is in the marklong namespace`, manifest.id.startsWith('marklong.'), manifest.id)
		check(`${name}: it depends on Valenced and not on Revenge`, !!manifest.dependencies['valenced.api'] && !manifest.dependencies['revenge.api'])
		check(`${name}: start did not throw`, running.threw === null, running.threw)
		check(`${name}: it has a settings screen`, typeof running.definition.SettingsComponent === 'function')
		if (running.threw || typeof running.definition.SettingsComponent !== 'function') continue

		// --- The settings screen
		let view
		try {
			view = await mountSettings(running, runtime)
		} catch (error) {
			check(`${name}: the settings screen can be drawn`, false, String(error?.stack ?? error).split(String.fromCharCode(10)).slice(0, 4).join(' | '))
			continue
		}
		check(`${name}: the settings carry no credit card, credits are in the manifest`, !textOf(view.tree).includes('Ported by'))
		check(`${name}: the settings end with the debugging section`, !!buttonOf(view, 'Copy logs') && !!buttonOf(view, 'Run self-check'))

		// --- Copy logs
		copied.length = 0
		await buttonOf(view, 'Copy logs').props.onPress()
		await view.settle()
		const report = copied.at(-1) ?? ''
		check(`${name}: Copy logs puts a report on the clipboard`, report.length > 200, report.slice(0, 200))
		check(`${name}: the report names the plugin and its version`, report.includes(manifest.id) && report.includes(manifest.version.nums.join('.')))
		check(`${name}: the report credits kmmiio99o and the porter`, report.includes('Original plugin by kmmiio99o') && report.includes('Ported to Valenced by MarkLong0467'))
		check(`${name}: the report has the environment, checks and events`, ['ENVIRONMENT', 'CHECKS', 'EVENTS'].every(h => report.includes(h)))
		check(`${name}: the report says which Discord this is`, report.includes('Discord: 354.5 (build 354205, stable)'), report.split('\n').slice(5, 9))
		check(`${name}: the report has no secret from the settings`, !report.includes(SECRET), report.split('\n').filter(l => l.includes(SECRET)))
		const toastTexts = runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
		check(`${name}: copying says so`, toastTexts.some(t => /copied/i.test(String(t))), toastTexts)

		// --- Self-check and clearing
		await buttonOf(view, 'Run self-check').props.onPress()
		await view.settle()
		check(`${name}: the self-check lists results`, !!findNode(view.tree, n => n.type === 'Design.TableRowGroup' && n.props.title === 'Self-check'))
		check(`${name}: the self-check says the plugin started`, !!findNode(view.tree, n => n.type === 'Design.TableRow' && /Plugin started/.test(String(n.props.label))))
		const clear = findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Clear events')
		check(`${name}: events can be cleared`, !!clear)
		if (clear) {
			clear.props.onPress()
			await view.settle()
			check(`${name}: clearing empties the list`, !!findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Nothing noted yet'))
		}
		view.unmount()

		// --- Stopping
		let stopError = null
		try {
			await running.definition.stop?.call(running.plugin, { ...running.api, plugin: running.plugin })
			for (const cleanup of [...running.cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
		} catch (error) {
			stopError = error
		}
		check(`${name}: stopping does not throw`, stopError === null, stopError)
	}

	done()
})()
