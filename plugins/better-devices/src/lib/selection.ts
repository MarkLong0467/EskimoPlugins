import { logOutSelectedSessions } from './logout'

export type Selection = { active: boolean; hashes: string[] }

let state: Selection = { active: false, hashes: [] }
const listeners = new Set<() => void>()

export function subscribeSelection(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

export function getSelection(): Selection {
	return { active: state.active, hashes: [...state.hashes] }
}

export function isSelected(hash: string): boolean {
	return state.active && state.hashes.includes(hash)
}

function emit(): void {
	for (const fn of listeners) fn()
}

/** Long-pressing a row enters selection mode and picks that row. */
export function enterSelection(hash: string): void {
	state = { active: true, hashes: [hash] }
	emit()
}

export function toggleSelection(hash: string): void {
	if (!state.active) {
		state = { active: true, hashes: [hash] }
		emit()
		return
	}
	const has = state.hashes.includes(hash)
	if (has && state.hashes.length === 1) {
		// Unchecking the last device leaves selection mode on its own.
		state = { active: false, hashes: [] }
		emit()
		return
	}
	state = {
		active: true,
		hashes: has
			? state.hashes.filter(h => h !== hash)
			: [...state.hashes, hash],
	}
	emit()
}

export function exitSelection(): void {
	if (!state.active && state.hashes.length === 0) return
	state = { active: false, hashes: [] }
	emit()
}

/** Logs out every selected session, then leaves selection mode. */
export async function logOutSelected(): Promise<void> {
	const hashes = state.active ? [...state.hashes] : []
	exitSelection()
	if (hashes.length > 0) await logOutSelectedSessions(hashes)
}

export function useSelection(): Selection {
	const React = valenced.react.React
	const [sel, setSel] = React.useState(getSelection)
	React.useEffect(() => subscribeSelection(() => setSel(getSelection())), [])
	return sel
}
