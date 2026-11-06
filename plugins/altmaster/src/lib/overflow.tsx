import { checkFlow, falsePositiveFlow, reportFlow } from './flows'
import { getCurrentUserId, getReact, onImportedPath } from './modules'
import { getSettings } from './state'

const LABEL_CHECK = 'Check alt accounts'
const LABEL_REPORT = 'Report alt account'
const LABEL_APPEAL = 'Report false positive'

function isMenuItem(item: any): boolean {
	return (
		!!item &&
		typeof item === 'object' &&
		typeof item.label === 'string' &&
		typeof item.action === 'function'
	)
}

function isCategory(category: any): boolean {
	return (
		Array.isArray(category) && category.length > 0 && isMenuItem(category[0])
	)
}

// The profile overflow ContextMenu: props.items is an array of row arrays
// ({ label, action } objects), children is the trigger renderer, onOpen fires
// once when the menu opens.
function isOverflowMenu(element: any): boolean {
	const p = element?.props
	return (
		!!p &&
		Array.isArray(p.items) &&
		p.items.length >= 2 &&
		typeof p.children === 'function' &&
		typeof p.onOpen === 'function' &&
		isCategory(p.items[0]) &&
		(isCategory(p.items[1]) ||
			(Array.isArray(p.items[1]) && p.items[1].length === 0))
	)
}

function findMenu(tree: any): any {
	if (tree == null || typeof tree !== 'object') return null
	if (isOverflowMenu(tree)) return tree
	if (Array.isArray(tree)) {
		for (const child of tree) {
			const found = findMenu(child)
			if (found) return found
		}
		return null
	}
	return findMenu(tree?.props?.children)
}

function rebuild(tree: any, target: any, replacement: any): any {
	if (tree == null || typeof tree !== 'object') return tree
	if (tree === target) return replacement
	if (Array.isArray(tree)) {
		const next = tree.map(child => rebuild(child, target, replacement))
		return next.some((node, index) => node !== tree[index]) ? next : tree
	}
	const children = tree?.props?.children
	if (children != null && typeof children === 'object') {
		const nextChildren = rebuild(children, target, replacement)
		if (nextChildren !== children) {
			const { React } = getReact()
			return React.cloneElement(tree, { children: nextChildren })
		}
	}
	return tree
}

function targetIdOf(props: any): string {
	const user = props?.user
	return user?.id ?? user?.user?.id ?? ''
}

function menuItem(label: string, variant: undefined, action: () => void): any {
	const item: any = { label, action }
	if (variant) item.variant = variant
	return item
}

function makeCategory(targetId: string): any[] {
	const id = targetId || getCurrentUserId() || ''
	return [
		menuItem(LABEL_CHECK, undefined, () => {
			void checkFlow(id)
		}),
		menuItem(LABEL_REPORT, undefined, () => {
			void reportFlow(id)
		}),
		menuItem(LABEL_APPEAL, undefined, () => {
			void falsePositiveFlow(id)
		}),
	]
}

function inject(res: any, props: any): any {
	if (!res || typeof res !== 'object') return res
	try {
		if (!getSettings().enabled) return res
		const menu = findMenu(res)
		if (!menu) return res
		const items: any[] = menu.props.items
		if (items.length < 2) return res
		if (
			items.some(
				(category: any[]) =>
					Array.isArray(category) &&
					category.some((item: any) => item?.label === LABEL_CHECK),
			)
		)
			return res

		const { React } = getReact()
		if (!React) return res
		const category = makeCategory(targetIdOf(props))
		const merged = [...items.slice(0, 1), category, ...items.slice(1)]
		const nextMenu = React.cloneElement(menu, { items: merged })
		return rebuild(res, menu, nextMenu)
	} catch {
		return res
	}
}

function installWrapper(ns: any): () => void {
	const mod = ns?.default ?? ns
	if (typeof mod !== 'function') return () => {}
	const orig = mod
	const wrapped = (props: any) => {
		const element = orig(props)
		try {
			return inject(element, props)
		} catch {
			return element
		}
	}
	;(wrapped as any).displayName = 'AltMasterUserProfileOverflowMenu'
	ns.default = wrapped
	return () => {
		if (ns.default === wrapped) ns.default = orig
	}
}

export function patchOverflow(): () => void {
	const unpatch: Array<() => void> = []
	unpatch.push(
		onImportedPath(
			'modules/user_profile/native/UserProfileOverflowMenu.tsx',
			(ns: any) => {
				unpatch.push(installWrapper(ns))
			},
		),
	)
	return () => {
		for (const unpatchFn of unpatch) unpatchFn?.()
	}
}
