import {
	captureFormCheckbox,
	getUseNativeStackNavigation,
} from '../lib/modules'
import { logOutSelected, useSelection } from '../lib/selection'
import { isFunctionNamed } from './jsxRuntime'

const { createElement } = valenced.react.React

let navHookRef: any

function getNavHook(): any {
	if (navHookRef === undefined) navHookRef = getUseNativeStackNavigation()
	return navHookRef
}

/**
 * Observes (never rewrites) every element creation: the first time the app
 * renders a FormCheckbox its component type is cached here, so the selection
 * checkboxes can use the exact native component without path-based lookups.
 */
export function transformCheckboxCapture(
	type: any,
	_props: any,
	_args: any[],
): void {
	if (!isFunctionNamed(type, 'FormCheckbox')) return
	captureFormCheckbox(type)
}

/**
 * Mounted inside the Devices screen. Puts the destructive "Log Out All"
 * button into the navigation TopBar (right side) while a multi-select is
 * active, and removes it again when selection ends or the screen unmounts.
 */
export function SessionsHeaderController(): any {
	const React = valenced.react.React
	const sel = useSelection()
	const [navigation] = React.useState(() => {
		const hook = getNavHook()
		if (typeof hook !== 'function') return null
		try {
			return hook()
		} catch {
			return null
		}
	})

	React.useEffect(() => {
		const nav = navigation
		if (!nav || typeof nav.setOptions !== 'function') return
		const Design = (valenced as any).discord?.design?.Design
		if (sel.active && Design?.Button) {
			nav.setOptions({
				headerRight: () =>
					createElement(Design.Button, {
						variant: 'destructive',
						size: 'sm',
						text: 'Log Out All',
						onPress: () => {
							void logOutSelected()
						},
					}),
			})
		} else {
			nav.setOptions({ headerRight: undefined })
		}
		return () => {
			nav.setOptions({ headerRight: undefined })
		}
	}, [navigation, sel.active])

	return null
}

/** Keeps the bulk rows hidden while selection mode is active. */
export function DangerRowSlot(props: { original: any }): any {
	const sel = useSelection()
	if (sel.active) return null
	return props.original
}
