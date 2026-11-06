import { useEffect, useState } from 'react'
import {
	closeContextMenu,
	getContextMenuState,
	subscribeContextMenu,
} from '../lib/contextMenu'
import ContextMenuModal from './ContextMenuModal'
import type { ContextMenuState } from '../lib/contextMenu'

export default function ContextMenuHost() {
	const [state, setState] = useState<ContextMenuState>(getContextMenuState)

	useEffect(
		() => subscribeContextMenu(() => setState(getContextMenuState())),
		[],
	)

	return (
		<ContextMenuModal
			visible={state.visible}
			items={state.items}
			title={state.title}
			anchorX={state.anchorX}
			anchorTopY={state.anchorTopY}
			anchorH={state.anchorH}
			onClose={closeContextMenu}
		/>
	)
}
