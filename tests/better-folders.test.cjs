'use strict'

/** Tests for Better Folders. Run with: node tests/better-folders.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Better Folders')

const RED = 0xff0000
const DEFAULT_COLOR = 0x5865f2

/** Discord's folder: a memo of a function that draws a wrapper with a TransitionGroup whose items are the icon or the preview. */
function makeFolder() {
	const calls = []
	const component = {
		$$typeof: 'memo',
		type: function GuildsBarGuildFolder(props) {
			calls.push(props)
			const items = props.expanded
				? [{ type: 'icon', tintStyle: { tintColor: '#123456' } }]
				: [{ type: 'preview', guilds: ['g1', 'g2'], selectedGuildId: undefined }]
			const group = { type: 'TransitionGroup', props: { renderItem() {}, getItemKey() {}, items, wrapChildren() {} } }
			return { type: 'GuildsBarAnimatedItemWrapper', props: { id: String(props.id), expanded: props.expanded, children: group } }
		},
	}
	return { component, calls }
}

/** Discord's dispatcher and the store of open folders, which updates first like Discord's stores do. */
function makeFlux(folders, open) {
	const subscribers = []
	const dispatched = []
	const dispatcher = {
		subscribe: (type, fn) => subscribers.push({ type, fn }),
		unsubscribe: (type, fn) => {
			const i = subscribers.findIndex(s => s.type === type && s.fn === fn)
			if (i >= 0) subscribers.splice(i, 1)
		},
		dispatch(action) {
			dispatched.push(action)
			if (action.type === 'TOGGLE_GUILD_FOLDER_EXPAND') {
				if (open.has(action.folderId)) open.delete(action.folderId)
				else open.add(action.folderId)
			}
			for (const s of [...subscribers]) if (s.type === action.type) s.fn(action)
		},
	}
	return { dispatcher, dispatched, subscribers }
}

async function start({ saved = {}, folders, open = new Set(), colours = true, noStores = false } = {}) {
	const list = folders ?? [
		{ folderId: undefined, guildIds: ['solo'] },
		{ folderId: 1, folderName: 'Secret Club', guildIds: ['a', 'b'] },
		{ folderId: 2, folderName: 'Gaming', guildIds: ['c', 'd', 'e'] },
		{ folderId: 3, folderName: 'Work', guildIds: ['f'] },
	]
	const flux = makeFlux(list, open)
	const folder = makeFolder()
	const s = await startPort('better-folders', {
		saved,
		reactExtras: true,
		stores: noStores ? {} : { UserSettingsProtoStore: { getGuildFolders: () => list }, ExpandedGuildFolderStore: { isFolderExpanded: id => open.has(id) } },
		overrides: { discord: { common: { flux: { Dispatcher: flux.dispatcher } } } },
		before: runtime => {
			if (colours) runtime.valenced.modules.finders.loadModule({ normalizeFolderColor: c => (c == null ? DEFAULT_COLOR : c), DEFAULT_FOLDER_COLOR: DEFAULT_COLOR })
		},
	})
	return Object.assign(s, { flux, folder, open, list })
}

const draw = (s, type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)
const itemsOf = tree => findNode(tree, n => n.type === 'TransitionGroup')?.props.items

/** Draws a folder the way Discord does: through the JSX runtime, then renders what came out. */
async function folderView(s, props) {
	const element = draw(s, s.folder.component, props)
	const view = await s.mountRender(() => (typeof element.type === 'function' ? element.type(element.props) : element.type.type(element.props)))
	return view
}

const run = el => (typeof el.type === 'function' ? el.type(el.props) : el.type.type(el.props))
const switchRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)

;(async () => {
	// --- Hide icons
	{
		const s = await start()
		let view = await folderView(s, { id: 1, expanded: false, color: RED })
		check('with Hide icons off a collapsed folder shows the server pictures as Discord draws it', itemsOf(view.tree)?.[0]?.type === 'preview')
		s.stop()
	}
	{
		const s = await start({ saved: { hideIcons: true } })
		let view = await folderView(s, { id: 1, expanded: false, color: RED })
		let items = itemsOf(view.tree)
		check('with it on, a collapsed folder shows the folder icon instead', items.length === 1 && items[0].type === 'icon', items)
		check('in the folder’s colour', items[0].tintStyle.tintColor === '#ff0000', items[0])
		view = await folderView(s, { id: 1, expanded: false, color: 0x0000ff })
		check('a small colour is padded to six digits', itemsOf(view.tree)[0].tintStyle.tintColor === '#0000ff')
		view = await folderView(s, { id: 1, expanded: false, color: null })
		check('a folder with no colour gets the default one from Discord', itemsOf(view.tree)[0].tintStyle.tintColor === '#5865f2', itemsOf(view.tree))
		view = await folderView(s, { id: 1, expanded: true, color: RED })
		items = itemsOf(view.tree)
		check('an open folder is left as Discord draws it', items.length === 1 && items[0].tintStyle.tintColor === '#123456')
		const wrapper = findNode(view.tree, n => n.type === 'GuildsBarAnimatedItemWrapper')
		check('the rest of what Discord drew is kept', wrapper.props.id === '1' && wrapper.props.expanded === true)
		view = await folderView(s, { id: 1, expanded: false, color: RED })
		const group = findNode(view.tree, n => n.type === 'TransitionGroup')
		check('the other props of the group are kept', typeof group.props.renderItem === 'function' && typeof group.props.getItemKey === 'function' && typeof group.props.wrapChildren === 'function')
		check('Discord’s own component ran each time', s.folder.calls.length >= 5)
		check('every hook of the patch returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}
	{
		// Without Discord's colour module: the icon keeps its own tint when the folder has a colour, nothing when not
		const s = await start({ saved: { hideIcons: true }, colours: false })
		let view = await folderView(s, { id: 1, expanded: false, color: RED })
		check('without the colour module the colour is still used', itemsOf(view.tree)[0].tintStyle.tintColor === '#ff0000')
		view = await folderView(s, { id: 1, expanded: false, color: null })
		check('and no colour means no tint, not a crash', JSON.stringify(itemsOf(view.tree)[0].tintStyle) === '{}')
		s.stop()
	}
	{
		// Switching at once, in an open view: a folder and the settings are on screen together
		const s = await start({ saved: { hideIcons: false } })
		const folder = draw(s, s.folder.component, { id: 1, expanded: false, color: RED })
		const view = await s.mountRender(() => [
			typeof folder.type === 'function' ? s.runtime.React.createElement(folder.type, folder.props) : s.runtime.React.createElement(folder.type.type, folder.props),
			s.runtime.React.createElement(s.definition.SettingsComponent, { api: s.api }),
		])
		check('it starts as Discord draws it', itemsOf(view.tree)[0].type === 'preview')
		switchRow(view, 'Hide icons').props.onValueChange(true)
		await sleep(5)
		await view.settle()
		check('switching Hide icons on changes a folder that is already on screen', itemsOf(view.tree)[0].type === 'icon', itemsOf(view.tree))
		check('it is saved', s.storage.cache.hideIcons === true)
		check('with a toast', s.toasts().includes('Folder icons hidden'), s.toasts())
		switchRow(view, 'Hide icons').props.onValueChange(false)
		await sleep(5)
		await view.settle()
		check('and off puts the pictures back at once', itemsOf(view.tree)[0].type === 'preview' && s.toasts().includes('Folder icons are back'))
		s.stop()
	}
	{
		// Discord draws it differently: the folder is left alone and the report says so
		const s = await start({ saved: { hideIcons: true } })
		const odd = { $$typeof: 'memo', type: function GuildsBarGuildFolder() { return { type: 'Wrapper', props: { children: 'nothing here' } } } }
		const el = draw(s, odd, { id: 1, expanded: false })
		const view = await s.mountRender(() => run(el))
		check('a folder that is drawn in another shape is left alone', findNode(view.tree, n => n.type === 'Wrapper') !== null)
		const odd2 = { $$typeof: 'memo', type: function GuildsBarGuildFolder() { return { type: 'Wrapper', props: { children: { type: 'TransitionGroup', props: { entries: [] } } } } } }
		const el2 = draw(s, odd2, { id: 1, expanded: false })
		await s.mountRender(() => run(el2))
		const settings = await s.mountSettings()
		check('the status says Hide icons cannot swap the folders', /cannot swap/.test(textOf(settings.tree)))
		button(settings, 'Copy logs').props.onPress()
		check('the report counts it', /did not expect: [1-9]/.test(s.copied.at(-1) ?? ''), s.copied.at(-1))
		s.stop()
	}

	// --- Auto collapse
	{
		const s = await start({ saved: { autoCollapse: true }, open: new Set([1]) })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('opening a folder closes the other open one', !s.open.has(1) && s.open.has(2), [...s.open])
		check('by toggling it, like the original', s.flux.dispatched.some(a => a.folderId === 1))
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 3 })
		check('and again for the next', !s.open.has(2) && s.open.has(3))
		const before = s.flux.dispatched.length
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 3 })
		check('closing a folder does nothing else', s.flux.dispatched.length === before + 1 && s.open.size === 0)
		s.stop()
		check('stopping the plugin stops listening', s.flux.subscribers.length === 0)
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 1 })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('and then folders stay open as Discord has them', s.open.has(1) && s.open.has(2))
	}
	{
		const s = await start({ saved: { autoCollapse: true }, open: new Set([1, 3]) })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('with several open, all the others close', [...s.open].join() === '2', [...s.open])
		s.stop()
	}
	{
		const s = await start({ open: new Set([1]) })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('with Auto collapse off, nothing is closed', s.open.has(1) && s.open.has(2))
		const settings = await s.mountSettings()
		switchRow(settings, 'Auto collapse').props.onValueChange(true)
		await sleep(5)
		check('the switch is saved and a toast says so', s.storage.cache.autoCollapse === true && s.toasts().includes('Auto collapse is on'), s.toasts())
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 3 })
		check('and it works at once, without a restart', [...s.open].join() === '3', [...s.open])
		s.stop()
	}
	{
		// A server that is not in a folder is never toggled
		const s = await start({ saved: { autoCollapse: true }, open: new Set([1]), folders: [{ guildIds: ['x'] }, { folderId: 0, guildIds: [] }, { folderId: 1, guildIds: ['a'] }, { folderId: 2, guildIds: ['b'] }] })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('entries that are not folders are skipped', s.flux.dispatched.every(a => a.folderId === 1 || a.folderId === 2) && !s.open.has(1))
		s.stop()
	}
	{
		// Discord's stores cannot be read
		const s = await start({ saved: { autoCollapse: true }, noStores: true })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		check('without the stores it does nothing and does not crash', s.errors.length === 0)
		const settings = await s.mountSettings()
		check('the settings say the folder list cannot be read', /Not available/.test(textOf(settings.tree)))
		s.stop()
	}

	// --- Settings
	{
		const s = await start({ open: new Set([2]) })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		check('the settings explain it', /Hide icons/.test(text) && /Auto collapse/.test(text) && /plain folder icon/.test(text))
		check('both switches are there, off', switchRow(view, 'Hide icons')?.props.value === false && switchRow(view, 'Auto collapse')?.props.value === false)
		check('they say what they do, in the original’s words', /Don’t show server icons for collapsed folders/.test(switchRow(view, 'Hide icons').props.subLabel) && /Automatically collapse folders as you expand different ones/.test(switchRow(view, 'Auto collapse').props.subLabel))
		check('it counts your folders and the open ones (a server outside a folder is not one)', /3 folders/.test(text) && /1 open right now/.test(text), text)
		check('a first look says Ready', /Ready/.test(text))
		check('there are no credits on the screen', !hasCredits(text))
		check('it has the debugging section', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		s.stop()
	}

	// --- The report
	{
		const s = await start({ saved: { hideIcons: true, autoCollapse: true }, open: new Set([1]) })
		await folderView(s, { id: 1, expanded: false, color: RED })
		s.flux.dispatcher.dispatch({ type: 'TOGGLE_GUILD_FOLDER_EXPAND', folderId: 2 })
		const view = await s.mountSettings()
		check('once a folder was drawn the status says Working', /Working/.test(textOf(view.tree)))
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('the report starts with the plugin and Discord versions', /Better Folders debug report/.test(report) && /Discord: 354\.5/.test(report), report.slice(0, 300))
		check('it has the settings', /"hideIcons": true/.test(report) && /"autoCollapse": true/.test(report))
		check('it counts folders and open folders', /Folders in the server bar: 3; open now: 1/.test(report), report)
		check('it says a folder was drawn and how many pictures were swapped', /folder drawn by Discord: yes/.test(report) && /swapped for the folder icon: [1-9]/.test(report), report)
		check('it says the colour module was found', /Module that works out folder colours: found/.test(report))
		check('it says auto collapse is listening and what it did', /dispatcher listening; stores readable: yes; folder toggles seen: 2; other folders closed: 1/.test(report), report)
		check('it shows what Discord’s folder drew, by field names', /A folder drew: .*children:object/.test(report) && /Its items were: type:string, guilds:array\(2\), selectedGuildId:undefined/.test(report), report)
		check('it holds no folder name', !/Secret Club|Gaming|Work/.test(report))
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^[✓✗]/.test(n.props.label ?? '')).map(n => n.props.label)
		check('the self-check lists its steps and they pass', checks.length >= 6 && checks.every(c => c.startsWith('✓')), checks)
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}
	{
		const s = await startPort('better-folders', { reactExtras: true })
		const view = await s.mountSettings()
		check('with nothing found the status says to look at the server bar', /Look at the server bar/.test(textOf(view.tree)))
		button(view, 'Copy logs').props.onPress()
		check('and the report says not seen yet', /folder drawn by Discord: not yet/.test(s.copied.at(-1) ?? '') && /Discord’s folder stores could not be read/.test(s.copied.at(-1) ?? ''))
		s.stop()
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
