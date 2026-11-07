import { Dispatcher } from '@valenced/discord/common/flux'
import { state } from './state'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The channels the suggested section was given, so the rows that draw them can be told apart. */
export const suggestedIds = new Set<string>()

/** The most things written down for each list in the report. */
const MAX_NOTES = 16

/** What a row that is hidden draws. */
function SuggestedRowHidden() {
	return null
}

/** The name of a component, or of what it wraps. */
function nameOf(type: unknown): string {
	let current: unknown = type
	for (let depth = 0; depth < 4 && current != null; depth++) {
		const named = current as {
			displayName?: unknown
			name?: unknown
			type?: unknown
			render?: unknown
		}
		if (typeof named.displayName === 'string' && named.displayName)
			return named.displayName
		if (typeof named.name === 'string' && named.name) return named.name
		current = named.type ?? named.render
	}
	return typeof type === 'string' ? type : 'anonymous'
}

/** The channel a row is for, if one of its usual props is a channel the suggested section was given. */
function suggestedChannelOf(
	props: Record<string, unknown>,
): string | undefined {
	const guesses = [
		props.channelId,
		props.id,
		(props.channel as { id?: unknown } | undefined)?.id,
		(props.item as { id?: unknown; channelId?: unknown } | undefined)?.id,
		(props.item as { channelId?: unknown } | undefined)?.channelId,
		(props.data as { id?: unknown } | undefined)?.id,
	]
	for (const guess of guesses)
		if (typeof guess === 'string' && suggestedIds.has(guess)) return guess
	return undefined
}

/** The names of the props of a row, with the values that cannot identify anything (true or false, and numbers). */
function describeProps(props: Record<string, unknown>): string {
	return Object.keys(props)
		.slice(0, 24)
		.map(key => {
			const value = props[key]
			return typeof value === 'boolean' || typeof value === 'number'
				? `${key}=${value}`
				: key
		})
		.join(', ')
}

/** A prop that says a row belongs to the suggestions, such as `isSuggested` or `recent`. */
function suggestedFlag(props: Record<string, unknown>): string | undefined {
	for (const key of Object.keys(props))
		if (/suggest|recent/i.test(key) && props[key]) return key
	return undefined
}

/**
 * Writes down which components draw the rows of the suggested channels and what their props are called, and hides a row that
 * says in its props that it is a suggestion. It only looks while the suggested section has been given channels.
 *
 * The report lists them, so when the rows stay on the screen the next report says which component draws them.
 */
export function installRowWatch(cleanup: Cleanup): boolean {
	const runtime = valenced.react.ReactJSXRuntime as unknown as
		| Record<string, unknown>
		| undefined
	if (!runtime || typeof runtime.jsx !== 'function') return false
	for (const key of ['jsx', 'jsxs'] as const) {
		if (typeof runtime[key] !== 'function') continue
		cleanup(
			valenced.patcher.instead(
				runtime as Record<string, (...args: unknown[]) => unknown>,
				key,
				((args: unknown[], original: (...passed: unknown[]) => unknown) => {
					try {
						const props = args[1] as Record<string, unknown> | null
						if (suggestedIds.size && props && typeof props === 'object') {
							const id = suggestedChannelOf(props)
							if (id) {
								const name = nameOf(args[0])
								const flag = suggestedFlag(props)
								const note = `${name}: ${describeProps(props)}${flag ? ` [flag ${flag}]` : ''}`
								if (state.rows.length < MAX_NOTES && !state.rows.includes(note))
									state.rows.push(note)
								if (flag && name !== 'SuggestedCategoryWithoutSuggestions') {
									state.rowsHidden++
									args[0] = SuggestedRowHidden
								}
							}
						}
					} catch {
						// Looking must never stop Discord drawing.
					}
					return original(...args)
				}) as never,
			),
		)
	}
	return true
}

/** The kinds of event worth writing down: what Discord sends about recent or suggested channels and clearing them. */
const INTERESTING = /RECENT|SUGGEST|DISMISS|CLEAR/i

/**
 * Writes down the events Discord sends that are about recent or suggested channels, with the names of their fields, so the
 * report shows what Discord itself sends when its own "clear" option is used.
 */
export function installFluxWatch(cleanup: Cleanup): void {
	const dispatcher = Dispatcher as unknown as Record<string, unknown>
	if (typeof dispatcher.dispatch !== 'function') return
	cleanup(
		valenced.patcher.before(
			dispatcher as never,
			'dispatch' as never,
			((args: [{ type?: unknown } & Record<string, unknown>]) => {
				try {
					const action = args[0]
					const type = String(action?.type ?? '')
					if (!INTERESTING.test(type)) return
					const note = `${type}: ${Object.keys(action)
						.filter(key => key !== 'type')
						.map(key => {
							const value = action[key]
							return Array.isArray(value)
								? `${key}[${value.length}]`
								: typeof value === 'boolean' || typeof value === 'number'
									? `${key}=${value}`
									: key
						})
						.join(', ')}`
					if (state.events.length < MAX_NOTES && !state.events.includes(note))
						state.events.push(note)
				} catch {
					// Looking must never stop an event.
				}
			}) as never,
		),
	)
}
