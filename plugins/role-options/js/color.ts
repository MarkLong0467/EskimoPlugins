import { findInTree } from './tree'
import type { Node, Role } from './types'

/** A color number as a hex code: `16711680` becomes `#ff0000`. Only the last 24 bits count. */
export function hexFromInt(value: number): string {
	return `#${`000000${(value >>> 0).toString(16)}`.slice(-6)}`
}

/** The last `#rrggbb` background color in a style, or a list of styles (the last one wins, like in React Native). */
function styleColor(style: unknown): string | undefined {
	const list = Array.isArray(style) ? style : [style]
	for (let index = list.length - 1; index >= 0; index--) {
		const color = (list[index] as { backgroundColor?: unknown } | undefined)
			?.backgroundColor
		if (typeof color === 'string' && color.charAt(0) === '#') return color
	}
	return undefined
}

/**
 * The color of a role chip on a profile.
 *
 * In order: the color of the role the chip was given (`props.role.color`, when it is not 0), a `roleColor` text found
 * in what the chip drew, and finally the background color of a colored dot in what it drew.
 *
 * @param props What the chip component was called with.
 * @param drawn What it returned.
 */
export function roleColor(
	props: { role?: Role } | undefined,
	drawn: unknown,
): string | undefined {
	const role = props?.role
	if (role && typeof role.color === 'number' && role.color > 0)
		return hexFromInt(role.color)

	const named = findInTree(
		drawn,
		(node: Node) => node.props && typeof node.props.roleColor === 'string',
	)
	if (named) return named.props?.roleColor as string

	const dot = findInTree(
		drawn,
		(node: Node) => node.props && styleColor(node.props.style),
	)
	if (dot) return styleColor(dot.props?.style)
	return undefined
}

/**
 * The colors of a role as text: one hex code, or all of a gradient role's colors separated by commas.
 * A role has either the newer `colors` object (primary, secondary, tertiary) or the older single `color`.
 *
 * @returns The text, or nothing if the role has no color.
 */
export function roleColors(role: Role | undefined): string | undefined {
	if (!role) return undefined

	const list: string[] = []
	const colors = role.colors
	if (colors && typeof colors === 'object') {
		for (const key of [
			'primary_color',
			'secondary_color',
			'tertiary_color',
		] as const) {
			const value = colors[key]
			if (typeof value === 'number') list.push(hexFromInt(value))
		}
	}
	if (!list.length && typeof role.color === 'number' && role.color > 0)
		list.push(hexFromInt(role.color))
	return list.length ? list.join(', ') : undefined
}
