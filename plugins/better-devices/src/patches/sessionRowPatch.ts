import { formatExactTimestamp } from '../lib/format'
import { logOutSession } from '../lib/logout'
import { getFormCheckbox } from '../lib/modules'
import {
	enterSelection,
	isSelected,
	toggleSelection,
	useSelection,
} from '../lib/selection'
import { isNewInView } from '../lib/sessionState'
import { isFunctionNamed } from './jsxRuntime'
import { buildCountBadge, buildNewMark } from './ui'

const { createElement, cloneElement, Fragment } = valenced.react.React
const RN = valenced.react.ReactNative

let sessionInfoRef: any
let captureMounted = false

/** Logs out one session. 2FA challenges are left to the server to resolve. */
function logout(hash: string): void {
	void logOutSession(hash)
}

/** Its own TableRow per device, holding the destructive button. */
export function buildLogoutRow(hash: string): any {
	const Design = (valenced as any).discord?.design?.Design
	if (!Design?.TableRow || !Design?.Button) return null
	return createElement(Design.TableRow, {
		variant: 'default',
		label: createElement(Design.Button, {
			variant: 'destructive',
			size: 'sm',
			text: 'Log Out',
			grow: true,
			onPress: () => logout(hash),
		}),
		trailing: null,
	})
}

/** Selection-mode trailing slot: the native animated checkbox. */
function buildCheckTrailing(hash: string): any {
	const Checkbox = getFormCheckbox()
	if (!Checkbox) return null
	return createElement(Checkbox, { checked: isSelected(hash) })
}

function decorateRow(
	row: any,
	fresh: boolean,
	trailing: any,
	onPress?: () => void,
): any {
	if (!row || typeof row !== 'object' || !row.props) return row

	let next = row
	const label = row.props.label
	if (label) {
		const pieces = [label]
		if (fresh) pieces.push(buildNewMark(), buildCountBadge('+1'))
		next = cloneElement(row, {
			label: createElement(
				RN.View,
				{
					style: {
						flexDirection: 'row',
						alignItems: 'center',
						flexWrap: 'wrap',
						gap: 8,
					},
				},
				pieces,
			),
		})
	}
	const patch: any = { trailing }
	if (typeof onPress === 'function') patch.onPress = onPress
	return cloneElement(next, patch)
}

/**
 * Replaces the date row inside the subLabel with an exact Discord-style
 * timestamp derived from `approx_last_used_time`.
 */
function rewriteTimestamp(row: any, session: any): any {
	if (!session?.approx_last_used_time) return row
	const sub = row?.props?.subLabel
	if (!sub || typeof sub !== 'object' || !sub.props) return row

	const rows = Array.isArray(sub.props.children) ? sub.props.children : []
	const idx = rows.length - 1
	const dateRow = rows[idx]
	if (!dateRow || typeof dateRow !== 'object' || !dateRow.props) return row

	const text = Array.isArray(dateRow.props.children)
		? dateRow.props.children[0]
		: dateRow.props.children
	if (!text || typeof text !== 'object' || !text.props) return row

	let formatted = ''
	try {
		const date =
			session.approx_last_used_time instanceof Date
				? session.approx_last_used_time
				: new Date(session.approx_last_used_time)
		formatted = formatExactTimestamp(date)
	} catch {
		return row
	}
	if (!formatted) return row

	const newText = cloneElement(text, { children: formatted })
	const newDateRow = cloneElement(dateRow, { children: newText })
	const newRows = [...rows.slice(0, idx), newDateRow]
	const newSub = cloneElement(sub, { children: newRows })
	return cloneElement(row, { subLabel: newSub })
}

function SessionRow(props: any) {
	const sel = useSelection()
	const session = props?.session
	if (!session || typeof sessionInfoRef !== 'function') return null
	let row: any
	try {
		row = sessionInfoRef(props)
	} catch {
		return null
	}
	if (!row || typeof row !== 'object') return null

	const hash = session.id_hash
	const fresh = isNewInView(hash)
	const isCurrent = session.current === true || props?.current === true

	// Selection keeps the row exactly as-is (icon, labels, red Log Out button)
	// and only swaps the trailing slot for a native checkbox.
	let trailing: any = null
	let onPress: (() => void) | undefined
	if (sel.active && !isCurrent) {
		trailing = buildCheckTrailing(hash)
		onPress = () => toggleSelection(hash)
	}
	const deviceRow = rewriteTimestamp(
		decorateRow(row, fresh, trailing, onPress),
		session,
	)

	const Design = (valenced as any).discord?.design?.Design
	if (!Design?.TableRowGroup) return deviceRow

	const children = isCurrent ? [deviceRow] : [deviceRow, buildLogoutRow(hash)]
	const group = createElement(Design.TableRowGroup, {
		hasIcons: true,
		children,
	})
	if (isCurrent) return group
	// Space between each device's own card; long-press a card to multi-select.
	const card = createElement(
		RN.Pressable,
		{
			delayLongPress: 350,
			onLongPress: () => enterSelection(hash),
			style: { width: '100%', marginBottom: 16 },
		},
		group,
	)
	if (Design?.Checkbox && !captureMounted) {
		// Mount one real native checkbox offscreen so its live render records
		// the component for use in the trailing slot.
		captureMounted = true
		return createElement(
			Fragment,
			{},
			card,
			createElement(
				RN.View,
				{
					style: {
						position: 'absolute',
						left: -10000,
						width: 1,
						height: 1,
						overflow: 'hidden',
						opacity: 0,
					},
				},
				createElement(Design.Checkbox, {
					label: '',
					checked: false,
					onToggle: () => {},
				}),
			),
		)
	}
	return card
}

export function transformSessionRow(type: any, props: any, args: any[]): void {
	if (!isFunctionNamed(type, 'SessionInfo') || !props?.session?.id_hash) return
	sessionInfoRef = type
	args[0] = SessionRow
}

const NullRow = () => null

/** Removes the "Some older devices may have signed in" info row. */
export function transformUnknownSessionRow(
	type: any,
	_props: any,
	args: any[],
): void {
	if (!isFunctionNamed(type, 'UnknownLegacySessionsInfo')) return
	args[0] = NullRow
}
