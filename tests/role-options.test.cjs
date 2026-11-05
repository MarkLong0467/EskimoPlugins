'use strict'

/**
 * Tests for Role Options. Run with: node tests/role-options.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Role Options')

const GUILD = '900000000000000001'
const ROLE_ID = '800000000000000001'
const ROLE = { id: ROLE_ID, name: 'Moderator', guild_id: GUILD, color: 0xff8800, icon: 'abc123' }

/** Builds a fake Discord with one server and one role, a recording clipboard, and the plugin running. */
async function setup({ role = ROLE, os = 'ios', withSetImage = true } = {}) {
	const runtime = createRuntime({
		stores: {
			GuildRoleStore: { getSortedRoles: () => [], getRole: (guild, id) => (guild === GUILD && id === role.id ? role : undefined) },
			SelectedGuildStore: { getGuildId: () => GUILD },
			GuildStore: { getGuilds: () => ({ [GUILD]: {} }) },
		},
	}).install()
	const { valenced } = runtime
	valenced.react.ReactNative.Platform.OS = os

	// A clipboard that records what is put on it.
	const clip = { strings: [], images: [] }
	const Clipboard = valenced.externals.ReactNativeClipboard.Clipboard
	Clipboard.setString = value => clip.strings.push(value)
	if (withSetImage) Clipboard.setImage = value => clip.images.push(value)

	const { definition } = loadPlugin('role-options')
	const running = await startPlugin(definition, runtime)
	await sleep(5)
	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	return { runtime, running, clip, toasts, jsx: valenced.react.ReactJSXRuntime, Clipboard }
}

/** Discord's own "Copy Role ID" item: when pressed it copies the id, like the real one does. */
const idItem = s => ({
	label: 'Copy Role ID',
	id: 'copy-id',
	key: 'k',
	onPress: () => s.Clipboard.setString(ROLE_ID),
})

;(async () => {
	// --- The menu as a list of items
	{
		const s = await setup()
		const menu = s.jsx.jsx('ActionSheet', { items: [{ label: 'Copy Link', onPress() {} }, idItem(s)] })
		const labels = menu.props.items.map(item => item.label)
		check(
			'the three options are added under Copy Role ID',
			JSON.stringify(labels) === JSON.stringify(['Copy Link', 'Copy Role ID', 'Copy Role Name', 'Copy Role Color', 'Copy Role Icon']),
			labels,
		)
		const copy = menu.props.items[2]
		check('the copies do not share the identity of Copy Role ID', copy.id === undefined && copy.key === undefined, copy)
		check('the first item stays as it was', menu.props.items[0].label === 'Copy Link')

		// A second draw of the same menu in the same moment is left alone.
		const again = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		check('a menu drawn again at once is not given the options twice', again.props.items.length === 1, again.props.items.length)

		// The options work.
		copy.onPress()
		await sleep(5)
		check('Copy Role Name copies the name', s.clip.strings.includes('Moderator'), s.clip.strings)
		check('the id capture put the real clipboard function back', s.Clipboard.setString !== undefined && !s.clip.strings.includes(ROLE_ID), s.clip.strings)
		check('a toast says what was copied', s.toasts().includes('Copied Moderator'), s.toasts())

		menu.props.items[3].onPress()
		await sleep(5)
		check('Copy Role Color copies the hex code', s.clip.strings.includes('#ff8800'), s.clip.strings)

	}

	// --- Waiting past the debounce lets another menu get the options
	{
		const s = await setup()
		s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		await sleep(450)
		const later = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		check('a menu drawn after the debounce is decorated', later.props.items.length === 4, later.props.items.length)
	}

	// --- Menus without Copy Role ID are not touched
	{
		const s = await setup()
		const other = { type: 'ActionSheet', props: { items: [{ label: 'Block', onPress() {} }] } }
		const out = s.jsx.jsx('ActionSheet', other.props)
		check('a menu without Copy Role ID is not changed', out.props.items.length === 1)
		const none = s.jsx.jsx('View', { children: 'text' })
		check('an element without lists is not changed', none.props.children === 'text')
		check('an element with no props at all does not break', s.jsx.jsx('View', null).props !== undefined)
	}

	// --- The menu as rows
	{
		const s = await setup()
		const rows = [
			{ type: 'Row', props: { label: 'Copy Link', onPress() {} } },
			{ type: 'Row', props: { label: 'Copy Role ID', onPress: () => s.Clipboard.setString(ROLE_ID) } },
		]
		const menu = s.jsx.jsxs('Sheet', { children: rows })
		const labels = menu.props.children.map(child => child.props.label)
		check(
			'rows are added under the Copy Role ID row',
			JSON.stringify(labels) === JSON.stringify(['Copy Link', 'Copy Role ID', 'Copy Role Name', 'Copy Role Color', 'Copy Role Icon']),
			labels,
		)
		menu.props.children[2].props.onPress()
		await sleep(5)
		check('a row option works', s.clip.strings.includes('Moderator'), s.clip.strings)
	}

	// --- A role that cannot be found, and roles without color or icon
	{
		const s = await setup({ role: { ...ROLE, id: 'other' } })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[1].onPress()
		await sleep(5)
		check('an unknown role gives a toast and copies nothing', s.toasts().includes('Could not find that role') && s.clip.strings.length === 0, s.toasts())
	}
	{
		const s = await setup({ role: { ...ROLE, color: 0, icon: null } })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[2].onPress()
		await sleep(5)
		check('a role without color says so', s.toasts().includes('That role has no color') && s.clip.strings.length === 0, s.toasts())
		menu.props.items[3].onPress()
		await sleep(5)
		check('a role without icon says so', s.toasts().includes('That role has no icon'), s.toasts())
	}

	// --- A gradient role
	{
		const s = await setup({ role: { ...ROLE, color: 0, colors: { primary_color: 0xff0000, secondary_color: 0x0000ff } } })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[2].onPress()
		await sleep(5)
		check('a gradient role copies all its colors', s.clip.strings.includes('#ff0000, #0000ff'), s.clip.strings)
	}

	// --- The icon
	{
		const s = await setup({ os: 'ios', withSetImage: false })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[3].onPress()
		await sleep(10)
		check('without a way to copy pictures the link is copied', s.clip.strings.some(v => v.includes('role-icons')), s.clip.strings)
	}
	{
		const s = await setup({ os: 'android' })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[3].onPress()
		await sleep(10)
		check(
			'on Android the icon link is copied',
			s.clip.strings.includes(`https://cdn.discordapp.com/role-icons/${ROLE_ID}/abc123.png?size=512`),
			s.clip.strings,
		)
	}
	{
		const s = await setup({ os: 'ios' })
		const realFetch = globalThis.fetch
		const realReader = globalThis.FileReader
		globalThis.fetch = async () => ({ ok: true, blob: async () => ({}) })
		globalThis.FileReader = class {
			readAsDataURL() {
				this.result = 'data:image/png;base64,QUJD'
				setImmediate(() => this.onloadend())
			}
		}
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[3].onPress()
		await sleep(20)
		globalThis.fetch = realFetch
		globalThis.FileReader = realReader
		check('on iOS the picture itself is copied', s.clip.images[0] === 'QUJD', s.clip.images)
		check('a toast says the icon was copied', s.toasts().includes('Copied the role icon'), s.toasts())
	}
	{
		const s = await setup({ os: 'ios' })
		const realFetch = globalThis.fetch
		globalThis.fetch = async () => ({ ok: false, status: 404 })
		const menu = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		menu.props.items[3].onPress()
		await sleep(20)
		globalThis.fetch = realFetch
		check('a failed download gives a toast', s.toasts().some(text => text?.startsWith('Could not copy')), s.toasts())
	}

	// --- Falling back to the role last seen
	{
		const s = await setup()
		s.jsx.jsx('RoleView', { roleId: ROLE_ID, guildId: GUILD })
		const noId = { label: 'Copy Role ID', onPress() {} }
		await sleep(450)
		const menu = s.jsx.jsx('ActionSheet', { items: [noId] })
		menu.props.items[1].onPress()
		await sleep(5)
		check('without an id from Discord the role last seen is used', s.clip.strings.includes('Moderator'), s.clip.strings)
	}

	// --- The role chip
	{
		const s = await setup()
		const chip = function ThemedRolePill(props) {
			return { type: 'Pill', props: { onPress() {}, children: [] }, role: props.role }
		}
		const module = { default: chip }
		s.runtime.finders.loadModule(module)
		await sleep(10)
		const drawn = module.default({ role: ROLE })
		check('holding a role chip is wired up', typeof drawn.props.onLongPress === 'function')
		drawn.props.onLongPress()
		check('holding a role chip copies the color', s.clip.strings.includes('#ff8800'), s.clip.strings)

		const noColor = module.default({ role: { ...ROLE, color: 0 } })
		check('a chip without a color is left alone', noColor.props.onLongPress === undefined)

		const dotModule = {
			default: function ThemedRolePill() {
				return {
					type: 'Pill',
					props: { onPress() {}, children: { type: 'Dot', props: { style: [{ backgroundColor: '#112233' }] } } },
				}
			},
		}
		s.runtime.finders.loadModule(dotModule)
		await sleep(10)
		dotModule.default({}).props.onLongPress()
		check('the color of a dot inside the chip is found', s.clip.strings.includes('#112233'), s.clip.strings)
	}
	{
		const s = await setup()
		const module = { default: function ThemedRolePill() { return { type: 'Pill', props: { children: [] } } } }
		s.runtime.finders.loadModule(module)
		await sleep(10)
		check('a chip that cannot be pressed is left alone', module.default({ role: ROLE }).props.onLongPress === undefined)
	}

	// --- Stopping
	{
		const s = await setup()
		await s.running.stop()
		const out = s.jsx.jsx('ActionSheet', { items: [idItem(s)] })
		check('after stopping, menus are no longer changed', out.props.items.length === 1, out.props.items.length)
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
