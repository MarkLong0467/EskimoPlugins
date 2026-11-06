import { ToastLayer } from '../ui/toast/ToastLayer'
import { lookupPath, onImportedPath } from './finders'

const PATHS = {
	manaContainer: 'design/mana/components/Toast/ToastContainer.native.tsx',
	safeAreaStore: 'modules/safe_area/SafeAreaStore.native.tsx',
}

/**
 * `AppToastContainer` builds its toast container element only when the safe-area
 * top or the quest-dock inset changes, and both values are memoized — so an
 * `insteadJSX` installed after that first render never runs until something moves
 * them. Nudging the stored top forces one more pass; 0.0001px is not visible.
 */
const INSET_NUDGE = 0.0001

const log = (message: string, error?: unknown) => {
	if (error !== undefined) console.warn(`[toast-api] ${message}`, error)
	else console.warn(`[toast-api] ${message}`)
}

/**
 * Move the safe-area top so Discord's toast container re-creates its element.
 * `useSafeAreaInsets` reads this store through `useSyncExternalStore`, so the new
 * value re-renders the container on its own. Adding a hook instead would change
 * every consumer's hook count mid-session and make React throw.
 *
 * Does nothing when the store module has not been imported yet — the container
 * reads it to render, so it has not rendered either and its first pass picks the
 * patch up on its own. Same when the store has no laid-out entries yet.
 */
function nudgeInsets(): boolean {
	const ns = lookupPath<any>(PATHS.safeAreaStore)
	if (ns == null) return false
	const store = ns.default
	if (
		typeof store?.setState !== 'function' ||
		typeof store?.getState !== 'function'
	) {
		log('SafeAreaStore has no setState; a restart may still be required')
		return false
	}
	try {
		const byAppEntry = store.getState()?.byAppEntry
		if (byAppEntry == null || typeof byAppEntry !== 'object') return false
		const keys = Object.keys(byAppEntry)
		if (keys.length === 0) return false
		const next: Record<string, any> = {}
		for (const key of keys) {
			const entry = byAppEntry[key]
			const insets = entry?.safeAreaInsets
			next[key] =
				insets && typeof insets === 'object' && typeof insets.top === 'number'
					? {
							...entry,
							safeAreaInsets: { ...insets, top: insets.top + INSET_NUDGE },
						}
					: entry
		}
		store.setState({ byAppEntry: next })
		return true
	} catch (error) {
		log('failed to nudge the safe-area insets', error)
		return false
	}
}

export function patchAll(): () => void {
	const disposers: Array<() => void> = []
	let stopped = false
	let hostPatched = false

	const add = (unsub: any) => {
		if (typeof unsub === 'function') {
			if (stopped) unsub()
			else disposers.push(unsub)
		}
	}

	/**
	 * One paint, deferred to the next tick so it cannot land while React is
	 * mid-render — module init can happen inside a render. It runs once, when
	 * the patch lands; there is no retry.
	 */
	function requestNudge(): void {
		if (stopped) return
		const handle = setTimeout(() => {
			if (!stopped) nudgeInsets()
		}, 0)
		disposers.push(() => clearTimeout(handle))
	}

	function patchHost(ns: any): void {
		if (hostPatched || stopped) return
		const host = ns?.ToastContainer
		if (
			host == null ||
			(typeof host !== 'function' && typeof host !== 'object')
		)
			return
		try {
			add(
				valenced.react.jsxRuntime.insteadJSX(host, (args, jsx) => {
					const props = (args[1] ?? {}) as any
					// Discord's own container renders as it always did. This plugin only
					// adds its layer beside it — `overlay` marks the one app-level call
					// site, so design previews and other surfaces are untouched.
					if (props.overlay !== true) return jsx(args[0], args[1], args[2])
					const { Fragment } = valenced.react.React
					return jsx(
						Fragment,
						{
							children: [
								jsx(args[0], args[1], 'discord-toasts'),
								jsx(ToastLayer as any, { offset: props.offset }, 'toast-api'),
							],
						},
						args[2],
					)
				}),
			)
			hostPatched = true
		} catch (error) {
			log('insteadJSX(ToastContainer) failed', error)
			return
		}
		requestNudge()
	}

	// The finder callback fires immediately when the container is already
	// initialized and once when it initializes later, so this one subscription
	// is the whole install path. The `hostPatched` guard keeps it single-shot.
	add(onImportedPath(PATHS.manaContainer, ns => patchHost(ns)))

	return () => {
		stopped = true
		for (const dispose of disposers.splice(0)) {
			try {
				dispose()
			} catch (error) {
				log('cleanup failed', error)
			}
		}
	}
}
