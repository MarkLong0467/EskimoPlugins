/** A node of a React element tree, as far as the walkers here look at it. */
export type TreeNode = Record<string, unknown> | unknown[]

/** The keys of an element that lead to the elements below it. */
const WALKABLE = ['props', 'children', 'child', 'sibling']

/** How deep the walk goes before it gives up. */
const MAX_DEPTH = 100

/**
 * Finds the first node of a React element tree that a filter accepts.
 *
 * This is the same walk as `findInReactTree` from Vendetta's utils: arrays are searched item by item, other objects only
 * through `props`, `children`, `child` and `sibling`. A node that was already seen is skipped, so a tree that points back at
 * itself cannot loop.
 *
 * @param tree The root, such as what a component returned.
 * @param filter Returns whether a node is the one wanted. It is called for arrays too.
 * @returns The node, or `undefined` if there is none.
 */
export function findInReactTree<T = unknown>(
	tree: unknown,
	filter: (node: any) => boolean,
): T | undefined {
	const seen = new WeakSet<object>()
	const walk = (node: unknown, depth: number): unknown => {
		if (depth > MAX_DEPTH || node == null || typeof node !== 'object')
			return undefined
		if (seen.has(node)) return undefined
		seen.add(node)
		try {
			if (filter(node)) return node
		} catch {
			// A filter that throws on one node does not stop the walk.
		}
		if (Array.isArray(node)) {
			for (const item of node) {
				const found = walk(item, depth + 1)
				if (found !== undefined) return found
			}
			return undefined
		}
		for (const key of WALKABLE) {
			const found = walk((node as Record<string, unknown>)[key], depth + 1)
			if (found !== undefined) return found
		}
		return undefined
	}
	return walk(tree, 0) as T | undefined
}

/** The name of a component: its function's name or `displayName`, looking through `memo` and `forwardRef`. */
export function typeName(type: unknown): string {
	let current: unknown = type
	for (let depth = 0; depth < 4 && current != null; depth++) {
		if (typeof current === 'string') return current
		if (typeof current !== 'function' && typeof current !== 'object') break
		const named = current as {
			displayName?: unknown
			name?: unknown
			type?: unknown
			render?: unknown
		}
		if (typeof named.displayName === 'string' && named.displayName)
			return named.displayName
		if (typeof named.name === 'string' && named.name) return named.name
		current = named.type ?? named.render
	}
	return typeof type === 'function' ? 'anonymous' : '?'
}

/**
 * The names of the components in a tree, in the order they are met, for a report that shows what Discord drew when a part
 * was not found. Only names are written, never props, so no message or command text can end up in it.
 *
 * @param tree The root to describe.
 * @param limit How many names to keep.
 */
export function describeTree(tree: unknown, limit = 40): string {
	const names: string[] = []
	const seen = new WeakSet<object>()
	const walk = (node: unknown, depth: number): void => {
		if (names.length >= limit || depth > 30 || node == null) return
		if (typeof node !== 'object') return
		if (seen.has(node)) return
		seen.add(node)
		if (Array.isArray(node)) {
			for (const item of node) walk(item, depth + 1)
			return
		}
		const element = node as { type?: unknown; props?: unknown }
		if (element.type != null) names.push(typeName(element.type))
		walk(element.props, depth + 1)
		walk((node as { children?: unknown }).children, depth + 1)
		walk(
			(element.props as { children?: unknown } | undefined)?.children,
			depth + 1,
		)
	}
	walk(tree, 0)
	return names.join(' > ') || 'nothing'
}
