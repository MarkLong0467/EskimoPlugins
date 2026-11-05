import { View } from 'react-native'
import { setting } from './config'
import { BUTTON_KEY } from './constants'
import PreviewButton from './PreviewButton'
import type { InputProps, TreeNode } from './types'

/**
 * Looks through a drawn element, and the elements inside it, for the first one that passes `test`.
 * It follows `props.children`, which may be one element or a list.
 */
function findInTree(
	node: unknown,
	test: (node: TreeNode) => unknown,
): TreeNode | undefined {
	if (!node || typeof node !== 'object') return undefined
	if (Array.isArray(node)) {
		for (const child of node) {
			const hit = findInTree(child, test)
			if (hit) return hit
		}
		return undefined
	}
	const element = node as TreeNode
	if (test(element)) return element
	return element.props ? findInTree(element.props.children, test) : undefined
}

/**
 * Adds the floating button to the message box when it is drawn.
 *
 * It only acts when the setting asks for the pill. It finds the text field's props through the `chatInputRef` Discord
 * keeps in the box, and the row of views the button goes into. If anything is missing, or the button is already there,
 * the box is returned as it was.
 *
 * @param drawn What Discord's message box component returned.
 * @returns The same element, with the button added to its first row.
 */
export function decorateInput<T>(drawn: T): T {
	const ret = drawn as unknown as TreeNode | undefined
	if (setting('buttonType') !== 'pill' || !ret || !ret.props) return drawn

	const holder = findInTree(ret.props.children, node => {
		const ref = node?.props?.chatInputRef as { current?: unknown } | undefined
		return ref?.current
	})
	const inputProps = (
		holder?.props?.chatInputRef as { current?: InputProps } | undefined
	)?.current
	if (!inputProps || typeof inputProps.handleTextChanged !== 'function')
		return drawn

	const row = findInTree(ret.props.children, node => {
		const type = node?.type as { displayName?: string } | undefined
		return (
			node?.type &&
			(type?.displayName === 'View' || node.type === View) &&
			Array.isArray(node.props?.children)
		)
	})
	if (!row) return drawn

	const kids = row.props?.children as Array<{ key?: unknown } | null>
	if (kids.some(kid => kid && kid.key === BUTTON_KEY)) return drawn
	kids.unshift(
		(<PreviewButton key={BUTTON_KEY} inputProps={inputProps} />) as never,
	)
	return drawn
}
