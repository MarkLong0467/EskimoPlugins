'use strict'

/** Tests for Better Command Popout. Run with: node tests/better-command-popout.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Better Command Popout')

const TAG = 'ExecutedCommandPopout-test'
const COMMAND = { id: '1234567890', name: 'ping', description: 'Pings' }

/**
 * Fakes of Discord's pieces: a sheet that draws a `CommandActionsContainer`, which draws a list of rows the way Discord does
 * (each row wrapped in a fragment, the list an array in the tree).
 */
function fakes(s, { command = COMMAND, container = true, rows = true } = {}) {
	const { createElement } = s.runtime.React
	function CommandActionsContainer(props) {
		const list = rows ? [createElement('Fragment', { key: 'a' }, createElement('TableRow', { label: 'Use Command' }))] : []
		return createElement('View', {}, list)
	}
	function Sheet() {
		return createElement('Sheet', {}, container ? createElement(CommandActionsContainer, { data: command }) : createElement('Other', {}))
	}
	return { Sheet, CommandActionsContainer }
}

/** Opens a sheet the way Discord does and renders it. */
async function openAndMount(s, f, tag = TAG) {
	const creators = s.runtime.valenced.discord.actions.ActionSheetActionCreators
	creators.openLazy(Promise.resolve({ default: f.Sheet }), tag, {})
	await sleep(5)
	return s.mountSheet(tag)
}

/** The rows of a mounted popout, by label. */
const rowsOf = view => findNodes(view.tree, n => n.type === 'Design.ActionSheetRow')

;(async () => {
	// --- The rows are added
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s)
		const view = await openAndMount(s, f)
		const rows = rowsOf(view)
		check('two rows are added', rows.length === 2, rows.map(r => r.props.label))
		check('the mention row is first', rows[0]?.props.label === 'Copy Command Mention')
		check('the ID row is second', rows[1]?.props.label === 'Copy Command ID')
		check('Discord’s own row is still there after them', !!findNodes(view.tree, n => n.props?.label === 'Use Command').length)
		const order = findNodes(view.tree, n => n.type === 'Design.ActionSheetRow' || n.props?.label === 'Use Command').map(n => n.props.label)
		check('the new rows come before Discord’s rows', order[0] === 'Copy Command Mention' && order[2] === 'Use Command', order)

		rows[0].props.onPress()
		check('the mention is </name:id>', s.copied.at(-1) === '</ping:1234567890>', s.copied)
		check('a toast says the mention was copied', s.toasts().at(-1) === 'Copied command mention to clipboard', s.toasts())
		rows[1].props.onPress()
		check('the ID is copied as it is', s.copied.at(-1) === '1234567890', s.copied)
		check('a toast says the ID was copied', s.toasts().at(-1) === 'Copied command ID to clipboard', s.toasts())

		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- A redraw does not add the rows again
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s)
		const view = await openAndMount(s, f)
		await view.settle()
		check('after drawing, still two rows', rowsOf(view).length === 2)
		const again = await openAndMount(s, f)
		check('opening the same sheet again gives two rows, not four', rowsOf(again).length === 2, rowsOf(again).length)
		s.stop()
	}

	// --- Other sheets are left alone
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s)
		const view = await openAndMount(s, f, 'SomeOtherSheet')
		check('another sheet gets no rows', rowsOf(view).length === 0)
		const creators = s.runtime.valenced.discord.actions.ActionSheetActionCreators
		creators.openLazy(Promise.resolve({ default: f.Sheet }), 'CommandSomething', {})
		await sleep(10)
		check('a similar tag is noted for the report', /CommandSomething/.test(await reportOf(s)))
		s.stop()
	}

	// --- Things Discord changed: nothing crashes, the report says what was missing
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s, { container: false })
		const view = await openAndMount(s, f)
		await sleep(10)
		check('without the container the sheet still draws', !!view.tree)
		check('and no rows are added', rowsOf(view).length === 0)
		const report = await reportOf(s)
		check('the report says the container was not found and lists what was drawn', /CommandActionsContainer was not found.*Sheet/.test(report), report.slice(-600))
		s.stop()
		check('no error was thrown to Valenced', s.errors.length === 0, s.errors)
	}
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s, { rows: false })
		const view = await openAndMount(s, f)
		await sleep(10)
		check('without the list of rows nothing is added', rowsOf(view).length === 0)
		check('the report says the list was not found', /list of rows was not found/.test(await reportOf(s)))
		s.stop()
	}
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s, { command: null })
		const view = await openAndMount(s, f)
		await sleep(10)
		check('without a command nothing is added', rowsOf(view).length === 0)
		check('the report says the container had no command', /no command to copy/.test(await reportOf(s)))
		s.stop()
	}
	{
		const s = await startPort('better-command-popout')
		const creators = s.runtime.valenced.discord.actions.ActionSheetActionCreators
		creators.openLazy(Promise.resolve({ default: { not: 'a component' } }), TAG, {})
		await sleep(10)
		const call = s.opened(TAG).at(-1)
		const module = await call.args[0]
		check('a sheet that is not a function is passed on untouched', typeof module.default === 'object')
		check('and the report says so', /not a plain component/.test(await reportOf(s)))
		s.stop()
	}

	// --- The report never holds the command's name or id
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s)
		const view = await openAndMount(s, f)
		rowsOf(view)[0].props.onPress()
		await sleep(10)
		const report = await reportOf(s)
		check('the report counts the copy', /copied 1/.test(report), report.slice(-700))
		check('the report has no command name or id', !report.includes('1234567890') && !/\bping\b/.test(report))
		s.stop()
	}

	// --- Stopping removes the hook
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s)
		s.stop()
		const view = await openAndMount(s, f)
		check('after the plugin stops, no rows are added', rowsOf(view).length === 0)
	}

	// --- Settings
	{
		const s = await startPort('better-command-popout')
		let view = await s.mountSettings()
		let text = textOf(view.tree)
		check('settings explain the plugin', /copies the command’s mention/.test(text) || /copies the command/i.test(text), text.slice(0, 200))
		check('before any popout the status is Ready', /Ready/.test(text))
		check('settings show the two rows', /Copy Command Mention/.test(text) && /Copy Command ID/.test(text))
		check('settings have the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check') && !hasCredits(text), text.slice(-300))

		const f = fakes(s)
		await openAndMount(s, f)
		await sleep(10)
		view = await s.mountSettings()
		text = textOf(view.tree)
		check('after a popout the status is Working', /Working/.test(text), text.slice(0, 400))
		check('and the steps show ticks', (text.match(/✓/g) || []).length >= 4, text)

		button(view, 'Copy logs').props.onPress()
		check('Copy logs puts the report on the clipboard', /Better Command Popout debug report/.test(s.copied.at(-1) ?? ''), s.copied.at(-1))
		check('the report has the credit for the original author', /aliernfrog/.test(s.copied.at(-1) ?? ''))

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		check('Run self-check lists the checks', /CommandActionsContainer was found/.test(textOf(view.tree)))
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}
	{
		const s = await startPort('better-command-popout')
		const f = fakes(s, { container: false })
		await openAndMount(s, f)
		await sleep(10)
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('when the container is missing, settings say something is not working', /Something is not working/.test(text) && /✗/.test(text), text.slice(0, 500))
		s.stop()
	}

	/** The text the Copy logs button would copy. */
	async function reportOf(s) {
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		return s.copied.at(-1) ?? ''
	}

	done()
})()
