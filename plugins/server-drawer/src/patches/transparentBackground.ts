import { registerPropsIntercept, registerPropsTransform } from '../lib/registry'

const TAG = '[ServerDrawer.Transparent]'

function isAbsoluteStyle(entry: any): boolean {
	return (
		entry &&
		typeof entry === 'object' &&
		(entry.borderRadius === 24 || entry.borderRadius === 25) &&
		typeof entry.backgroundColor === 'string' &&
		entry.position === 'absolute' &&
		entry.left === '50%' &&
		entry.zIndex === 1
	)
}

function isQuestDockCard(props: any): boolean {
	const style = props?.style
	if (!style) return false
	const arr = Array.isArray(style) ? style : [style]
	return arr.some(isAbsoluteStyle)
}

function makeTransparent(props: any): any {
	return { ...props, style: [props?.style, { backgroundColor: 'transparent' }] }
}

function isQuestImage(props: any): boolean {
	const source = props?.source
	if (source && typeof source?.uri === 'string') {
		return source.uri.includes('/quests/')
	}
	const sources = props?.sources
	if (Array.isArray(sources)) {
		return sources.some(
			(s: any) => typeof s?.uri === 'string' && s.uri.includes('/quests/'),
		)
	}
	return false
}

export function patchTransparentBackground(
	_cleanups: (fn: () => void) => void,
): boolean {
	registerPropsTransform(
		(props: any) => isQuestDockCard(props),
		(props: any) => makeTransparent(props),
	)

	registerPropsIntercept((props: any) => isQuestImage(props), null)

	console.log(TAG, 'quest dock card made transparent + hero images blocked')
	return true
}
