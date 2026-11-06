'use strict'

/** Tests for No Suggestions. Run with: node tests/no-suggestions.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('No Suggestions')

/** A fake Discord: the file that defines the section, the file that re-exports it and the clear function. */
function fake() {
	const cleared = []
	const originalA = props => ({ drew: 'A', props })
	const originalB = props => ({ drew: 'B', props })
	const categories = { SuggestedCategory: originalA, CategoryChannel: () => null }
	const items = { SuggestedCategory: originalB, other: 1 }
	const utils = { clearRecentChannels: (guildId, ids) => cleared.push([guildId, ids]) }
	return { cleared, originalA, originalB, categories, items, utils }
}

;(async () => {
	// --- The section is replaced everywhere Discord keeps it
	{
		const f = fake()
		const s = await startPort('no-suggestions', {
			before: runtime => {
				const { loadModule } = runtime.valenced.modules.finders
				loadModule(f.utils)
				loadModule(f.categories)
				loadModule({ default: f.items })
			},
		})
		check('the file that defines the section is patched', f.categories.SuggestedCategory !== f.originalA)
		check('the file that re-exports it is patched too (it was a default export)', f.items.SuggestedCategory !== f.originalB)

		check('with no suggestions it draws nothing', f.categories.SuggestedCategory({ guildId: 'g', channelIds: [] }) === null)
		check('with channelIds missing it draws nothing', f.categories.SuggestedCategory({ guildId: 'g', channelIds: null }) === null && f.items.SuggestedCategory({ guildId: 'g' }) === null)
		check('and asks Discord to clear nothing', f.cleared.length === 0, f.cleared)

		const drawn = f.categories.SuggestedCategory({ guildId: 'g1', channelIds: ['c1', 'c2'], withMarginTop: true })
		check('with suggestions it clears them', f.cleared.length === 1 && f.cleared[0][0] === 'g1' && f.cleared[0][1].join() === 'c1,c2', f.cleared)
		check('and draws the section with none in it', drawn.drew === 'A' && drawn.props.channelIds.length === 0 && drawn.props.withMarginTop === true && drawn.props.guildId === 'g1', drawn)

		const drawnB = f.items.SuggestedCategory({ guildId: 'g2', channelIds: ['c3'] })
		check('the re-exported copy works the same way', drawnB.drew === 'B' && drawnB.props.channelIds.length === 0 && f.cleared.length === 2 && f.cleared[1][0] === 'g2')

		// A module Discord loads after the plugin started.
		const late = { SuggestedCategory: props => ({ drew: 'late', props }) }
		const lateOriginal = late.SuggestedCategory
		s.runtime.valenced.modules.finders.loadModule(late)
		await sleep(10)
		check('a copy that Discord loads later is patched as well', late.SuggestedCategory !== lateOriginal && late.SuggestedCategory({ guildId: 'g', channelIds: [] }) === null)

		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)

		// --- The settings screen
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('the screen says it is working', text.includes('Working') && text.includes('being kept away'), text.slice(0, 300))
		check('it shows how often suggestions were cleared', /2 time\(s\) since Discord started, 3 channel\(s\) in all/.test(text), text)
		check('it has the debugging section', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		check('it has no credits on it', !hasCredits(text), text)

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const after = textOf(view.tree)
		check('the self-check says the section and the clear function were found', after.includes('The suggested channels section was found and patched') && after.includes('Discord’s "clear recent channels" was found'), after.slice(-500))

		button(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs puts a report on the clipboard', report.length > 200)
		check('the report names the plugin and credits PalmDevs and the porter', report.includes('marklong.no-suggestions 1.0.0') && report.includes('Original plugin by PalmDevs') && report.includes('Ported to Valenced by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report has the counts', /Suggested sections patched: 3/.test(report) && /Cleared: 2 time\(s\), 3 channel\(s\)/.test(report), report.split('\n').slice(6, 22))
		view.unmount()

		// --- Stopping
		s.stop()
		check('after stopping Discord’s own functions are back', f.categories.SuggestedCategory === f.originalA && f.items.SuggestedCategory === f.originalB)
		check('and the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Waiting for the section
	{
		const s = await startPort('no-suggestions')
		const view = await s.mountSettings()
		check('before a server is open the screen says it is waiting', textOf(view.tree).includes('Not patched yet') && textOf(view.tree).includes('Waiting for a server to open'))
		view.unmount()
		s.stop()
	}

	// --- A clear function that breaks does not stop the section
	{
		const f = fake()
		f.utils.clearRecentChannels = () => {
			throw new Error('boom')
		}
		const s = await startPort('no-suggestions', {
			before: runtime => {
				runtime.valenced.modules.finders.loadModule(f.utils)
				runtime.valenced.modules.finders.loadModule(f.categories)
			},
		})
		const drawn = f.categories.SuggestedCategory({ guildId: 'g', channelIds: ['c1'] })
		check('a clear function that throws still gives the section with none in it', drawn.drew === 'A' && drawn.props.channelIds.length === 0)
		s.stop()
	}

	// --- Without Discord's clear function nothing breaks
	{
		const f = fake()
		const s = await startPort('no-suggestions', {
			before: runtime => runtime.valenced.modules.finders.loadModule(f.categories),
		})
		const drawn = f.categories.SuggestedCategory({ guildId: 'g', channelIds: ['c1'] })
		check('without the clear function the section is still drawn empty', drawn.props.channelIds.length === 0)
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const failing = findNodes(view.tree, () => true).length > 0 && textOf(view.tree).includes('Discord’s "clear recent channels" was found')
		check('and the self-check lists the missing part', failing)
		view.unmount()
		s.stop()
	}

	done()
})()
