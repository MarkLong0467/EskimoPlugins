'use strict'

/** Tests for Force Timestamp Locale. Run with: node tests/force-timestamp-locale.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Force Timestamp Locale')

/** A fake moment library: a function with a locale that is shared by the whole app. */
function fakeMoment(original = 'en') {
	let current = original
	const moment = () => ({
		format: pattern => `${pattern}@${current}`,
		calendar: () => `calendar@${current}`,
		fromNow: () => `fromNow@${current}`,
		subtract() {
			return this
		},
	})
	moment.isMoment = () => false
	moment.locale = name => {
		if (name === undefined) return current
		current = name
		return name
	}
	moment.lang = moment.locale
	moment.locales = () => ['en', 'en-gb', 'fr', 'de', 'ja']
	return moment
}

/** The loaders of the locales, recording which were called. `bad` fails. */
function fakeLoaders() {
	const loaded = []
	const make = name => async () => {
		loaded.push(name)
	}
	const momentLocales = { fr: make('fr'), de: make('de'), ja: make('ja'), bad: async () => Promise.reject(new Error('no such file')) }
	return { loaded, momentLocales }
}

const rows = view => findNodes(view.tree, n => n.type === 'Design.TableRadioRow').map(n => n.props.label)

;(async () => {
	// --- The locale is locked and chosen
	{
		const moment = fakeMoment('en')
		const loaders = fakeLoaders()
		const s = await startPort('force-timestamp-locale', {
			saved: { locale: 'fr' },
			before: runtime => {
				runtime.valenced.modules.finders.loadModule(moment)
				runtime.valenced.modules.finders.loadModule({ momentLocales: loaders.momentLocales })
			},
		})
		await sleep(30)
		check('the saved locale is applied', moment.locale() === 'fr', moment.locale())
		check('every locale was loaded first', loaders.loaded.join() === 'fr,de,ja', loaders.loaded)

		const returned = moment.locale('es')
		check('Discord’s own attempt to change the locale is ignored', moment.locale() === 'fr' && returned === 'es', [moment.locale(), returned])
		moment.lang('ja')
		check('and so is the same through lang', moment.locale() === 'fr')
		check('reading the locale still works', moment.locale() === 'fr' && moment.lang() === 'fr')
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)

		// --- The settings screen
		let view = await s.mountSettings()
		let text = textOf(view.tree)
		check('the screen lists the locales as radio rows', rows(view).join() === 'en,en-gb,fr,de,ja', rows(view))
		check('it previews how dates look', text.includes('How it looks now') && text.includes('LLLL@fr') && text.includes('calendar@fr') && text.includes('fromNow@fr'), text.slice(0, 500))
		check('it says which locale is in use', text.includes('Locale: fr'))
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !hasCredits(text), text.slice(-300))

		const group = findNode(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the chosen locale is selected', group.props.defaultValue === 'fr')
		group.props.onChange('de')
		check('choosing a locale saves it', s.storage.cache.locale === 'de', s.storage.cache)
		view.unmount()
		view = await s.mountSettings()
		check('and it is applied at once', moment.locale() === 'de', moment.locale())
		check('the preview follows', textOf(view.tree).includes('LLLL@de'))

		// --- Searching
		const input = findNode(view.tree, n => n.type === 'Design.TextInput')
		input.props.onChange('ja')
		await view.settle()
		check('searching narrows the list', rows(view).join() === 'ja', rows(view))
		input.props.onChange('zzz')
		await view.settle()
		check('a search with no match lists nothing', rows(view).length === 0)
		input.props.onChange('')
		await view.settle()
		check('clearing it brings the list back', rows(view).length === 5)

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check finds the library, the list and the lock', checks.includes('The moment library was found') && checks.includes('The list of locales was found') && checks.includes('The locale is locked') && checks.includes('Every locale is loaded'), checks.slice(-700))

		button(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs names the plugin and credits PalmDevs and the porter', report.includes('marklong.force-timestamp-locale 1.0.0') && report.includes('Original plugin by PalmDevs') && report.includes('Ported to Valenced by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('it has the counts and the failed locale', /Locale before the plugin: en/.test(report) && /Locales loaded: 3, 1 failed/.test(report) && /Discord's own changes blocked: 2/.test(report), report.split('\n').slice(6, 16))
		view.unmount()

		// --- Stopping
		s.stop()
		check('after stopping the locale Discord had is back', moment.locale() === 'en', moment.locale())
		moment.locale('es')
		check('and Discord can change the locale again', moment.locale() === 'es')
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- The default locale
	{
		const moment = fakeMoment('en')
		const loaders = fakeLoaders()
		const s = await startPort('force-timestamp-locale', {
			before: runtime => {
				runtime.valenced.modules.finders.loadModule(moment)
				runtime.valenced.modules.finders.loadModule({ default: { momentLocales: loaders.momentLocales } })
			},
		})
		await sleep(30)
		check('with nothing saved the locale is en-gb', moment.locale() === 'en-gb', moment.locale())
		s.stop()
	}

	// --- The library comes later
	{
		const moment = fakeMoment('en')
		const s = await startPort('force-timestamp-locale', { saved: { locale: 'de' } })
		await sleep(10)
		check('before the library is loaded nothing is changed', moment.locale() === 'en')
		const view = await s.mountSettings()
		check('and the screen says there is nothing to pick yet', textOf(view.tree).includes('Discord’s date library was not found'))
		view.unmount()
		s.runtime.valenced.modules.finders.loadModule(moment)
		await sleep(30)
		check('when Discord loads it the locale is applied', moment.locale() === 'de', moment.locale())
		s.stop()
	}

	// --- Discord loads the list of locales late
	{
		const moment = fakeMoment('en')
		const loaders = fakeLoaders()
		const s = await startPort('force-timestamp-locale', {
			saved: { locale: 'de' },
			before: runtime => runtime.valenced.modules.finders.loadModule(moment),
		})
		await sleep(30)
		check('before the list of locales is loaded the chosen locale is applied anyway', moment.locale() === 'de' && loaders.loaded.length === 0, moment.locale())
		s.runtime.valenced.modules.finders.loadModule({ momentLocales: loaders.momentLocales })
		await sleep(30)
		check('when Discord loads the list, every locale is loaded', loaders.loaded.join() === 'fr,de,ja', loaders.loaded)
		check('and the chosen locale is applied again', moment.locale() === 'de')
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		check('the self-check says every locale is loaded', textOf(view.tree).includes('Every locale is loaded'))
		view.unmount()
		s.stop()
	}

	// --- The list of locales is missing
	{
		const moment = fakeMoment('en')
		const s = await startPort('force-timestamp-locale', {
			saved: { locale: 'fr' },
			before: runtime => runtime.valenced.modules.finders.loadModule(moment),
		})
		await sleep(30)
		check('without the list of locales the chosen one is still applied', moment.locale() === 'fr')
		s.stop()
	}

	done()
})()
