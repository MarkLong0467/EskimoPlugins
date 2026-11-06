/**
 * Where the DM tile is shown.
 *
 * - `drawer`: inside the server drawer, as a tile next to the guilds.
 * - `rail`: in the GuildsBar's own slot, so the drawer keeps its full width.
 * - `hidden`: nowhere. The rail collapses rather than hold an empty strip.
 *
 * Declared next to `defaults` because it is part of the stored shape. The
 * user-facing labels for these live in `ui/DmTileSheet`.
 */
export type DmTileMode = 'drawer' | 'rail' | 'hidden'

export const DM_TILE_MODES: readonly DmTileMode[] = ['drawer', 'rail', 'hidden']

export function isDmTileMode(value: unknown): value is DmTileMode {
	return (
		typeof value === 'string' &&
		(DM_TILE_MODES as readonly string[]).includes(value)
	)
}

export const defaults = {
	dmTileMode: 'drawer' as DmTileMode,
	showGuildNames: false,
}

export type ServerDrawerStorage = typeof defaults

let storageRef: any
export function setStorageRef(ref: any): void {
	storageRef = ref
}

/**
 * Folds a raw storage object into the current shape.
 *
 * 1.1.3 stored a `hideDmTile` boolean whose `true` meant "show the tile in the
 * rail", not "hide it" — the name was misleading and there was no way to remove
 * the tile altogether. `true` therefore maps onto 'rail', so upgrading does not
 * move anyone's tile somewhere they never chose.
 */
export function normalizeStorage(raw: any): ServerDrawerStorage {
	const merged: any = { ...defaults, ...raw }
	if (merged.dmTileMode === undefined && typeof raw?.hideDmTile === 'boolean') {
		merged.dmTileMode = raw.hideDmTile ? 'rail' : 'drawer'
	}
	if (!isDmTileMode(merged.dmTileMode)) {
		merged.dmTileMode = defaults.dmTileMode
	}
	return merged as ServerDrawerStorage
}

export function snapshot(): ServerDrawerStorage {
	return normalizeStorage(storageRef?.cache)
}

export function reactive(): ServerDrawerStorage {
	return normalizeStorage(storageRef?.use())
}

export function setDmTileMode(
	dmTileMode: DmTileMode,
): Promise<void> | undefined {
	return storageRef?.set({ dmTileMode })
}

/**
 * Rewrites storage that still carries the pre-1.1.4 `hideDmTile` boolean.
 *
 * `set` merges, so the stale key cannot be dropped piecemeal; replacing the
 * document with the normalized shape is what clears it. Reads already tolerate
 * the old key, so this only tidies the file.
 */
export function migrateStorage(storage: any): void {
	try {
		const raw = storage?.cache
		if (!raw || typeof raw.hideDmTile !== 'boolean') return
		void storage.set(normalizeStorage(raw), true)
	} catch {
		// ignore
	}
}

const importedCache = new Map<string, any>()

export function byImported(path: string): any {
	const cached = importedCache.get(path)
	if (cached !== undefined) return cached
	try {
		const [exports] =
			valenced.discord.utils.modules.finders.lookupModuleWithImportedPath(path)
		if (exports != null) {
			importedCache.set(path, exports)
			return exports
		}
		return undefined
	} catch {
		return undefined
	}
}

export function getFluxStore(storeName: string): any {
	try {
		return valenced.discord.flux.Stores[storeName]
	} catch {
		return undefined
	}
}

// id of the guild the user is currently in; null while inside DMs.
export function useSelectedGuildId(): string | null {
	return useFluxStore(
		'SelectedGuildStore',
		store => store?.getGuildId?.() ?? null,
		null,
	)
}

export function useFluxStore<T>(
	storeName: string,
	select: (store: any) => T,
	fallback: T,
): T {
	const React = valenced.react.React

	const selectRef = React.useRef(select)
	selectRef.current = select
	const latestRef = React.useRef<T | undefined>(undefined)
	const mountedRef = React.useRef(false)
	const [, force] = React.useState(0)

	React.useEffect(() => {
		const store = getFluxStore(storeName)
		if (store != null && typeof store.addReactChangeListener === 'function') {
			const onChange = () => {
				let next: T
				try {
					next = selectRef.current(store)
				} catch {
					next = fallback
				}
				if (!Object.is(latestRef.current, next)) {
					latestRef.current = next
					force(v => v + 1)
				}
			}
			onChange()
			store.addReactChangeListener(onChange)
			return () => {
				try {
					store.removeReactChangeListener(onChange)
				} catch {
					// ignore
				}
			}
		}
		return
	}, [storeName])

	let current: T
	try {
		current = select(getFluxStore(storeName))
	} catch {
		current = fallback
	}
	if (!mountedRef.current) {
		latestRef.current = current
		mountedRef.current = true
	}
	return Object.is(latestRef.current, current)
		? current
		: (latestRef.current = current)
}

let cachedMe: string | undefined
export function getME(): string | undefined {
	try {
		const found = (valenced as any).discord.common.constants.Constants?.ME
		if (typeof found === 'string' && found.length > 0) {
			cachedMe = found
			return found
		}
	} catch {
		// ignore
	}
	return cachedMe
}

export function haptic(kind: string): void {
	try {
		const haptics = byImported('modules/haptics/HapticUtils.native.tsx')
		haptics?.triggerHapticFeedback?.(haptics.HapticFeedbackTypes?.[kind])
	} catch {
		// ignore
	}
}

export function getAssetId(name: string): number | undefined {
	try {
		return valenced.assets.getAssetIdByName(name)
	} catch {
		return undefined
	}
}

export function lazy<T>(getter: () => T | undefined): () => T | undefined {
	let cached: T | undefined
	let resolved = false
	return () => {
		if (resolved) return cached
		const value = getter()
		if (value == null) return undefined
		cached = value
		resolved = true
		return cached
	}
}

export function getGestureContext(): any {
	try {
		return byImported(
			'modules/quests/native/QuestDock/QuestDockGestureContext.tsx',
		)?.QuestDockGestureContext
	} catch {
		return undefined
	}
}

export function getExternalCoordinationContext(): any {
	try {
		return byImported(
			'modules/quests/native/QuestDock/QuestDockExternalCoordinationContext.tsx',
		)?.QuestDockExternalCoordinationContext
	} catch {
		return undefined
	}
}

export function getQuestDockMode(): any {
	try {
		return byImported('modules/quests/QuestConstants.tsx')?.QuestDockMode
	} catch {
		return undefined
	}
}

export function useQuestDockExpanded(): boolean {
	const React = valenced.react.React
	const [expanded, setExpanded] = React.useState(false)
	const lastRef = React.useRef(false)

	React.useEffect(() => {
		const flux = valenced.discord.flux
		console.log(
			'[ServerDrawer] dock: flux.getStore type =',
			typeof flux?.getStore,
		)
		if (typeof flux?.getStore !== 'function') return

		let store: any
		const { QuestDockMode } = getQuestDockMode() ?? {}
		// The client's enum field is a stable string pair ("collapsed"/"expanded"),
		// and QuestConstants may not be initialized yet, so anchor on the literal.
		const expandedMode = QuestDockMode?.EXPANDED ?? 'expanded'
		console.log('[ServerDrawer] dock: QuestDockMode.EXPANDED =', expandedMode)

		const onChange = () => {
			try {
				const mode = store?.prevRestingQuestDockMode
				const next = mode === expandedMode
				if (next !== lastRef.current) {
					lastRef.current = next
					console.log(
						'[ServerDrawer] dock: prevRestingQuestDockMode =',
						mode,
						'-> isExpanded =',
						next,
					)
					setExpanded(next)
				}
			} catch {
				// ignore
			}
		}

		let unsubWait: (() => void) | undefined
		try {
			unsubWait = flux.getStore('QuestDockStore', (s: any) => {
				store = s
				console.log(
					'[ServerDrawer] dock: store resolved, getName =',
					store?.getName?.(),
					'hasToken =',
					Boolean(store?._dispatchToken),
					'listener =',
					typeof store?.addReactChangeListener,
				)
				store?.addReactChangeListener?.(onChange)
				onChange()
			})
		} catch (e) {
			console.log('[ServerDrawer] dock: flux.getStore threw', e)
		}

		return () => {
			try {
				unsubWait?.()
			} catch {
				// ignore
			}
			try {
				store?.removeReactChangeListener?.(onChange)
			} catch {
				// ignore
			}
		}
	}, [])

	return expanded
}
