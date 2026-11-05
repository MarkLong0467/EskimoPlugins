'use strict'

/**
 * Tests for Slowmode Extended. Run with: node tests/slowmode-extended.test.cjs
 * (build first: bun run build:dev slowmode-extended, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep, textOf } = require('./lib/harness.cjs')

const { check, done } = createReporter('Slowmode Extended')

const DISCORD_LIST = [0, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 21600]

/** Starts the plugin and lets Discord "load" a constants module. Returns what the tests need. */
async function setup(mod) {
	const runtime = createRuntime().install()
	const { definition } = loadPlugin('slowmode-extended')
	const running = await startPlugin(definition, runtime)
	if (mod) {
		runtime.finders.loadModule(mod)
		await sleep(10)
	}
	return { runtime, running, definition }
}

/** Renders the settings screen and returns all its text. */
async function settingsText(definition, runtime) {
	const view = runtime.mount(runtime.React.createElement(definition.SettingsComponent, { api: {} }))
	await view.settle()
	const text = textOf(view.tree)
	view.unmount()
	return text
}

;(async () => {
	// --- The list that is put in place
	{
		const holder = { SLOWMODE_VALUES: [...DISCORD_LIST] }
		await setup(holder)
		const list = holder.SLOWMODE_VALUES
		check('Discord\'s short list is replaced by a longer one', Array.isArray(list) && list.length > DISCORD_LIST.length, list.length)
		check('it has exactly 125 choices: 61 seconds-steps, 59 minute-steps, 5 hour-steps', list.length === 125, list.length)
		check('it starts at 0 (off) and ends at 6 hours (21600 seconds), the most Discord accepts', list[0] === 0 && list[list.length - 1] === 21600, [list[0], list[list.length - 1]])
		check('every second from 0 to 60 is there', Array.from({ length: 61 }, (_, second) => second).every(second => list.includes(second)))
		check('every minute from 2 minutes to 1 hour is there', Array.from({ length: 59 }, (_, index) => (index + 2) * 60).every(seconds => list.includes(seconds)))
		check('every hour from 2 to 6 hours is there', [7200, 10800, 14400, 18000, 21600].every(seconds => list.includes(seconds)))
		check('the list is in order with no duplicates', list.every((value, index) => index === 0 || value > list[index - 1]))
		check('and every value is a whole number within Discord\'s limit', list.every(value => Number.isInteger(value) && value >= 0 && value <= 21600))
		check('values between the steps are not offered (for example 61 seconds and 90 minutes)', !list.includes(61) && !list.includes(5400))
	}
	{
		const holder = { default: { SLOWMODE_VALUES: [...DISCORD_LIST] } }
		await setup(holder)
		check('a list found on the module\'s default export is replaced there', holder.default.SLOWMODE_VALUES.length === 125)
	}
	{
		const holder = { SLOWMODE_VALUES: [...DISCORD_LIST], default: { SLOWMODE_VALUES: [...DISCORD_LIST] } }
		await setup(holder)
		check('when both exist, the module\'s own list wins', holder.SLOWMODE_VALUES.length === 125 && holder.default.SLOWMODE_VALUES.length === DISCORD_LIST.length)
	}

	// --- Properties Discord may have locked
	{
		const holder = {}
		Object.defineProperty(holder, 'SLOWMODE_VALUES', { value: [...DISCORD_LIST], writable: false, configurable: true, enumerable: true })
		await setup(holder)
		check('a read-only list is replaced by defining the property again', holder.SLOWMODE_VALUES.length === 125)
	}
	{
		const original = Object.freeze([...DISCORD_LIST])
		const holder = Object.freeze({ SLOWMODE_VALUES: original })
		const { definition, runtime } = await setup(holder)
		check('a completely frozen holder is left alone', holder.SLOWMODE_VALUES === original)
		const text = await settingsText(definition, runtime)
		check('and the settings screen says it was not applied, with the reason in brackets', /Not applied \(.+\)/.test(text), text.slice(0, 160))
	}
	{
		const holder = { SLOWMODE_VALUES: undefined, default: {} }
		const { definition, runtime } = await setup(holder)
		const text = await settingsText(definition, runtime)
		check('a matching module with no list is reported', text.includes('a module matched, but it has no list'), text)
	}

	// --- Waiting for Discord
	{
		const { runtime, definition } = await setup(null)
		const before = await settingsText(definition, runtime)
		check('before Discord loads the module, the screen says it is not found yet', before.includes('not found yet') && before.includes('Not applied'), before)
		const holder = { SLOWMODE_VALUES: [...DISCORD_LIST] }
		runtime.finders.loadModule(holder)
		await sleep(10)
		check('a module that loads later is still replaced', holder.SLOWMODE_VALUES.length === 125)
		const after = await settingsText(definition, runtime)
		check('and the screen then shows it is in use', after.includes('In use: 125 choices, 0s to 6h') && after.includes('found (14 choices)'), after)
	}

	// --- Stopping puts Discord's list back
	{
		const holder = { SLOWMODE_VALUES: [...DISCORD_LIST] }
		const original = holder.SLOWMODE_VALUES
		const { running, runtime } = await setup(holder)
		await running.stop()
		check('stopping the plugin restores Discord\'s own list', holder.SLOWMODE_VALUES === original)
		check('and leaves no module subscription behind', runtime.finders.activeSubscriptions() === 0)
	}
	{
		const holder = {}
		const original = [...DISCORD_LIST]
		Object.defineProperty(holder, 'SLOWMODE_VALUES', { value: original, writable: false, configurable: true, enumerable: true })
		const { running } = await setup(holder)
		await running.stop()
		check('a list that had to be redefined is restored too', holder.SLOWMODE_VALUES === original)
	}

	// --- The settings screen
	{
		const holder = { SLOWMODE_VALUES: [...DISCORD_LIST] }
		const { definition, runtime } = await setup(holder)
		const text = await settingsText(definition, runtime)
		check('the settings screen lists every choice, from 0s to 6h', text.includes('0s, 1s, 2s') && text.includes('59s, 1m, 2m, 3m') && text.includes('59m, 1h, 2h, 3h, 4h, 5h, 6h'), text.slice(-200))
		check('and explains where to find the slider', text.includes('Channel settings > Slowmode') && text.includes('manage the channel'))
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
