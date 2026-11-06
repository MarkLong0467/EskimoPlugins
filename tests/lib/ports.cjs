'use strict'

/**
 * Starts a plugin against a fake Discord for the tests of the PalmDevs ports.
 *
 * The patcher is the strict one (see `strict.cjs`), so a hook that forgets to return fails the test.
 */

const fs = require('node:fs')
const path = require('node:path')
const { createRuntime, loadPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./harness.cjs')
const { useStrictPatcher } = require('./strict.cjs')

/** Merges `source` into `target`, going into plain objects. */
function merge(target, source) {
	for (const [key, value] of Object.entries(source ?? {})) {
		if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') merge(target[key], value)
		else target[key] = value
	}
	return target
}

/**
 * Starts the plugin `name`.
 *
 * @param {string} name The folder under `plugins/`.
 * @param {object} [options]
 * @param {object} [options.saved] What the plugin has saved from an earlier session.
 * @param {object} [options.stores] Fake Flux stores by name.
 * @param {object} [options.overrides] More of the fake `valenced` global (see `createRuntime`).
 * @param {(runtime: object) => void} [options.before] Runs before the plugin starts, to load modules and so on.
 */
async function startPort(name, { saved = {}, stores = {}, overrides = {}, before, version = [1, 0, 0] } = {}) {
	const copied = []
	const runtime = createRuntime({
		stores,
		overrides: merge(
			{
				externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text) } } },
				discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } } },
			},
			overrides,
		),
	}).install()
	const violations = useStrictPatcher(runtime)
	if (before) before(runtime)

	const { definition } = loadPlugin(name)
	const storage = runtime.makeStorage({ ...saved })
	const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', name, 'manifest.json'), 'utf8'))
	const cleanups = []
	const errors = []
	const plugin = { manifest: { ...manifest, version: { nums: version } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
	const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin, unscoped: runtime.valenced }
	plugin.api = api
	await definition.start.call(plugin, { ...api, plugin })
	// Modules that were loaded before the plugin started are reported to it on the next tick.
	await sleep(5)

	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const stop = () => {
		for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
	}
	const mountSettings = async () => {
		const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api }))
		await view.settle()
		return view
	}
	/** Mounts a component that calls `render()` as part of its own render, so hooks in it work. */
	const mountRender = async render => {
		const view = runtime.mount(
			runtime.React.createElement(function Host() {
				return render()
			}, {}),
		)
		await view.settle()
		return view
	}
	const opened = key => runtime.log.actions.filter(a => a.label === 'actionSheet' && a.name === 'openLazy' && a.args[1] === key)
	const mountSheet = async key => {
		const call = opened(key).at(-1)
		const Component = (await call.args[0]).default
		const view = runtime.mount(runtime.React.createElement(Component, {}))
		await view.settle()
		return view
	}
	return { runtime, definition, storage, api, errors, violations, copied, toasts, stop, mountSettings, mountRender, opened, mountSheet, plugin }
}

/** A button of a mounted tree by its text. */
const button = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)

/** Whether the screen shows credits. They belong in the manifest and the README, not on a settings screen. */
const hasCredits = text => /PalmDevs|Palm\b|kmmiio|Made by|MarkLong0467/.test(text)

module.exports = { startPort, button, hasCredits, findNode, findNodes, textOf, sleep, ROOT }
