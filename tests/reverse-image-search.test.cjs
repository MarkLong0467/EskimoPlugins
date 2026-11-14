'use strict'

/** Tests for Reverse Image Search. Run with: node tests/reverse-image-search.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Reverse Image Search')

const ENGINES = {
	Google: 'https://lens.google.com/uploadbyurl?url=',
	Yandex: 'https://yandex.com/images/search?rpt=imageview&url=',
	SauceNAO: 'https://saucenao.com/search.php?url=',
	IQDB: 'https://iqdb.org/?url=',
	Bing: 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:',
	TinEye: 'https://www.tineye.com/search?url=',
	ImgOps: 'https://imgops.com/start?url=',
}
const PICTURE = 'https://cdn.discordapp.com/attachments/1/2/cat.png?ex=1&is=2'

;(async () => {
	function MagnifyingGlassIcon() {}
	function WindowLaunchIcon() {}
	function LinkIcon() {}
	function ReplyIcon() {}
	/** Discord's TableRow, with the Icon the harness's marker string does not have. */
	function TableRow(props) {
		return globalThis.valenced.react.React.createElement('Design.TableRow', props)
	}
	TableRow.Icon = 'TableRow.Icon'
	const shareModule = { useMediaShareActions: () => [{ label: 'Save', IconComponent: 1, action() {} }] }
	const s = await startPort('reverse-image-search', {
		reactExtras: true,
		overrides: { discord: { design: { Design: { TableRow } } } },
		before: runtime => {
			runtime.finders.loadModule({ MagnifyingGlassIcon })
			runtime.finders.loadModule({ WindowLaunchIcon })
			runtime.finders.loadModule(shareModule)
		},
	})
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
	const { React } = s.runtime
	const sheets = s.runtime.valenced.discord.actions.ActionSheetActionCreators

	// Discord's menu of a held message: boxes of rows, as LongPressMessageActionSheet draws them.
	const Icon = 'ActionSheetRow.Icon'
	const Row = 'ActionSheetRow'
	const Group = 'ActionSheetRow.Group'
	const row = (label, IconComponent) => React.createElement(Row, { label, onPress() {}, icon: React.createElement(Icon, { IconComponent }) })
	function MessageMenu() {
		return React.createElement('Provider', {}, React.createElement('Design.ActionSheet', {}, [
			React.createElement(Group, { hasIcons: true, key: 0 }, [row('Reply', ReplyIcon), row('Forward', ReplyIcon)]),
			React.createElement(Group, { hasIcons: true, key: 1 }, [row('Copy Text', ReplyIcon), row('Copy Media Link', LinkIcon)]),
			React.createElement(Group, { hasIcons: true, key: 2 }, [row('Delete Message', ReplyIcon)]),
		]))
	}
	const openMenu = selectedMedia => sheets.openLazy(Promise.resolve({ default: MessageMenu }), 'MessageLongPressActionSheet', { message: {}, selectedMedia })
	const drawMenu = async props => {
		const call = s.opened('MessageLongPressActionSheet').at(-1)
		const Component = (await call.args[0]).default
		return s.mountRender(() => React.createElement(Component, props))
	}
	const media = { sourceType: 'attachment', mediaType: 'image', mediaUrl: PICTURE }
	openMenu(media)
	const menu = await drawMenu({ selectedMedia: media })
	const groups = findNodes(menu.tree, n => n.type === Group)
	const search = findNode(menu.tree, n => n.props?.label === 'Search Image')
	check('holding a picture gives "Search Image" in the menu', !!search)
	check('it is at the end of the box with the link rows, as in Equicord ("copy-link")', groups.length === 3 && textOf(groups[1]).endsWith('Search Image') && !textOf(groups[0]).includes('Search Image'), groups.map(textOf))
	check('it looks like the menu\'s rows, with the search icon and an arrow', search?.type === Row && search.props.arrow === true && search.props.icon?.type === Icon && search.props.icon.props.IconComponent === MagnifyingGlassIcon, search?.props)

	// Choosing it opens the engines.
	search.props.onPress()
	await sleep(5)
	check('choosing it closes the menu and opens the engines', s.runtime.log.actions.some(a => a.name === 'hideAllActionSheets') && s.opened('ReverseImageSearch').length === 1)
	const sheet = await s.mountSheet('ReverseImageSearch')
	const rows = findNodes(sheet.tree, n => n.type === 'Design.TableRow')
	check('the engines are Equicord\'s, in its order, then All', rows.map(r => r.props.label).join() === [...Object.keys(ENGINES), 'All'].join(), rows.map(r => r.props.label))
	check('the sheet is titled "Search Image"', findNode(sheet.tree, n => n.type === 'Design.BottomSheetTitleHeader')?.props.title === 'Search Image')
	check('"All" has the open-outside icon', rows.at(-1).props.icon?.type === 'TableRow.Icon' && rows.at(-1).props.icon.props.IconComponent === WindowLaunchIcon, rows.at(-1).props.icon)
	const google = await s.mountRender(() => rows[0].props.icon)
	const favicon = findNode(google.tree, n => n.type === 'Image')
	check('each engine has its icon from DuckDuckGo, as in Equicord', favicon?.props.source.uri === 'https://icons.duckduckgo.com/ip3/lens.google.com.ico', favicon?.props)
	favicon.props.onError()
	await google.settle()
	check('an icon that cannot be loaded is replaced by the search icon', findNode(google.tree, n => n.type === 'TableRow.Icon')?.props.IconComponent === MagnifyingGlassIcon && !findNode(google.tree, n => n.type === 'Image'))

	globalThis.__opened = []
	rows[0].props.onPress()
	await sleep(5)
	check('an engine opens its search with the picture\'s address', globalThis.__opened.length === 1 && globalThis.__opened[0] === ENGINES.Google + encodeURIComponent(PICTURE), globalThis.__opened)
	globalThis.__opened = []
	rows[4].props.onPress()
	await sleep(5)
	check('Bing takes the address after "imgurl:"', globalThis.__opened[0] === `${ENGINES.Bing}${encodeURIComponent(PICTURE)}`, globalThis.__opened)
	globalThis.__opened = []
	rows.at(-1).props.onPress()
	await sleep(7 * 400 + 100)
	check('All opens every engine', globalThis.__opened.join('\n') === Object.values(ENGINES).map(e => e + encodeURIComponent(PICTURE)).join('\n'), globalThis.__opened)

	// Not a picture, or not the message menu.
	const before = s.opened('MessageLongPressActionSheet').length
	const video = { sourceType: 'attachment', mediaType: 'video', mediaUrl: 'https://cdn.discordapp.com/a.mp4' }
	const plain = Promise.resolve({ default: MessageMenu })
	sheets.openLazy(plain, 'MessageLongPressActionSheet', { message: {}, selectedMedia: video })
	check('a video\'s menu is opened as Discord opened it', s.opened('MessageLongPressActionSheet').length === before + 1 && s.opened('MessageLongPressActionSheet').at(-1).args[0] === plain)
	sheets.openLazy(plain, 'MessageLongPressActionSheet', { message: {}, selectedMedia: null })
	check('so is the menu of a message held outside a picture', s.opened('MessageLongPressActionSheet').at(-1).args[0] === plain)
	const other = Promise.resolve({ default: MessageMenu })
	sheets.openLazy(other, 'SomeOtherSheet', { selectedMedia: media })
	check('other sheets are left alone', s.opened('SomeOtherSheet').at(-1).args[0] === other)

	// A menu with no link rows gets a box of its own.
	function NoLinks() {
		return React.createElement('Design.ActionSheet', {}, [React.createElement(Group, { hasIcons: true, key: 0 }, [row('Reply', ReplyIcon), row('Forward', ReplyIcon)])])
	}
	sheets.openLazy(Promise.resolve({ default: NoLinks }), 'MessageLongPressActionSheet', { selectedMedia: media })
	const noLinks = await drawMenu({ selectedMedia: media })
	const own = findNodes(noLinks.tree, n => n.type === Group)
	check('with no link rows, it gets a box of its own at the end', own.length === 2 && textOf(own[1]) === 'Search Image' && !textOf(own[0]).includes('Search Image'), own.map(textOf))

	// A menu that throws is not hidden by the plugin.
	function Broken() {
		return 'plain text'
	}
	sheets.openLazy(Promise.resolve({ default: Broken }), 'MessageLongPressActionSheet', { selectedMedia: media })
	const broken = await drawMenu({ selectedMedia: media })
	check('a menu drawn some other way is drawn as it was', textOf(broken.tree).includes('plain text'))

	// The viewer's menu (Equicord's image menu).
	const source = { sourceURI: 'https://media.discordapp.net/attachments/1/2/cat.png', uri: 'x' }
	const items = shareModule.useMediaShareActions({ source })
	const item = items.at(-1)
	check('the viewer\'s menu gets "Search Image" at the end, with the search icon', items.length === 2 && item.label === 'Search Image' && item.IconComponent === MagnifyingGlassIcon, items)
	item.action()
	await sleep(5)
	const viewerSheet = await s.mountSheet('ReverseImageSearch')
	globalThis.__opened = []
	findNodes(viewerSheet.tree, n => n.type === 'Design.TableRow')[1].props.onPress()
	await sleep(5)
	check('it searches the picture on screen', globalThis.__opened[0] === ENGINES.Yandex + encodeURIComponent(source.sourceURI), globalThis.__opened)
	check('a video gets no "Search Image"', shareModule.useMediaShareActions({ source: { ...source, videoURI: 'https://a.mp4' } }).length === 1)

	// The settings screen.
	const view = await s.mountSettings()
	check('the settings say what the plugin does, in Equicord\'s words', textOf(view.tree).includes('Adds ImageSearch to image context menus'))

	s.stop()
	sheets.openLazy(plain, 'MessageLongPressActionSheet', { selectedMedia: media })
	check('after stopping, the menu is opened as Discord opened it', s.opened('MessageLongPressActionSheet').at(-1).args[0] === plain)
	check('and the viewer\'s menu is Discord\'s', shareModule.useMediaShareActions({ source }).length === 1)

	done()
})()
