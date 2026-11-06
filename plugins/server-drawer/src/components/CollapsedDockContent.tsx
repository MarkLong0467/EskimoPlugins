import { COLLAPSED_DOCK_HEIGHT } from '../lib/quests'

// The collapsed slot renders nothing: the expanded slot's grid is mounted for
// the dock's whole lifetime, so the card's overflow:hidden height animation
// clips/reveals the same rows — no crossfade, nothing to reflow.
export default function CollapsedDockContent() {
	const React = valenced.react.React

	React.useEffect(() => {
		console.log(
			'[ServerDrawer] collapsed slot: empty (single-grid mode, band =',
			COLLAPSED_DOCK_HEIGHT,
			')',
		)
	}, [])

	return null
}
