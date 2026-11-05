'use strict'

/**
 * Tests for Colorful Channels. Run with: node tests/colorful-channels.test.cjs
 * (build first: bun run build:dev colorful-channels, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const fs = require('node:fs')
const path = require('node:path')
const { createReporter, createRuntime, loadPlugin, startPlugin, sleep, findNode, findNodes, textOf, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('Colorful Channels')

/** The picture data the plugin ships, read from its source. The old and the new build must draw exactly these. */
const IMAGES = Object.fromEntries(
	[...fs.readFileSync(path.join(ROOT, 'plugins/colorful-channels/js/images.ts'), 'utf8').matchAll(/^\t(\w+):\s*'(data:image\/png;base64,[A-Za-z0-9+/=]+)',$/gm)].map(match => [match[1], match[2]]),
)

/** Asset ids and the names Discord registered them under (the names are what the plugin works from). */
const ASSETS = {
	1: 'TextLockIcon',
	2: 'ic_channel_text_locked',
	3: 'channel-text-lock',
	4: 'ChannelTextNsfwIcon',
	5: 'ic_channel_voice_lock',
	6: 'VoiceWarningIcon',
	7: 'ForumLockIcon',
	8: 'ForumWarningIcon',
	9: 'AnnouncementsLockIcon',
	10: 'news_warning',
	11: 'StageLockIcon',
	12: 'ImageLockIcon',
	13: 'media_lock',
	14: 'photo_lock',
	15: 'ImageWarningIcon',
	16: 'TextControllerIcon',
	17: 'channel_game',
	18: 'AnnouncementsWarningIcon',
	// Names that must be left alone:
	50: 'TextIcon',
	51: 'LockIcon',
	52: 'VoiceControllerIcon',
	53: 'StageWarningIcon',
	54: 'SomethingElse',
}

/** What each supported name should become: the base picture, the mark picture, and the mark's color token. */
const EXPECT = {
	1: ['textLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	2: ['textLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	3: ['textLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	4: ['textWarning', 'warning', 'STATUS_DANGER', '#f23f43'],
	5: ['voiceLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	6: ['voiceWarning', 'warning', 'STATUS_DANGER', '#f23f43'],
	7: ['forumLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	8: ['forumWarning', 'warning', 'STATUS_DANGER', '#f23f43'],
	9: ['announcementLock', 'lock', 'STATUS_WARNING', '#f0b232'],
	10: ['announcementWarning', 'warning', 'STATUS_DANGER', '#f23f43'],
	11: ['stageLock', 'lockBottom', 'STATUS_WARNING', '#f0b232'],
	12: ['imageLock', 'lockBottom', 'STATUS_WARNING', '#f0b232'],
	13: ['imageLock', 'lockBottom', 'STATUS_WARNING', '#f0b232'],
	14: ['imageLock', 'lockBottom', 'STATUS_WARNING', '#f0b232'],
	15: ['imageWarning', 'warningBottom', 'STATUS_DANGER', '#f23f43'],
	16: ['textController', 'controller', 'STATUS_POSITIVE', '#23a55a'],
	17: ['textController', 'controller', 'STATUS_POSITIVE', '#23a55a'],
	18: ['announcementWarning', 'warning', 'STATUS_DANGER', '#f23f43'],
}

/** Starts the plugin in a fake Discord with the asset registry, and lets Discord "load" the two modules it patches. */
async function setup({ saved, tokens, theme, internal } = {}) {
	const overrides = { assets: { AssetsRegistry: { getAssetByID: id => (ASSETS[id] ? { name: ASSETS[id] } : undefined) } } }
	if (tokens || internal) overrides.discord = { common: { tokens: { Tokens: { default: { ...(tokens ? { colors: tokens } : {}), ...(internal ? { internal } : {}) } } } } }
	const runtime = createRuntime({ overrides, stores: theme ? { ThemeStore: { theme } } : {} }).install()
	if (tokens) runtime.valenced.discord.common.tokens.Tokens.default.colors = tokens
	const { definition } = loadPlugin('colorful-channels')
	const storage = runtime.makeStorage(saved ?? {})
	const running = await startPlugin(definition, runtime, { storage })

	/** The icon module: `BaseChannelIcon` returns Discord's own element, which carries the tint color and style. */
	const icons = { BaseChannelIcon: props => ({ type: 'DiscordIcon', props: { color: 'interactive-normal', style: { margin: 2 }, source: props?.source } }) }
	const originalIcon = icons.BaseChannelIcon
	/** The module that draws a channel's name row. It is found by its name, `ChannelInfo`. */
	const channelInfo = { displayName: 'ChannelInfo', default: props => ({ type: 'ChannelRow', props: { channel: props.channel } }) }
	const originalInfo = channelInfo.default
	runtime.finders.loadModule(icons)
	runtime.finders.loadModule(channelInfo)
	await sleep(10)
	return { runtime, running, definition, storage, icons, channelInfo, originalIcon, originalInfo }
}

/** Draws an icon for an asset id and returns the pieces of what it drew. */
function draw(s, source, extra = {}) {
	const element = s.icons.BaseChannelIcon({ source, style: { opacity: 0.5 }, ...extra })
	const base = element?.props?.children?.[0]
	const overlayBox = element?.props?.children?.[1]
	return { element, base, overlay: overlayBox?.props?.children, overlayBox }
}

;(async () => {
	// --- Every supported icon becomes the plain symbol with a colored mark
	for (const id of Object.keys(EXPECT).map(Number)) {
		const s = await setup()
		const { base, overlay, overlayBox } = draw(s, id)
		const [baseName, overlayName, token, fallback] = EXPECT[id]
		const ok = base && base.props.source.uri === IMAGES[baseName] && overlay.props.source.uri === IMAGES[overlayName]
		check(`"${ASSETS[id]}" is drawn as ${baseName} with the ${overlayName} mark`, ok, base && [base.props.source.uri === IMAGES[baseName], overlay?.props.source.uri === IMAGES[overlayName]])
		if (!ok) continue
		check(`"${ASSETS[id]}": the mark is tinted with the theme color ${token}`, overlay.props.style.tintColor === `#${token}`, overlay.props.style)
		check(`"${ASSETS[id]}": the mark sits in the bottom right corner`, overlayBox.props.style.position === 'absolute' && overlayBox.props.style.right === 0 && overlayBox.props.style.bottom === 0)
	}

	// --- Size and style
	{
		const s = await setup()
		const { base, overlay } = draw(s, 1)
		check('the icon is drawn 18 by 18', base.props.style.width === 18 && base.props.style.height === 18 && overlay.props.style.width === 18)
		check('the icon keeps the style it was given, and the style of Discord\'s own element', base.props.style.opacity === 0.5 && base.props.style.margin === 2, base.props.style)
		check('the symbol keeps the tint of Discord\'s color (interactive-normal)', base.props.style.tintColor === '#INTERACTIVE_NORMAL', base.props.style)
		check('the mark has its own tint, not the symbol\'s', overlay.props.style.tintColor === '#STATUS_WARNING')
		check('the mark has the same size and style as the symbol', overlay.props.style.opacity === 0.5 && overlay.props.style.margin === 2)
	}

	// --- Colors
	{
		const s = await setup({ saved: { colorIconsFallback: true } })
		const lock = draw(s, 1).overlay.props.style.tintColor
		const warning = draw(s, 4).overlay.props.style.tintColor
		const controller = draw(s, 16).overlay.props.style.tintColor
		check('with fallback colors on, marks are yellow, red and green whatever the theme', lock === '#f0b232' && warning === '#f23f43' && controller === '#23a55a', [lock, warning, controller])
	}
	{
		const s = await setup({ tokens: {} })
		const { base, overlay } = draw(s, 1)
		check('when the theme color cannot be found, the fixed color is used', overlay.props.style.tintColor === '#f0b232', overlay.props.style)
		check('and a color Discord does not know does not tint the symbol', base.props.style.tintColor === undefined, base.props.style)
	}
	{
		const s = await setup({ theme: 'amoled', internal: { resolveSemanticColor: (theme, color) => `${theme}/${color}` } })
		const { base, overlay } = draw(s, 4)
		check('theme colors are resolved for the current theme when Discord can do that', overlay.props.style.tintColor === 'amoled/#STATUS_DANGER' && base.props.style.tintColor === 'amoled/#INTERACTIVE_NORMAL', [base.props.style.tintColor, overlay.props.style.tintColor])
	}
	{
		const s = await setup({ theme: 'dark', internal: { resolveSemanticColor: () => undefined } })
		check('if resolving gives nothing, the unresolved theme color is used', draw(s, 1).overlay.props.style.tintColor === '#STATUS_WARNING')
	}
	{
		const s = await setup({ internal: { resolveSemanticColor: () => 'never' } })
		check('without a theme in the store, resolving is skipped', draw(s, 1).overlay.props.style.tintColor === '#STATUS_WARNING')
	}

	// --- Icons that must not change
	for (const id of [50, 51, 52, 53, 54, 999]) {
		const s = await setup()
		const element = s.icons.BaseChannelIcon({ source: id })
		check(`${ASSETS[id] ? `"${ASSETS[id]}"` : `an unknown asset (${id})`} is left as Discord drew it`, element.type === 'DiscordIcon', element)
	}
	for (const [label, source] of [['an asset id', 1], ['a list holding the id', [1]], ['an object with `original`', { original: 1 }], ['an object with `default`', { default: 1 }]]) {
		const s = await setup()
		check(`the asset can be given as ${label}`, draw(s, source).base?.props.source.uri === IMAGES.textLock)
	}
	for (const [label, source] of [['a string', 'TextLockIcon'], ['nothing', undefined], ['a list with no id', []], ['an object with no id', { other: 1 }]]) {
		const s = await setup()
		check(`an asset given as ${label} is left alone`, s.icons.BaseChannelIcon({ source }).type === 'DiscordIcon')
	}

	// --- Settings that switch things off
	{
		const s = await setup({ saved: { colorIcons: false } })
		check('with colored icons off, icons are left as Discord drew them', s.icons.BaseChannelIcon({ source: 1 }).type === 'DiscordIcon')
	}
	{
		const s = await setup()
		check('with nothing saved, colored icons are on', draw(s, 1).base !== undefined)
	}
	{
		const s = await setup({ saved: { colorIcons: undefined, nsfwTag: undefined } })
		check('a setting that is saved as undefined falls back to its default (on)', draw(s, 1).base !== undefined)
	}

	// --- The NSFW tag
	for (const field of ['nsfw', 'nsfw_']) {
		const s = await setup()
		const element = s.channelInfo.default({ channel: { [field]: true } })
		const mounted = s.runtime.mount(element)
		await mounted.settle()
		const badge = findNode(mounted.tree, node => node.type === 'Text')
		check(`a channel with \`${field}\` set gets the NSFW tag in front of its name`, !!badge && textOf(mounted.tree).length >= 0 && mounted.tree.some(node => node.type === 'ChannelRow') && mounted.tree[0].type === 'View', mounted.tree.map(node => node.type))
		check(`the tag (${field}) is a red label that says NSFW`, badge && badge.children.join('') === 'NSFW' && mounted.tree[0].props.style.backgroundColor === '#f23f43', mounted.tree[0]?.props.style)
	}
	{
		const s = await setup()
		check('a channel that is not NSFW is drawn as Discord drew it', s.channelInfo.default({ channel: { nsfw: false } }).type === 'ChannelRow')
		check('so is a row with no channel', s.channelInfo.default({}).type === 'ChannelRow' && s.channelInfo.default({ channel: null }).type === 'ChannelRow')
	}
	{
		const s = await setup({ saved: { nsfwTag: false } })
		check('with the NSFW tag off, NSFW channels are drawn as Discord drew them', s.channelInfo.default({ channel: { nsfw: true } }).type === 'ChannelRow')
	}

	// --- Staying safe
	{
		const s = await setup()
		s.runtime.valenced.assets.AssetsRegistry.getAssetByID = () => {
			throw new Error('registry broke')
		}
		let result
		let threw = false
		try {
			result = s.icons.BaseChannelIcon({ source: 1 })
		} catch {
			threw = true
		}
		check('if drawing the colored icon fails, the icon is drawn as Discord drew it and nothing is thrown', !threw && result?.type === 'DiscordIcon')
	}
	{
		const s = await setup()
		const wrapper = { BaseChannelIcon: props => ({ type: 'DiscordIcon', props: { color: 42, source: props.source } }) }
		s.runtime.finders.loadModule(wrapper)
		await sleep(10)
		const icon = wrapper.BaseChannelIcon({ source: 1 })
		check("a tint color that is not text on Discord's element does not break the icon, and the symbol gets no tint", icon.type === 'View' && icon.props.children[0].props.style.tintColor === undefined, icon)
	}
	{
		const s = await setup()
		check('an icon with no props passed does not break', (() => { try { s.icons.BaseChannelIcon(); return true } catch { return false } })())
	}

	// --- Modules in other shapes
	{
		const runtime = createRuntime({ overrides: { assets: { AssetsRegistry: { getAssetByID: id => ({ name: ASSETS[id] }) } } } }).install()
		const { definition } = loadPlugin('colorful-channels')
		await startPlugin(definition, runtime, { storage: runtime.makeStorage({}) })
		const wrapped = { default: { BaseChannelIcon: props => ({ type: 'DiscordIcon', props: { source: props.source } }) } }
		runtime.finders.loadModule(wrapped)
		const notAFunction = { BaseChannelIcon: 'nope' }
		runtime.finders.loadModule(notAFunction)
		const infoWithoutFunction = Object.assign({}, { displayName: 'ChannelInfo', default: 'not a function' })
		runtime.finders.loadModule(infoWithoutFunction)
		await sleep(10)
		check('an icon component found on a module\'s default export is patched there', wrapped.default.BaseChannelIcon({ source: 1 }).type === 'View')
		check('a module whose BaseChannelIcon is not a function is left alone', notAFunction.BaseChannelIcon === 'nope' && infoWithoutFunction.default === 'not a function')
	}

	// --- The settings screen
	{
		const s = await setup()
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const switches = () => findNodes(view.tree, node => node.type === 'Design.TableSwitchRow')
		check('the screen has three switches in order', switches().map(row => row.props.label).join('|') === 'NSFW tag|Colored icon symbols|Fallback colors for icon symbols', switches().map(row => row.props.label))
		check('with nothing saved they show on, on, off', switches().map(row => row.props.value).join() === 'true,true,false')
		check('the screen says where the idea comes from and to open the chat list again', textOf(view.tree).includes('NexxUtils by nexpid') && textOf(view.tree).includes('Open the chat list again'))

		switches()[0].props.onValueChange(false)
		await sleep(5)
		await view.settle()
		check('turning a switch saves that setting', s.storage.cache.nsfwTag === false, s.storage.cache)
		check('and the switch shows the new value', switches()[0].props.value === false)
		check('the NSFW tag then stops appearing, without restarting the plugin', s.channelInfo.default({ channel: { nsfw: true } }).type === 'ChannelRow')

		switches()[2].props.onValueChange(true)
		await sleep(5)
		check('turning on fallback colors takes effect on the next icon', draw(s, 1).overlay.props.style.tintColor === '#f0b232')
		switches()[1].props.onValueChange(false)
		await sleep(5)
		check('turning off colored icons takes effect on the next icon', s.icons.BaseChannelIcon({ source: 1 }).type === 'DiscordIcon')
		check('the other settings are kept when one changes', s.storage.cache.nsfwTag === false && s.storage.cache.colorIconsFallback === true && s.storage.cache.colorIcons === false, s.storage.cache)
	}

	// --- Stopping
	{
		const s = await setup()
		await s.running.stop()
		check('stopping the plugin gives back Discord\'s own icon component', s.icons.BaseChannelIcon === s.originalIcon)
		check('and its own channel row', s.channelInfo.default === s.originalInfo)
		check('and leaves no module subscription behind', s.runtime.finders.activeSubscriptions() === 0)
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
