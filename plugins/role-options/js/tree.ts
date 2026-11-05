import { MAX_TREE_DEPTH } from './constants'
import type { Node } from './types'

/**
 * Looks through a drawn element, and the elements inside it, for the first one that passes `test`.
 *
 * It follows `props.children`, which may be one element or a list, and stops at a depth of `MAX_TREE_DEPTH` so a
 * strange or circular structure cannot hang the app.
 *
 * @returns The element, or nothing if none passes.
 */
export function findInTree(
	node: unknown,
	test: (node: Node) => unknown,
	depth = 0,
): Node | undefined {
	if (!node || depth > MAX_TREE_DEPTH) return undefined

	if (Array.isArray(node)) {
		for (const child of node) {
			const hit = findInTree(child, test, depth + 1)
			if (hit) return hit
		}
		return undefined
	}

	if (typeof node !== 'object') return undefined
	const element = node as Node
	if (test(element)) return element
	return element.props
		? findInTree(element.props.children, test, depth + 1)
		: undefined
}
