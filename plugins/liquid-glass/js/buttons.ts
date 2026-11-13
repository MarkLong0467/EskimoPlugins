/**
 * The frosted look for the components of Discord. Each of them is drawn by a component of the design system (`Design.Button`,
 * `Design.Card` and so on), so a hook before each of their elements adds the frost to the style the caller gave, with the
 * caller's own style after it so it still wins. Nothing is replaced, and every hook is taken off when the plugin stops. Each
 * part has its own switch and its own counter in the report.
 */

import { Design } from '@valenced/discord/design'
import { beforeJSX } from '@valenced/react/jsx-runtime'
import { store } from './config'
import { diag } from './diag'
import { look } from './look'
import { countOf } from './state'
import type { GlassSettings } from './config'
import type { Kind } from './look'

type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A part of Discord that gets the frost. */
interface Rule {
	/** The name in the report. */
	name: string
	/** The component in the design system. */
	component: string
	/** The setting that turns it on. */
	setting: keyof GlassSettings
	/** What kind of surface it is. */
	kind: Kind
	/** The name of the prop that has the style, which is `style` for most components. */
	prop: string
	/** Whether this element is frosted, going by its props. */
	wants(props: Record<string, unknown>): boolean
}

/**
 * The variants of buttons that are frosted: the quiet ones with a fill, not the coloured call to action. A button's `style`
 * is on a wrapper that has no corners (the pill inside has them), so buttons get the frost in `pillStyle` to keep their shape.
 */
const QUIET = new Set(['secondary', 'secondary-overlay'])

const RULES: readonly Rule[] = [
	{
		name: 'buttons',
		component: 'Button',
		setting: 'buttons',
		kind: 'rim',
		prop: 'pillStyle',
		wants: props => QUIET.has(props.variant as string),
	},
	{
		name: 'icon buttons',
		component: 'IconButton',
		setting: 'buttons',
		kind: 'rim',
		prop: 'pillStyle',
		wants: props => QUIET.has(props.variant as string),
	},
	{
		name: 'cards',
		component: 'Card',
		setting: 'cards',
		kind: 'card',
		prop: 'style',
		wants: props => props.variant !== 'transparent',
	},
	{
		name: 'text inputs',
		component: 'TextInput',
		setting: 'fields',
		kind: 'field',
		prop: 'style',
		wants: () => true,
	},
	{
		name: 'text fields',
		component: 'TextField',
		setting: 'fields',
		kind: 'field',
		prop: 'style',
		wants: () => true,
	},
	{
		name: 'text areas',
		component: 'TextArea',
		setting: 'fields',
		kind: 'field',
		prop: 'style',
		wants: () => true,
	},
	{
		name: 'sheets',
		component: 'ActionSheet',
		setting: 'sheets',
		kind: 'sheet',
		prop: 'backgroundStyles',
		wants: () => true,
	},
	{
		name: 'bottom sheets',
		component: 'BottomSheet',
		setting: 'sheets',
		kind: 'sheet',
		prop: 'backgroundStyles',
		wants: () => true,
	},
	{
		name: 'menus',
		component: 'Menu',
		setting: 'sheets',
		kind: 'menu',
		prop: 'style',
		wants: () => true,
	},
]

/** Adds the frost to a style, or to the style a function gives (Pressable styles may be functions). */
function withFrost(style: unknown, frost: Record<string, unknown>): unknown {
	if (typeof style === 'function')
		return (pressState: unknown) => [
			frost,
			(style as (s: unknown) => unknown)(pressState),
		]
	return [frost, style]
}

/** Installs the hooks. */
export function installFrost(cleanup: Cleanup): void {
	const components = Design as unknown as Record<string, never | undefined>
	for (const rule of RULES) {
		const component = components[rule.component]
		const count = countOf(rule.name)
		if (!component) {
			diag.log(
				'frost',
				`Design.${rule.component} was not found, so ${rule.name} are not frosted`,
				'warn',
			)
			continue
		}
		cleanup(
			diag.apply(`frost: ${rule.name}`, () =>
				beforeJSX(component, args => {
					const [type, props, key] = args
					count.seen++
					const given = props as Record<string, unknown>
					if (!store.get(rule.setting) || !rule.wants(given)) return args
					count.frosted++
					return [
						type,
						{
							...given,
							[rule.prop]: withFrost(given[rule.prop], look(rule.kind)),
						},
						key,
					] as never
				}),
			),
		)
	}
}
