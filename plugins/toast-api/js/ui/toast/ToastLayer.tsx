import { useEntries, useSettings } from '../hooks'
import { ToastMotion } from './ToastMotion'
import type { ToastEntry, ToastPosition } from '../../types'

function Stack({
	entries,
	anchor,
	safeTop,
	offset,
}: {
	entries: ToastEntry[]
	anchor: ToastPosition
	safeTop: number
	offset: number
}) {
	const settings = useSettings()
	const { View, Dimensions } = valenced.react.ReactNative
	const { useCallback, useRef, useState } = valenced.react.React

	const [ghosts, setGhosts] = useState<ToastEntry[]>([])
	// Render order: live toasts plus any that are animating out, so a departing
	// toast holds its slot until the exit spring settles.
	const slots = useRef<ToastEntry[]>([])
	// Live toasts as of the previous render — the only place a departure can be
	// detected from, so a ghost is never mistaken for a new departure.
	const previousLive = useRef<ToastEntry[]>([])

	const dropGhost = useCallback((id: string) => {
		setGhosts(current => current.filter(entry => entry.id !== id))
	}, [])

	const liveIds = new Set(entries.map(entry => entry.id))
	const knownGhostIds = new Set(ghosts.map(entry => entry.id))
	const departed = previousLive.current.filter(
		entry => !liveIds.has(entry.id) && !knownGhostIds.has(entry.id),
	)
	const pending = [
		...ghosts.filter(entry => !liveIds.has(entry.id)),
		...departed,
	]
	const ghostsMatch =
		pending.length === ghosts.length &&
		pending.every((entry, index) => entry.id === ghosts[index]?.id)
	if (!ghostsMatch) setGhosts(pending)

	const ghostIds = new Set(pending.map(entry => entry.id))
	const liveById = new Map(entries.map(entry => [entry.id, entry]))
	const carried = slots.current
		.map(
			entry =>
				liveById.get(entry.id) ?? (ghostIds.has(entry.id) ? entry : undefined),
		)
		.filter((entry): entry is ToastEntry => entry !== undefined)
	const seen = new Set(carried.map(entry => entry.id))
	const arriving = entries.filter(entry => !seen.has(entry.id))
	// The newest toast lands against the edge its stack belongs to — top for a top
	// stack, bottom for a bottom one — which is where legacy starts its slide.
	const fresh = anchor === 'top' ? [...arriving].reverse() : arriving
	const list =
		anchor === 'top' ? [...fresh, ...carried] : [...carried, ...fresh]

	slots.current = list
	previousLive.current = entries

	if (list.length === 0) return null

	const screen = Dimensions.get('window')
	const maxWidth =
		settings.maxWidth > 0 ? settings.maxWidth : Math.max(0, screen.width - 32)

	return (
		<View
			pointerEvents="box-none"
			style={{
				position: 'absolute',
				left: 0,
				right: 0,
				...(anchor === 'top' ? { top: offset } : { bottom: offset }),
				alignItems: 'center',
			}}
		>
			<View
				pointerEvents="box-none"
				style={{
					width: '100%',
					alignItems: 'center',
					gap: settings.gap,
				}}
			>
				{list.map(entry => {
					const ghost = ghostIds.has(entry.id)
					return (
						<ToastMotion
							key={ghost ? `${entry.id}-out` : entry.id}
							entry={entry}
							settings={settings}
							maxWidth={maxWidth}
							anchor={anchor}
							safeTop={safeTop}
							mode={ghost ? 'exit' : 'enter'}
							onExited={() => dropGhost(entry.id)}
						/>
					)
				})}
			</View>
		</View>
	)
}

/**
 * The plugin's toast layer, rendered as a sibling of Discord's own mana
 * container so Discord's rendering stays untouched — a third style alongside it,
 * not a replacement. `offset` comes from `AppToastContainer`, which computes the
 * safe-area top and the bottom app chrome with Discord's own hooks, so this layer
 * does not resolve them itself.
 *
 * Resting anchors are legacy's numbers: `safeAreaTop + 8` at the top, `bottom
 * chrome + 8` at the bottom.
 */
export function ToastLayer({
	offset,
}: {
	offset?: { top?: number; bottom?: number }
}) {
	const { View, StyleSheet } = valenced.react.ReactNative
	const entries = useEntries()

	const safeTop = offset?.top ?? 0
	const safeBottom = offset?.bottom ?? 0
	const top = entries.filter(entry => entry.position === 'top')
	const bottom = entries.filter(entry => entry.position === 'bottom')
	// A pressable toast has to stay reachable by screen readers, so the whole layer
	// only hides itself while nothing on it can be tapped. Each individual toast
	// still hides itself when it is not pressable.
	const anyPressable = entries.some(
		entry => typeof entry.onPress === 'function',
	)

	return (
		<View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
			<View
				pointerEvents="box-none"
				accessibilityElementsHidden={!anyPressable}
				importantForAccessibility={
					anyPressable ? 'auto' : 'no-hide-descendants'
				}
				style={StyleSheet.absoluteFill}
			>
				<Stack
					entries={top}
					anchor="top"
					safeTop={safeTop}
					offset={safeTop + 8}
				/>
				<Stack
					entries={bottom}
					anchor="bottom"
					safeTop={safeBottom}
					offset={safeBottom + 8}
				/>
			</View>
		</View>
	)
}
