import { haptic } from './modules'

export type ContextMenuItem = {
	label: string
	action?: () => void
	IconComponent?: any
	iconSource?: number
}

export type ContextMenuState = {
	visible: boolean
	items: ContextMenuItem[]
	title: string
	anchorX: number
	anchorTopY: number
	anchorH: number
}

const IDLE: ContextMenuState = {
	visible: false,
	items: [],
	title: '',
	anchorX: 0,
	anchorTopY: 0,
	anchorH: 0,
}

let state: ContextMenuState = IDLE
let onClosed: (() => void) | null = null
const listeners = new Set<() => void>()

function emit(): void {
	for (const listener of [...listeners]) listener()
}

export function subscribeContextMenu(listener: () => void): () => void {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function getContextMenuState(): ContextMenuState {
	return state
}

function setState(patch: Partial<ContextMenuState>): void {
	state = { ...state, ...patch }
	emit()
}

export function closeContextMenu(): void {
	if (!state.visible) return
	const callback = onClosed
	onClosed = null
	setState({ ...IDLE, items: [], title: '' })
	callback?.()
}

export function openContextMenu(opts: {
	ref: any
	items: ContextMenuItem[]
	title?: string
	onClose?: () => void
}): void {
	const { ref, items, title, onClose } = opts
	if (!items || items.length === 0) return

	const target = ref?.current
	if (!target?.measureInWindow) return

	target.measureInWindow(
		(x: number, y: number, _width: number, height: number) => {
			try {
				haptic('IMPACT_MEDIUM')
			} catch {
				// haptics are best-effort
			}
			onClosed = onClose ?? null
			setState({
				visible: true,
				items,
				title: title ?? '',
				anchorX: x,
				anchorTopY: y,
				anchorH: height,
			})
		},
	)
}
