export type SessionsStorage = {
	seen: Record<string, number>
	pending: string[]
	/** True once the already-existing devices have been recorded silently. */
	seeded: boolean
}

export const defaults: SessionsStorage = {
	seen: {},
	pending: [],
	seeded: false,
}

let storageRef: any
let state: SessionsStorage = { seen: {}, pending: [], seeded: false }
const listeners = new Set<() => void>()

/**
 * Snapshot of the pending hashes captured at the moment the Devices screen
 * starts rendering. The live `pending` list is acknowledged (cleared) in the
 * same render pass, so mark rendering must consult this snapshot, otherwise
 * the "New" pill / "+1" would be wiped before the rows paint.
 */
let viewPending: string[] = []

function loadCached(cache: any): void {
	if (!cache || typeof cache !== 'object') return
	state = {
		seen: cache.seen && typeof cache.seen === 'object' ? { ...cache.seen } : {},
		pending: Array.isArray(cache.pending) ? [...cache.pending] : [],
		seeded: cache.seeded === true,
	}
}

export function setStorageRef(ref: any): void {
	storageRef = ref
	try {
		loadCached(ref?.cache)
	} catch {
		// ignore
	}
}

function persist(): void {
	try {
		storageRef?.set?.({
			seen: state.seen,
			pending: state.pending,
			seeded: state.seeded,
		})
	} catch {
		// ignore
	}
}

function emit(): void {
	for (const fn of listeners) fn()
}

export function subscribe(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

/** Call once per Devices render: snapshot what is new before acking it. */
export function captureViewPending(): void {
	viewPending = [...state.pending]
}

/** True when the device was flagged in the snapshot taken at view entry. */
export function isNewInView(hash: string | undefined): boolean {
	return !!hash && viewPending.includes(hash)
}

export function getPendingViewCount(): number {
	return viewPending.length
}

export function getPending(): string[] {
	return [...state.pending]
}

/** How many devices have been recorded as already known. */
export function getSeenCount(): number {
	return Object.keys(state.seen).length
}

/** Whether the first list of devices has been recorded as the baseline. */
export function isSeeded(): boolean {
	return state.seeded
}

export function getPendingCount(): number {
	return state.pending.length
}

export function isNew(hash: string | undefined): boolean {
	return !!hash && state.pending.includes(hash)
}

/**
 * Diff a freshly fetched session list against what we already know.
 *
 * The very first non-empty list is treated as a silent baseline (seed): every
 * device that already exists is recorded so it can never be shown as "New".
 * Only devices that appear in later lists — i.e. log in after the plugin has
 * a baseline — get flagged as new until the user views the Devices screen.
 */
export function handleSessions(sessions: any[]): void {
	if (!Array.isArray(sessions)) return
	let changed = false
	const live = new Set<string>()
	const newlySeen = new Set<string>()

	for (const s of sessions) {
		if (!s || s.current) continue
		const hash = s.id_hash
		if (!hash) continue
		live.add(hash)
		if (!Object.hasOwn(state.seen, hash)) {
			state.seen[hash] = Date.now()
			newlySeen.add(hash)
			changed = true
		}
	}

	if (!state.seeded) {
		// Baseline: record devices silently, never flag them.
		if (live.size > 0) {
			state.seeded = true
			state.pending = []
			changed = true
		}
	} else {
		for (const hash of newlySeen) {
			if (!state.pending.includes(hash)) {
				state.pending.push(hash)
				changed = true
			}
		}
		const before = state.pending.length
		if (state.pending.some(hash => !live.has(hash))) {
			state.pending = state.pending.filter(hash => live.has(hash))
		}
		if (state.pending.length !== before) changed = true
	}

	if (changed) {
		persist()
		emit()
	}
}

/**
 * Called whenever the Devices screen is rendered: clears every "New" flag so
 * the badge and tags only ever point at sessions the user has not yet seen.
 */
export function onSessionsScreenViewed(): void {
	if (state.pending.length === 0) return
	state.pending = []
	persist()
	emit()
}
