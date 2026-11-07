'use strict'

/** Tests for Hide Slash Apps. Run with: node tests/hide-slash-apps.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Hide Slash Apps')

const SHEET = 'MARKLONG_HIDE_SLASH_APPS'
const MEE6 = '1111111111111111'
const GIPHY = '2222222222222222'
const NITRO = '3333333333333333'

const app = (id, name, extra) => ({ id, name, type: 1, icon: `icon${id.slice(0, 2)}`, ...extra })
const BUILT_IN = { id: '-1', name: 'Built-In', type: 0 }
const command = (applicationId, name) => ({ id: `${applicationId}:${name}`, applicationId, displayName: name })

/** A fake of Discord's module with the `/` menu's hooks. Each call gives back the same result, like Discord's memoized hooks. */
function fakeApi() {
	const sections = [BUILT_IN, app(MEE6, 'MEE6'), app(GIPHY, 'Giphy'), app(NITRO, 'Nitro Bot')]
	const rank = command(MEE6, 'rank')
	const gif = command(GIPHY, 'gif')
	const boost = command(NITRO, 'boost')
	const discovery = {
		loading: false,
		commands: [rank, gif, boost],
		activeSections: sections,
		commandsByActiveSection: [
			{ section: sections[1], data: [rank] },
			{ section: sections[2], data: [gif] },
			{ section: sections[3], data: [boost] },
		],
		sectionDescriptors: sections,
		filteredSectionId: null,
		placeholders: [],
		scrollDown() {},
		filterSection() {},
	}
	const query = { commands: [rank, gif, command('', 'placeholder')], sections: [sections[1], sections[2]], scrollDown() {} }
	const calls = { discovery: [], query: [] }
	return {
		sections,
		discovery,
		query,
		calls,
		useDiscovery: options => (calls.discovery.push(options), discovery),
		useQuery: (context, text, options) => (calls.query.push(context), query),
	}
}

/** Calls a hook inside a component, the only place a hook can run, and returns what it gave back. */
async function callHook(s, fn) {
	const box = {}
	const view = await s.mountRender(() => {
		box.result = fn()
		box.renders = (box.renders || 0) + 1
		return 'hook'
	})
	return { box, view }
}

const optionsFor = guildId => ({ context: { type: 'channel', channel: { id: 'c1', guild_id: guildId } }, filters: {}, options: {} })
const idsOf = list => list.map(item => item.id ?? item.section?.id)

/** Draws an element the way Discord does, through the JSX runtime. */
const draw = (s, type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)

/** Fake components with the names Discord's have. */
const rail = () => ({
	$$typeof: 'memo',
	type: function CategoryItem(props) {
		return { type: 'PressableOpacity', props: { onPress: () => props.handlePressCategory?.(props.index), children: 'icon' } }
	},
})
function ApplicationSectionHeader(props) {
	return { type: 'View', props: { children: props.section.name } }
}
function ApplicationCommandItem(props) {
	return { type: 'Row', props: { label: props.command.displayName } }
}

const startWith = (saved, api = fakeApi()) =>
	startPort('hide-slash-apps', { reactExtras: true,
		saved,
		stores: { GuildStore: { getGuild: id => (id === 'g1' ? { name: 'My Server' } : id === 'g2' ? { name: 'Other Server' } : undefined) } },
		reactExtras: true,
		before: runtime => runtime.valenced.modules.finders.loadModule(api),
	})

/** Opens the menu of an app by pressing and holding its rail picture, and mounts the sheet. */
async function holdRail(s, section, guildId) {
	const Rail = rail()
	const element = draw(s, Rail, { section, guildId, index: 1, active: false, handlePressCategory() {} })
	const view = await s.mountRender(() => element.type(element.props))
	findNode(view.tree, n => n.type === 'PressableOpacity').props.onLongPress()
	await sleep(5)
	return s.mountSheet(SHEET)
}

const pressRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label).props.onPress()

;(async () => {
	// --- Nothing hidden: Discord's results are left exactly as they are
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		const { box } = await callHook(s, () => s.runtime.valenced.modules.finders && require('node:assert') && api.useDiscovery(optionsFor('g1')))
		check('with nothing hidden useDiscovery gives back the very same result', box.result === api.discovery)
		const q = await callHook(s, () => api.useQuery({ channel: { guild_id: 'g1' }, type: 'channel' }, {}, {}))
		check('and useQuery too', q.box.result === api.query)
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}

	// --- Hiding everywhere, through the long press and the sheet
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		const sheet = await holdRail(s, api.sections[1], 'g1')
		const text = textOf(sheet.tree)
		check('the sheet names the app', text.includes('MEE6'))
		check('it offers hiding everywhere and in this server', !!findNode(sheet.tree, n => n.props?.label === 'Hide everywhere') && !!findNode(sheet.tree, n => n.props?.label === 'Hide in My Server'), text)
		check('it says it can be brought back in the settings', /settings/.test(text))
		check('the picture comes from the app’s icon', !!findNode(sheet.tree, n => n.type === 'Image' && /app-icons\/1111111111111111\/icon11/.test(n.props.source?.uri || '')))

		const listener = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		const before = listener.box.renders
		pressRow(sheet, 'Hide everywhere')
		await sleep(5)
		await listener.view.settle()
		check('the choice is saved', s.storage.cache.everywhere?.length === 1 && s.storage.cache.everywhere[0].id === MEE6 && s.storage.cache.everywhere[0].name === 'MEE6')
		check('a toast says so', s.toasts().some(t => /MEE6 is hidden everywhere/.test(t ?? '')), s.toasts())
		check('the sheet closes', s.runtime.log.actions.some(a => a.label === 'actionSheet' && a.name === 'hideActionSheet' && a.args[0] === SHEET))
		check('a menu that is already open draws again at once', listener.box.renders > before, [before, listener.box.renders])

		const r = listener.box.result
		check('the app is gone from the sections, the active sections and the lists under them', !idsOf(r.sectionDescriptors).includes(MEE6) && !idsOf(r.activeSections).includes(MEE6) && !idsOf(r.commandsByActiveSection).includes(MEE6), idsOf(r.sectionDescriptors))
		check('its commands are gone, the others stay', r.commands.map(c => c.displayName).join() === 'gif,boost', r.commands)
		check('the other apps and the built-in section stay', idsOf(r.sectionDescriptors).join() === `-1,${GIPHY},${NITRO}`)
		check('the other fields are passed on', r.loading === false && r.scrollDown === api.discovery.scrollDown && r.filterSection === api.discovery.filterSection)
		check('Discord’s own result is not changed', api.discovery.commands.length === 3 && api.discovery.sectionDescriptors.length === 4)

		const again = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('the same result gives the very same filtered copy, so Discord does not draw forever', again.box.result === r)
		const dm = await callHook(s, () => api.useDiscovery(optionsFor(undefined)))
		check('it is hidden in a DM too', !idsOf(dm.box.result.sectionDescriptors).includes(MEE6))
		const other = await callHook(s, () => api.useDiscovery(optionsFor('g2')))
		check('and in every other server', !idsOf(other.box.result.sectionDescriptors).includes(MEE6))

		const q = await callHook(s, () => api.useQuery({ channel: { guild_id: 'g1' }, type: 'channel' }, {}, {}))
		check('typing after / hides it too', q.box.result.commands.map(c => c.displayName).join() === 'gif,placeholder' && idsOf(q.box.result.sections).join() === GIPHY, q.box.result)
		check('a placeholder with no app stays', q.box.result.commands.some(c => c.displayName === 'placeholder'))
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Hiding in one server only
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		const sheet = await holdRail(s, api.sections[2], 'g1')
		pressRow(sheet, 'Hide in My Server')
		await sleep(5)
		const saved = s.storage.cache.servers?.[0]
		check('the choice is saved with the server', s.storage.cache.servers?.length === 1 && saved.id === GIPHY && saved.guildId === 'g1' && saved.guildName === 'My Server' && !s.storage.cache.everywhere?.length, s.storage.cache)
		check('a toast names the server', s.toasts().some(t => /Giphy is hidden in My Server/.test(t ?? '')), s.toasts())
		const here = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		const elsewhere = await callHook(s, () => api.useDiscovery(optionsFor('g2')))
		const dm = await callHook(s, () => api.useDiscovery(optionsFor(undefined)))
		check('it is gone in that server', !idsOf(here.box.result.sectionDescriptors).includes(GIPHY))
		check('but stays in another server', elsewhere.box.result === api.discovery)
		check('and in a DM', dm.box.result === api.discovery)
		s.stop()
	}

	// --- In a DM there is no server to hide it in
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		const sheet = await holdRail(s, api.sections[1], undefined)
		check('a DM offers only hiding everywhere', !!findNode(sheet.tree, n => n.props?.label === 'Hide everywhere') && findNodes(sheet.tree, n => String(n.props?.label ?? '').startsWith('Hide in')).length === 0)
		check('and explains why', /not in a server/.test(textOf(sheet.tree)))
		s.stop()
	}

	// --- Hiding everywhere replaces the entries for single servers
	{
		const api = fakeApi()
		const s = await startWith({ servers: [{ id: MEE6, name: 'MEE6', at: 1, guildId: 'g1', guildName: 'My Server' }, { id: GIPHY, name: 'Giphy', at: 1, guildId: 'g1', guildName: 'My Server' }] }, api)
		const sheet = await holdRail(s, api.sections[1], 'g2')
		pressRow(sheet, 'Hide everywhere')
		await sleep(5)
		check('the server entry of that app is dropped, the others are kept', s.storage.cache.servers.map(e => e.id).join() === GIPHY && s.storage.cache.everywhere.length === 1, s.storage.cache)
		s.stop()
	}

	// --- Saved lists are used straight away
	{
		const api = fakeApi()
		const s = await startWith({ everywhere: [{ id: NITRO, name: 'Nitro Bot', at: 1 }] }, api)
		const { box } = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('an app hidden in an earlier session is hidden', !idsOf(box.result.sectionDescriptors).includes(NITRO))
		s.stop()
	}

	// --- The rail, the headers and the rows
	{
		const api = fakeApi()
		const s = await startWith({ everywhere: [{ id: GIPHY, name: 'Giphy', at: 1 }] }, api)
		const Rail = rail()
		const first = draw(s, Rail, { section: api.sections[1], guildId: 'g1', index: 1 })
		check('a rail picture gets a stand-in, always the same one', typeof first.type === 'function' && draw(s, Rail, { section: api.sections[3], guildId: 'g1', index: 2 }).type === first.type)
		const view = await s.mountRender(() => first.type(first.props))
		const pressable = findNode(view.tree, n => n.type === 'PressableOpacity')
		check('it keeps Discord’s picture and its press', typeof pressable.props.onPress === 'function' && pressable.props.children === 'icon')
		check('and has a long press', typeof pressable.props.onLongPress === 'function' && pressable.props.delayLongPress > 0)

		const hiddenRail = draw(s, Rail, { section: api.sections[2], guildId: 'g1', index: 2 })
		const hiddenView = await s.mountRender(() => hiddenRail.type(hiddenRail.props))
		check('a hidden app’s rail picture draws nothing (the second way of hiding)', findNode(hiddenView.tree, n => n.type === 'PressableOpacity') === null)

		const header = draw(s, ApplicationSectionHeader, { section: api.sections[1], guildId: 'g1' })
		const headerView = await s.mountRender(() => header.type(header.props))
		const wrapper = findNode(headerView.tree, n => n.type === 'Pressable')
		check('an app’s header is wrapped so it can be held', !!wrapper && typeof wrapper.props.onLongPress === 'function' && textOf(headerView.tree).includes('MEE6'))
		const builtInHeader = draw(s, ApplicationSectionHeader, { section: BUILT_IN, guildId: 'g1' })
		const builtInView = await s.mountRender(() => builtInHeader.type(builtInHeader.props))
		check('the built-in header is left alone', findNode(builtInView.tree, n => n.type === 'Pressable') === null)
		const hiddenHeader = draw(s, ApplicationSectionHeader, { section: api.sections[2], guildId: 'g1' })
		const hiddenHeaderView = await s.mountRender(() => hiddenHeader.type(hiddenHeader.props))
		check('a hidden app’s header draws nothing', !textOf(hiddenHeaderView.tree).includes('Giphy'))

		const shownRow = draw(s, ApplicationCommandItem, { command: command(MEE6, 'rank'), guildId: 'g1' })
		const hiddenRow = draw(s, ApplicationCommandItem, { command: command(GIPHY, 'gif'), guildId: 'g1' })
		const rowView = await s.mountRender(() => shownRow.type(shownRow.props))
		const hiddenRowView = await s.mountRender(() => hiddenRow.type(hiddenRow.props))
		check('a command row of a shown app is drawn', textOf(rowView.tree) !== undefined && findNode(rowView.tree, n => n.type === 'Row') !== null)
		check('a command row of a hidden app is not', findNode(hiddenRowView.tree, n => n.type === 'Row') === null)

		const other = () => ({ type: 'other' })
		check('other components are left alone', draw(s, other, {}).type === other)
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}

	// --- A long press that is not on an app
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		const Rail = rail()
		const element = draw(s, Rail, { section: BUILT_IN, guildId: 'g1', index: 0 })
		const view = await s.mountRender(() => element.type(element.props))
		const press = findNode(view.tree, n => n.type === 'PressableOpacity').props.onLongPress
		press()
		await sleep(5)
		check('holding the built-in picture opens nothing', s.opened(SHEET).length === 0)
		const settings = await s.mountSettings()
		button(settings, 'Copy logs').props.onPress()
		check('the report says what the press was on', /not an app/.test(s.copied.at(-1) ?? ''), s.copied.at(-1))
		s.stop()
	}

	// --- Things that go wrong
	{
		const api = fakeApi()
		api.discovery.commandsByActiveSection = null
		api.discovery.commands = undefined
		const s = await startWith({ everywhere: [{ id: MEE6, name: 'MEE6', at: 1 }] }, api)
		const { box } = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('a result with missing lists does not crash', !!box.result && !idsOf(box.result.sectionDescriptors).includes(MEE6))
		const q = await callHook(s, () => api.useQuery(undefined, {}, {}))
		check('a call with no context works and is still filtered', q.box.result.commands.map(c => c.displayName).join() === 'gif,placeholder', q.box.result)
		const nothing = await callHook(s, () => {
			api.discovery = null
			return null
		})
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
		s.stop()
	}
	{
		const s = await startPort('hide-slash-apps', { reactExtras: true })
		const settings = await s.mountSettings()
		check('before Discord’s module is found the plugin says to open the menu once', /Open the \/ menu in a chat once/.test(textOf(settings.tree)), textOf(settings.tree).slice(0, 300))
		s.stop()
	}

	// --- The module loads late, the first time the menu is opened
	{
		const api = fakeApi()
		const s = await startPort('hide-slash-apps', { reactExtras: true, saved: { everywhere: [{ id: MEE6, name: 'MEE6', at: 1 }] } })
		s.runtime.valenced.modules.finders.loadModule(api)
		await sleep(10)
		const { box } = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('a module Discord loads later is patched when it appears', !idsOf(box.result.sectionDescriptors).includes(MEE6))
		s.stop()
	}

	// --- Stopping puts everything back
	{
		const api = fakeApi()
		const s = await startWith({ everywhere: [{ id: MEE6, name: 'MEE6', at: 1 }] }, api)
		s.stop()
		const { box } = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('after the plugin stops Discord’s hook is back to normal', box.result === api.discovery)
	}

	// --- The settings
	{
		const api = fakeApi()
		const s = await startWith({}, api)
		let view = await s.mountSettings()
		let text = textOf(view.tree)
		check('settings explain the plugin and how to hide an app', /MEE6/.test(text) && /Press and hold/.test(text))
		check('nothing hidden shows an empty note', /Nothing is hidden yet/.test(text))
		check('with the menu hooked the status says Working', /Working/.test(text))
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check') && !hasCredits(text), text.slice(-200))

		await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		pressRow(await holdRail(s, api.sections[1], 'g1'), 'Hide everywhere')
		await sleep(5)
		pressRow(await holdRail(s, api.sections[2], 'g1'), 'Hide in My Server')
		await sleep(5)
		pressRow(await holdRail(s, api.sections[3], 'g2'), 'Hide in Other Server')
		await sleep(5)
		view = await s.mountSettings()
		text = textOf(view.tree)
		check('the status says Working once the menu was used', /Working/.test(text), text.slice(0, 300))
		check('the apps hidden everywhere are listed', /MEE6/.test(text) && /everywhere/.test(text))
		check('the apps hidden in one server are listed under its name', /MY SERVER/.test(text) && /Giphy/.test(text) && /OTHER SERVER/.test(text) && /Nitro Bot/.test(text), text)
		check('the count says 1 everywhere, 2 in single servers', /1 everywhere, 2 in single servers/.test(text))
		check('each has a Show again button', findNodes(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Show again').length === 3)

		findNodes(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Show again')[1].props.onPress()
		await sleep(5)
		check('Show again brings the app back in that server', s.storage.cache.servers.map(e => e.id).join() === NITRO && s.storage.cache.everywhere.length === 1, s.storage.cache)
		check('with a toast', s.toasts().some(t => /Giphy is back in this server/.test(t ?? '')), s.toasts())
		const { box } = await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		check('and it is in the menu again', idsOf(box.result.sectionDescriptors).includes(GIPHY))

		view = await s.mountSettings()
		const reset = findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === 'Show everything again')
		reset.props.onPress()
		await view.settle()
		check('showing everything again asks to tap again', !!findNode(view.tree, n => n.props?.label === 'Tap again to show everything') && s.storage.cache.everywhere.length === 1)
		findNode(view.tree, n => n.props?.label === 'Tap again to show everything').props.onPress()
		await sleep(5)
		check('and the second tap clears both lists', s.storage.cache.everywhere.length === 0 && s.storage.cache.servers.length === 0, s.storage.cache)

		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- The report
	{
		const api = fakeApi()
		const s = await startWith({ everywhere: [{ id: MEE6, name: 'MEE6', at: 1 }] }, api)
		await callHook(s, () => api.useDiscovery(optionsFor('g1')))
		await callHook(s, () => api.useQuery({ channel: { guild_id: 'g1' }, type: 'channel' }, {}, {}))
		await holdRail(s, api.sections[2], 'g1')
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('the report starts with the plugin and Discord versions', /Hide Slash Apps debug report/.test(report) && /Discord: 354\.5/.test(report), report.slice(0, 300))
		check('it says both hooks are patched and how often they ran', /useDiscovery \(the \/ menu\): patched; ran [1-9]/.test(report) && /useQuery \(typing after \/\): patched; ran [1-9]/.test(report), report)
		check('it counts what was removed', /Removed in all: [1-9]\d* app\(s\), [1-9]\d* command\(s\)/.test(report), report)
		check('it says the menu was opened by a long press', /Long presses heard: 1; sheets opened: 1/.test(report))
		check('it shows what Discord’s results look like, by field names', /useDiscovery result had: .*sectionDescriptors:array\(4\)/.test(report) && /An app section had: .*id:string/.test(report) && /A command had: .*applicationId:string/.test(report), report)
		check('the report has no app names, server names or ids', !/MEE6|Giphy|My Server/.test(report) && !report.includes(MEE6) && !report.includes(GIPHY), report)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check lists what was found', /Discord’s \/ menu module was found/.test(checks) && /The \/ menu is filtered/.test(checks))
		s.stop()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
