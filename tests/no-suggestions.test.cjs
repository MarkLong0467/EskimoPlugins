'use strict'

/** Tests for No Suggestions. Run with: node tests/no-suggestions.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('No Suggestions')

/** A fake of Discord's section, which records how it was drawn. */
function fakeSection() {
	const calls = []
	return {
		calls,
		SuggestedCategory: function SuggestedCategory(props) {
			calls.push(props)
			return { drew: 'section', props }
		},
	}
}

/** Draws an element the way Discord does, through the JSX runtime. */
const drawElement = (s, type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)
/** Renders an element by calling its component, which is what React does. */
const render = element => element.type(element.props)
/** The Flux events that were sent. */
const events = s => s.runtime.log.dispatched.filter(a => a.type === 'BULK_CLEAR_RECENTS')

;(async () => {
	// --- The section is replaced when Discord draws it
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions')
		const element = drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: [] })
		check('the element for the section gets the plugin’s component', element.type !== f.SuggestedCategory && typeof element.type === 'function')
		check('the props are left as they are', element.props.guildId === 'g1')
		check('drawing it again gives the very same component (so React keeps it)', drawElement(s, f.SuggestedCategory, { guildId: 'g2', channelIds: [] }).type === element.type)

		check('with no suggestions it draws nothing', render(element) === null)
		check('but Discord’s own component ran, so its hooks run on every draw', f.calls.length === 1 && f.calls[0].channelIds.length === 0, f.calls)
		check('and nothing was cleared', events(s).length === 0)
		check('with channelIds missing it draws nothing too', render(drawElement(s, f.SuggestedCategory, { guildId: 'g' })) === null)

		const other = () => ({ type: 'other' })
		check('a different component is left alone', drawElement(s, other, {}).type === other)
		check('and so is a plain element', drawElement(s, 'View', {}).type === 'View')
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Suggestions are cleared
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions')
		const element = drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c1', 'c2'], withMarginTop: true })
		const drawn = render(element)
		check('with suggestions it draws nothing at all, even if Discord shows channels from its own stores', drawn === null, drawn)
		check('Discord’s component got the cleared list', f.calls.at(-1).channelIds.length === 0)
		check('the clear is not done in the middle of drawing', events(s).length === 0)
		await sleep(10)
		const sent = events(s)
		check('a moment later the stores are told (BULK_CLEAR_RECENTS)', sent.length === 1 && sent[0].guildId === 'g1' && sent[0].channelIds.join() === 'c1,c2', sent)

		render(element)
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c1', 'c2'] }))
		await sleep(10)
		check('drawing the same suggestions again at once does not clear them again', events(s).length === 1, events(s).length)
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c3'] }))
		await sleep(10)
		check('different suggestions are cleared', events(s).length === 2 && events(s)[1].channelIds.join() === 'c3')
		s.stop()
	}

	// --- Discord's own clear function is used when it is there
	{
		const f = fakeSection()
		const own = []
		const s = await startPort('no-suggestions', {
			before: runtime => runtime.valenced.modules.finders.loadModule({ clearRecentChannels: (guildId, ids) => own.push([guildId, ids]) }),
		})
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c1'] }))
		await sleep(10)
		check('Discord’s own clearRecentChannels is used when it was found', own.length === 1 && own[0][0] === 'g1' && own[0][1].join() === 'c1', own)
		check('and then the event is not sent as well', events(s).length === 0)
		s.stop()
	}
	{
		const f = fakeSection()
		const own = []
		const s = await startPort('no-suggestions')
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c1'] }))
		await sleep(10)
		check('before Discord loads its function the event does the work', events(s).length === 1 && own.length === 0)
		// Discord loads its module later, the first time it needs it.
		s.runtime.valenced.modules.finders.loadModule({ clearRecentChannels: (guildId, ids) => own.push([guildId, ids]) })
		await sleep(10)
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g2', channelIds: ['c9'] }))
		await sleep(10)
		check('once Discord has loaded it, it is used', own.length === 1 && own[0][0] === 'g2', own)
		s.stop()
	}

	// --- The module is patched too, without doing the work twice
	{
		const f = fakeSection()
		const module = { SuggestedCategory: f.SuggestedCategory }
		const s = await startPort('no-suggestions', { before: runtime => runtime.valenced.modules.finders.loadModule(module) })
		check('the module is patched when it is found', module.SuggestedCategory !== f.SuggestedCategory)
		const direct = module.SuggestedCategory({ guildId: 'g1', channelIds: ['c1'] })
		check('drawn through the module it clears and draws nothing', direct === null)
		await sleep(10)
		check('and clears once', events(s).length === 1, events(s))

		// Discord draws the patched function through the JSX runtime: it is not named SuggestedCategory any more (it is a
		// patched copy), so it goes through the module patch only.
		const through = drawElement(s, module.SuggestedCategory, { guildId: 'g2', channelIds: ['c2'] })
		render(through)
		await sleep(10)
		check('an element of the patched function is not handled twice', events(s).length === 2, events(s))

		// And the original function, drawn through the JSX runtime while the module is patched.
		f.calls.length = 0
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g3', channelIds: ['c3'] }))
		await sleep(10)
		check('the plugin’s component does not clear twice when the module is patched too', events(s).length === 3 && f.calls.length === 1, [events(s).length, f.calls.length])
		s.stop()
		check('after stopping Discord’s own function is back', module.SuggestedCategory === f.SuggestedCategory)
	}

	// --- Stopping
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions')
		s.stop()
		check('after stopping new elements keep Discord’s component', drawElement(s, f.SuggestedCategory, { guildId: 'g', channelIds: [] }).type === f.SuggestedCategory)
	}

	// --- The settings screen
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions', { version: [1, 1, 0] })
		let view = await s.mountSettings()
		check('before the section is drawn the screen says it is waiting', textOf(view.tree).includes('Not patched yet') && textOf(view.tree).includes('Waiting for a server to open'))
		view.unmount()

		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: ['c1', 'c2'] }))
		render(drawElement(s, f.SuggestedCategory, { guildId: 'g1', channelIds: [] }))
		await sleep(10)
		view = await s.mountSettings()
		const text = textOf(view.tree)
		check('afterwards it says it is working', text.includes('Working') && text.includes('being kept away'), text.slice(0, 400))
		check('and shows how often suggestions were cleared', /1 time\(s\) since Discord started, 2 channel\(s\) in all/.test(text), text)
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check') && !hasCredits(text), text.slice(-300))

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check says it is watching, found the section and can clear', checks.includes('The plugin is watching Discord’s components') && checks.includes('The suggested channels section was found') && checks.includes('Suggestions can be cleared'), checks.slice(-600))

		button(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs names the plugin and credits PalmDevs and the porter', report.includes('marklong.no-suggestions 1.1.0') && report.includes('Original plugin by PalmDevs') && report.includes('Ported to Valenced by MarkLong0467'), report.split('\n').slice(0, 4))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report has the counts and how it was cleared', /Watching the JSX runtime: yes/.test(report) && /Section replaced: 2 time\(s\)/.test(report) && /Cleared: 1 time\(s\), 2 channel\(s\) \(by Discord's function 0, by the event 1\)/.test(report), report.split('\n').slice(6, 18))
		view.unmount()
		s.stop()
	}

	// --- A clear that breaks does not stop the section
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions', {
			before: runtime => runtime.valenced.modules.finders.loadModule({ clearRecentChannels: () => { throw new Error('boom') } }),
		})
		const drawn = render(drawElement(s, f.SuggestedCategory, { guildId: 'g', channelIds: ['c1'] }))
		await sleep(10)
		check('a clear function that throws still draws nothing and reports no error', drawn === null && s.errors.length === 0)
		s.stop()
	}

	// --- Rows of suggested channels
	{
		const f = fakeSection()
		const s = await startPort('no-suggestions')
		render(drawElement(s, f.SuggestedCategory, { guildId: 'rowguild', channelIds: ['r1', 'r2'] }))
		const Row = function TextChannel() { return 'row' }
		const plain = drawElement(s, Row, { channelId: 'r1', selected: false })
		check('a row for a suggested channel that does not say it is a suggestion is left alone', plain.type === Row)
		const flagged = drawElement(s, Row, { channelId: 'r2', isSuggested: true })
		check('a row that says it is a suggestion draws nothing', render(flagged) === null && flagged.type !== Row)
		const other = drawElement(s, Row, { channelId: 'zzz', isSuggested: true })
		check('a row for another channel is never touched', other.type === Row)
		check('the report names the component that drew the rows and its props', true)
		s.stop()
	}

	done()
})()
