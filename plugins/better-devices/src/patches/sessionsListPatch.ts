import { logOutOtherSessions } from '../lib/logout'
import { getSessionsStore } from '../lib/modules'
import {
	captureViewPending,
	getPendingViewCount,
	handleSessions,
	onSessionsScreenViewed,
} from '../lib/sessionState'
import { DangerRowSlot, SessionsHeaderController } from './headerPatch'
import { isNamedElement } from './jsxRuntime'
import { buildCountBadge, buildDevicesNotice } from './ui'

const { createElement, cloneElement } = valenced.react.React
const RN = valenced.react.ReactNative

function isDangerRow(c: any): boolean {
	return (
		c?.type?.name === 'TableRow' &&
		c?.props?.variant === 'danger' &&
		c?.props?.label != null
	)
}

const VoidComponent = () => null

/**
 * Removes the native description paragraph that the Devices screen renders
 * above the list (it says the same thing our callout now says). The element
 * is identified by its screen-specific style: `text-sm/medium` with
 * `paddingHorizontal: 16, paddingTop: 8, marginBottom: 8`.
 */
export function transformRemoveSessionsDescription(
	_type: any,
	props: any,
	args: any[],
): void {
	const style = props?.style
	if (
		style &&
		style.paddingTop === 8 &&
		style.marginBottom === 8 &&
		style.paddingHorizontal === 16 &&
		props?.variant === 'text-sm/medium'
	) {
		args[0] = VoidComponent
		args[1] = {}
	}
}

function isSessionsStack(props: any): boolean {
	const children = props?.children
	if (!Array.isArray(children) || children.length < 3) return false

	const head = children[0]
	if (head?.type?.name === 'TableRowGroup') {
		const headChildren = head.props?.children
		const currentRow = Array.isArray(headChildren)
			? headChildren[0]
			: headChildren
		if (
			(currentRow?.type?.name === 'SessionInfo' ||
				currentRow?.type?.name === 'SessionRow') &&
			(currentRow?.props?.current === true ||
				currentRow?.props?.session?.current === true)
		) {
			return true
		}
	}
	// Loose fallback: a List whose tail is a danger "Log Out All" row.
	return children.some(isDangerRow)
}

function buildSummaryRow(TableRow: any, newCount: number): any {
	if (!TableRow || newCount <= 0) return null
	return createElement(TableRow, {
		variant: 'default',
		label: createElement(
			RN.View,
			{ style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
			createElement(
				RN.Text,
				{ style: { fontWeight: '600', fontSize: 14 } },
				`${newCount} new device${newCount > 1 ? 's' : ''}`,
			),
			buildCountBadge(`+${Math.min(newCount, 99)}`),
		),
		trailing: null,
	})
}

/**
 * The Devices screen's Stack: seeds the new-device detection, mounts the
 * TopBar "Log Out All" controller, keeps the bulk danger row hidden while a
 * selection is active, adds a "N new device(s)" summary, and rewires the bulk
 * row to the sequential logout.
 *
 * Each device's own row-with-its-Log-Out card is built by the SessionRow
 * wrapper (guaranteed to render); this transform only touches list-level
 * chrome.
 */
export function transformSessionsList(
	type: any,
	props: any,
	_args: any[],
): void {
	if (!isNamedElement(type, 'Stack') || !isSessionsStack(props)) return

	// The Devices screen owns a fresh native fetch — diff it into the
	// seen/pending state before snapshotting, so a login that landed since
	// the last poll is surfaced this visit. Keep this before the ack.
	try {
		handleSessions(getSessionsStore()?.getSessions?.() ?? [])
	} catch {}

	// Snapshot what is new before acking, so the marks render this visit.
	captureViewPending()
	const newCount = getPendingViewCount()
	onSessionsScreenViewed()

	const children = Array.isArray(props?.children) ? props.children : []
	const Group = children[0]?.type
	const TableRow = children.find(isDangerRow)?.type

	const out: any[] = []
	// Mounted harmlessly (renders null) but drives the TopBar button.
	out.push(createElement(SessionsHeaderController, {}))
	// Security callout + long-press hint, above the device cards.
	out.push(buildDevicesNotice())

	const dangerIdx = children.findIndex(isDangerRow)
	if (dangerIdx > 0) {
		out.push(children[0])
		const original = cloneElement(children[dangerIdx], {
			onPress: () => {
				void logOutOtherSessions()
			},
		})
		out.push(createElement(DangerRowSlot, { original }))
	} else {
		out.push(children[0])
	}

	const summary = buildSummaryRow(TableRow, newCount)
	if (summary && Group) {
		out.push(createElement(Group, { children: [summary] }))
	}

	const others = children.find((c: any) => c !== children[0] && !isDangerRow(c))
	if (others) out.push(others)

	props.children = out
}
