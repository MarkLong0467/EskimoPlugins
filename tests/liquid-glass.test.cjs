'use strict'

/** Tests for Liquid Glass. Run with: node tests/liquid-glass.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, findNode, findNodes, textOf } = require('./lib/ports.cjs')

const { check, done } = createReporter('Liquid Glass')

;(async () => {
	const s = await startPort('liquid-glass')
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	const api = s.runtime.valenced.liquidGlass
	check('it offers the three exports of the original library', !!api && typeof api.LiquidGlassView === 'function' && typeof api.LiquidGlassContainerView === 'function' && api.isLiquidGlassSupported === false, api && Object.keys(api))
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)

	const render = element => s.mountRender(() => element)
	const { createElement } = s.runtime.React
	const style = view => findNode(view.tree, n => n.type === 'View')?.props.style
	const flat = st => Object.assign({}, ...[].concat(st ?? []).flat())

	let view = await render(createElement(api.LiquidGlassView, { style: { borderRadius: 12 } }, 'inside'))
	let st = flat(style(view))
	check('without native glass the regular effect draws a see-through frosted view', /^rgba\(255,255,255,/.test(st.backgroundColor) && st.borderWidth === 1, st)
	check('the caller’s style is kept and wins', st.borderRadius === 12)
	check('children are drawn', textOf(view.tree).includes('inside'))

	view = await render(createElement(api.LiquidGlassView, { effect: 'none', style: { padding: 4 } }))
	st = flat(style(view))
	check('the none effect adds nothing', st.backgroundColor === undefined && st.borderWidth === undefined && st.padding === 4, st)

	view = await render(createElement(api.LiquidGlassView, { tintColor: '#ff000066' }))
	check('tintColor is the fill', flat(style(view)).backgroundColor === '#ff000066')

	view = await render(createElement(api.LiquidGlassView, { effect: 'clear' }))
	const clear = flat(style(view)).backgroundColor
	view = await render(createElement(api.LiquidGlassView, { effect: 'regular' }))
	check('clear is fainter than regular', parseFloat(clear.split(',')[3]) < parseFloat(flat(style(view)).backgroundColor.split(',')[3]), clear)

	view = await render(createElement(api.LiquidGlassView, { interactive: true, animated: false, animationDuration: 300, colorScheme: 'light' }))
	const node = findNode(view.tree, n => n.type === 'View')
	check('the native-only props are not passed on to the View', node && node.props.interactive === undefined && node.props.animationDuration === undefined && node.props.colorScheme === undefined, node?.props)

	view = await render(createElement(api.LiquidGlassContainerView, { spacing: 8 }, 'merged'))
	check('the container is a plain View that takes spacing without passing it on', textOf(view.tree).includes('merged') && findNode(view.tree, n => n.type === 'View')?.props.spacing === undefined)

	view = await s.mountSettings()
	check('the settings explain this phone uses the frosted look', /cannot draw real liquid glass/.test(textOf(view.tree)))
	check('the settings list what was found, one line per part', /What it found/.test(textOf(view.tree)) && /cards/.test(textOf(view.tree)) === true || /Nothing yet/.test(textOf(view.tree)), textOf(view.tree).slice(-300))
	check('the settings preview the three effects', findNodes(view.tree, n => n.type === 'View').length >= 4)

	// --- Discord's components
	const jsx = (type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)
	const secondary = jsx('Design.Button', { variant: 'secondary', text: 'Search', style: { margin: 1 }, pillStyle: { opacity: 1 } })
	const frosted = flat(secondary.props.pillStyle)
	check('a secondary Discord button gets a glass rim (bright top, warm bottom) on its pill, and keeps its own pill style', frosted.borderWidth === 1 && /^rgba\(255,175,150,/.test(frosted.borderBottomColor) && /^rgba\(255,255,255,/.test(frosted.borderTopColor) && frosted.opacity === 1, secondary.props.pillStyle)
	check('the wrapper that has no corners is not touched, so the shape stays', JSON.stringify(secondary.props.style) === '{"margin":1}', secondary.props.style)
	check('a primary button is left alone', jsx('Design.Button', { variant: 'primary', text: 'Go' }).props.pillStyle === undefined)
	check('an icon button is framed the same way', flat(jsx('Design.IconButton', { variant: 'secondary' }).props.pillStyle).borderWidth === 1 && jsx('Design.IconButton', { variant: 'secondary' }).props.style === undefined)
	s.api.jsonStorage.set({ buttons: false })
	check('the switch turns the button frost off', jsx('Design.Button', { variant: 'secondary', text: 'Search' }).props.pillStyle === undefined)
	s.api.jsonStorage.set({ buttons: true })
	const cardFill = () => parseFloat(flat(jsx('Design.Card', { variant: 'secondary', children: 'x' }).props.style).backgroundColor.split(',')[3])
	s.api.jsonStorage.set({ strength: 'clear' })
	const clearFill = cardFill()
	s.api.jsonStorage.set({ strength: 'regular' })
	const regularFill = cardFill()
	s.api.jsonStorage.set({ strength: 'strong' })
	check('the clear strength is fainter than regular, and strong is stronger', clearFill < regularFill && regularFill < cardFill(), [clearFill, regularFill])
	s.api.jsonStorage.set({ strength: 'regular', tint: 'blue' })
	const tintedCard = flat(jsx('Design.Card', { variant: 'secondary', children: 'x' }).props.style)
	check('the tint colours the edge of a card, not its fill', tintedCard.borderColor.startsWith('rgba(130,165,255,') && tintedCard.backgroundColor.startsWith('rgba(255,255,255,'), tintedCard)
	s.api.jsonStorage.set({ tint: 'white' })

	// --- The other parts of Discord
	const card = jsx('Design.Card', { variant: 'secondary', children: 'x', style: { padding: 3 } })
	check('a card is frosted and keeps its own style', /^rgba\(255,255,255,0\.05\)/.test(flat(card.props.style).backgroundColor) && flat(card.props.style).padding === 3, card.props.style)
	check('a transparent card is left alone', jsx('Design.Card', { variant: 'transparent', children: 'x' }).props.style === undefined)
	check('a text input is frosted', !!flat(jsx('Design.TextInput', { label: 'a' }).props.style).backgroundColor)
	const sheet = jsx('Design.ActionSheet', { children: 'x', backgroundStyles: { margin: 2 } })
	check('a sheet gets a see-through background in its backgroundStyles', /^rgba\(28,29,36,/.test(flat(sheet.props.backgroundStyles).backgroundColor) && flat(sheet.props.backgroundStyles).margin === 2, sheet.props.backgroundStyles)
	const bottom = jsx('Design.BottomSheet', { children: 'x' })
	check('a bottom sheet (the message menu) is see-through too, and the fill lets the screen show through', parseFloat(flat(bottom.props.backgroundStyles).backgroundColor.split(',')[3]) < 0.75, bottom.props.backgroundStyles)
	const bar = jsx('Pressable', { testID: 'you_bar_profile_button', style: { flex: 1, borderRadius: 24 } })
	check('the profile bar gets a glass rim and keeps its corners', flat(bar.props.style).borderRadius === 24 && flat(bar.props.style).borderWidth === 1 && /^rgba\(255,175,150,/.test(flat(bar.props.style).borderBottomColor), bar.props.style)
	check('other pressables are left alone', jsx('Pressable', { testID: 'other', style: { flex: 1 } }).props.style.borderWidth === undefined)
	s.api.jsonStorage.set({ bar: false })
	check('the bar has its own switch', JSON.stringify(jsx('Pressable', { testID: 'you_bar_profile_button', style: { flex: 1 } }).props.style) === '{"flex":1}')
	s.api.jsonStorage.set({ bar: true })
	const menu = flat(jsx('Design.Menu', { children: 'x', style: { margin: 4 } }).props.style)
	check('a pop-up menu gets a see-through fill and an edge, and keeps its own style', /^rgba\(28,29,36,/.test(menu.backgroundColor) && menu.borderWidth === 1 && menu.margin === 4, menu)
	check('a card has an even edge, so stacked rows do not get lines of light', flat(card.props.style).borderTopColor === flat(card.props.style).borderColor)
	s.api.jsonStorage.set({ sheets: false, cards: false, fields: false })
	check('the switch for sheets also covers menus', jsx('Design.Menu', { children: 'x' }).props.style === undefined)
	check('each part has its own switch', jsx('Design.ActionSheet', { children: 'x' }).props.backgroundStyles === undefined && jsx('Design.Card', { variant: 'primary', children: 'x' }).props.style === undefined && jsx('Design.TextInput', {}).props.style === undefined)
	s.api.jsonStorage.set({ sheets: true, cards: true, fields: true })

	// --- The colour of sheets, changed at the source
	const sheetMarker = { token: 'sheet' }
	const textMarker = { token: 'text' }
	const fake = {
		colors: { MOBILE_ACTIONSHEET_BACKGROUND: sheetMarker, TEXT_DEFAULT: textMarker },
		SemanticColor: { BACKGROUND_BASE_LOW: { category: 'x' }, MOBILE_ACTIONSHEET_BACKGROUND: { category: 'x', dark: { raw: 'PRIMARY_800', opacity: 1 }, light: { raw: 'PRIMARY_100', opacity: 1 } } },
		internal: { resolveSemanticColor: (theme, marker) => (marker === sheetMarker ? '#232428' : '#ffffff') },
	}
	const t = await startPort('liquid-glass', { overrides: { discord: { common: { tokens: fake } } } })
	const tokens = t.runtime.valenced.discord.common.tokens
	const marker = tokens.colors.MOBILE_ACTIONSHEET_BACKGROUND
	check('the sheet colour token resolves to the see-through colour', /^rgba\(28,29,36,0\.6/.test(tokens.internal.resolveSemanticColor('dark', marker)), tokens.internal.resolveSemanticColor('dark', marker))
	check('every other token is left to Discord', tokens.internal.resolveSemanticColor('dark', tokens.colors.TEXT_DEFAULT) === '#ffffff')
	const table = t.runtime.valenced.discord.common.tokens.SemanticColor.MOBILE_ACTIONSHEET_BACKGROUND
	check('the opacity of the sheet colour is lowered in Discord’s own table, for every theme', table.dark.opacity < 0.75 && table.light.opacity < 0.75, [table.dark.opacity, table.light.opacity])
	t.api.jsonStorage.set({ sheets: false })
	check('and it is Discord’s own opacity again when the switch is off', table.dark.opacity === 1)
	check('the sheets switch turns it off', tokens.internal.resolveSemanticColor('dark', marker) === '#232428')
	t.api.jsonStorage.set({ sheets: true })
	t.stop()
	check('the opacity is put back when the plugin stops', Object.getOwnPropertyDescriptor(table.dark, 'opacity').value === 1)
	check('Discord’s own colour comes back when the plugin stops', tokens.internal.resolveSemanticColor('dark', marker) === '#232428')

	s.stop()
	done()
})()
