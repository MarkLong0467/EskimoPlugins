/**
 * The command popout: the sheet that opens when you tap a slash command in a message.
 *
 * The original (Vendetta) plugin did three nested patches: `before` on `ActionSheet.openLazy` to catch the sheet by its tag,
 * `after` on the sheet component's `default` to find `CommandActionsContainer` in what it drew, and `after` on that
 * container's `type` to put two rows in front of the list of rows. All three are kept here, but the last two are wrappers
 * around the component instead of patches on an export, because Valenced hands the sheet over as a promise of a module that
 * cannot be patched in place. The rows, their labels, the copied text and the toasts are the same.
 */

import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { Fragment } from 'react'
import { getIcon } from '../../../shared/kmmiio/lib/icons'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { state } from './state'
import { describeTree, findInReactTree, typeName } from './tree'
import type { ComponentType } from 'react'

/** The start of the tag Discord opens the command popout with. */
const POPOUT_TAG = 'ExecutedCommandPopout'

/** The name of the component that draws the rows of the popout. */
const CONTAINER_NAME = 'CommandActionsContainer'

/** The keys of the two rows, which tell a list that already has them. */
const MENTION_KEY = 'better-command-popout:mention'
const ID_KEY = 'better-command-popout:id'

/** The toast keys. */
const TOAST_MENTION = 'MARKLONG_BETTER_COMMAND_POPOUT_MENTION'
const TOAST_ID = 'MARKLONG_BETTER_COMMAND_POPOUT_ID'

/** The texts of the rows and toasts, as constants because React Native text must be passed as an expression. */
const LABEL_MENTION = 'Copy Command Mention'
const LABEL_ID = 'Copy Command ID'
const COPIED_MENTION = 'Copied command mention to clipboard'
const COPIED_ID = 'Copied command ID to clipboard'

/** How many other tags are kept for the report. */
const MAX_TAGS = 10

/** The part of a command the plugin uses. */
interface CommandData {
	id: string
	name: string
	[key: string]: unknown
}

/** A component: it gets props and returns the tree it draws. */
type Component = (props: Record<string, unknown>) => unknown

/** What Discord opens a lazy sheet with. */
type SheetModule = { default?: unknown } & Record<string, unknown>

/** Runs `fn` after the current render. Notes in the log are made here, since a note makes the settings screen redraw. */
function later(fn: () => void): void {
	setTimeout(() => {
		try {
			fn()
		} catch {
			// A note that cannot be written is not worth failing over.
		}
	}, 0)
}

/** The kinds of note already made, so a popout that is drawn again and again does not fill the log. */
const noted = new Set<string>()

/** Notes something once per kind. */
function noteOnce(
	kind: string,
	area: string,
	text: string,
	level?: 'warn' | 'error',
): void {
	if (noted.has(kind)) return
	noted.add(kind)
	later(() => diag.log(area, text, level))
}

/** Forgets what was noted once. Used when the plugin stops. */
export function resetNotes(): void {
	noted.clear()
}

/** What a command has, as the names of its fields and the kind of each. Values are never written. */
function shapeOf(command: unknown): string {
	if (command == null || typeof command !== 'object') return String(command)
	return Object.entries(command as Record<string, unknown>)
		.slice(0, 12)
		.map(
			([key, value]) =>
				`${key}:${Array.isArray(value) ? 'array' : typeof value}`,
		)
		.join(', ')
}

/** Copies text and shows the toast. Notes any failure. */
function copy(
	text: string,
	toastKey: string,
	toastText: string,
	what: string,
): void {
	try {
		Clipboard.setString(text)
		state.copied++
		openToast(
			toastKey,
			toastText,
			getIcon('CopyIcon') as ComponentType<unknown>,
		)
		later(() => diag.log('copy', `Copied the command ${what}`))
	} catch (error) {
		state.copyFailed++
		later(() => diag.fail('copy', error))
	}
}

/** The two rows, with the keys that mark them. */
function copyRows(command: CommandData) {
	return [
		<Fragment key={MENTION_KEY}>
			<Design.ActionSheetRow
				label={LABEL_MENTION}
				onPress={() => {
					state.mentionPressed++
					copy(
						`</${command.name}:${command.id}>`,
						TOAST_MENTION,
						COPIED_MENTION,
						'mention',
					)
				}}
			/>
		</Fragment>,
		<Fragment key={ID_KEY}>
			<Design.ActionSheetRow
				label={LABEL_ID}
				onPress={() => {
					state.idPressed++
					copy(command.id, TOAST_ID, COPIED_ID, 'ID')
				}}
			/>
		</Fragment>,
	]
}

/** Whether a node is the list of rows of the popout: an array whose first item wraps a `TableRow`. */
const isRows = (node: unknown): boolean =>
	Array.isArray(node) &&
	typeName(
		(node[0] as { props?: { children?: { type?: unknown } } } | undefined)
			?.props?.children?.type,
	) === 'TableRow'

/** Puts the two rows in front of the rows of what the container drew. */
function addRows(command: CommandData | undefined, drawn: unknown): void {
	if (!command?.id || !command.name) {
		state.noCommand++
		noteOnce(
			'nocommand',
			'container',
			`The container had no command to copy (it had: ${shapeOf(command)})`,
			'warn',
		)
		return
	}
	if (!state.commandShape) state.commandShape = shapeOf(command)

	const rows = findInReactTree<unknown[]>(drawn, isRows)
	if (!rows) {
		state.rowsMissing++
		noteOnce(
			'norows',
			'container',
			`The list of rows was not found. Discord drew: ${describeTree(drawn)}`,
			'error',
		)
		return
	}
	state.rowsFound++

	// A list that is kept between draws would get the rows again each time.
	const first = rows[0] as { key?: unknown } | undefined
	if (first && (first.key === MENTION_KEY || first.key === ID_KEY)) return
	rows.unshift(...copyRows(command))
	state.added++
	noteOnce('added', 'container', 'Added the copy rows to the command popout')
}

/** The wrapped containers, so the same one is used every time and React keeps it between draws. */
const containers = new WeakMap<object, Component>()

/** A copy of `CommandActionsContainer` that adds the rows to what it draws. */
function wrapContainer(Original: Component): Component {
	let made = containers.get(Original)
	if (!made) {
		const Wrapped: Component = props => {
			state.containerDraws++
			const drawn = Original(props)
			try {
				addRows(props?.data as CommandData | undefined, drawn)
			} catch (error) {
				later(() => diag.fail('container', error))
			}
			return drawn
		}
		Object.defineProperty(Wrapped, 'name', { value: CONTAINER_NAME })
		made = Wrapped
		containers.set(Original, made)
	}
	return made
}

/** Finds the container in what the sheet drew and swaps in the wrapped one. */
function patchSheetTree(drawn: unknown): void {
	const container = findInReactTree<{ type: unknown }>(
		drawn,
		node =>
			!Array.isArray(node) &&
			typeName((node as { type?: unknown })?.type) === CONTAINER_NAME,
	)
	if (!container || typeof container.type !== 'function') {
		state.containerMissing++
		noteOnce(
			'nocontainer',
			'sheet',
			`${CONTAINER_NAME} was not found. Discord drew: ${describeTree(drawn)}`,
			'error',
		)
		return
	}
	state.containerFound++
	container.type = wrapContainer(container.type as Component)
}

/** The wrapped sheets, for the same reason as the containers. */
const sheets = new WeakMap<object, Component>()

/** A copy of the popout's sheet that finds the container in what it draws. */
function wrapSheet(Original: Component): Component {
	let made = sheets.get(Original)
	if (!made) {
		const Wrapped: Component = props => {
			state.sheetDraws++
			const drawn = Original(props)
			try {
				patchSheetTree(drawn)
			} catch (error) {
				later(() => diag.fail('sheet', error))
			}
			return drawn
		}
		made = Wrapped
		sheets.set(Original, made)
	}
	return made
}

/** Remembers tags that look like a command popout but are not the one the plugin knows. */
function noteSimilarTag(tag: string): void {
	if (!/command|popout/i.test(tag)) return
	if (state.similarTags.includes(tag) || state.similarTags.length >= MAX_TAGS)
		return
	state.similarTags.push(tag)
	later(() =>
		diag.log('tag', `A sheet with a similar tag was opened: ${tag}`, 'warn'),
	)
}

/** Gives a lazy sheet's promise a version whose component is wrapped. */
function wrapLoad(load: PromiseLike<SheetModule>): PromiseLike<SheetModule> {
	return load.then(module => {
		const Sheet = module?.default
		if (typeof Sheet !== 'function') {
			noteOnce(
				'notfunction',
				'sheet',
				`The popout's sheet is not a plain component (it is ${typeName(Sheet)})`,
				'error',
			)
			return module
		}
		state.wrapped++
		return { ...module, default: wrapSheet(Sheet as Component) }
	})
}

/**
 * Hooks `openLazy` so the command popout opens with its sheet wrapped.
 *
 * @returns What removes the hook.
 */
export function installPopoutPatch(): () => void {
	return diag.apply('openLazy', () => {
		const unpatch = valenced.patcher.before(
			ActionSheetActionCreators as unknown as Record<
				string,
				(...args: unknown[]) => unknown
			>,
			'openLazy',
			(args: unknown[]) => {
				try {
					const [load, tag] = args as [
						PromiseLike<SheetModule> | undefined,
						unknown,
					]
					if (typeof tag !== 'string') return args
					if (!tag.startsWith(POPOUT_TAG)) {
						noteSimilarTag(tag)
						return args
					}
					state.opened++
					if (!load || typeof load.then !== 'function') {
						noteOnce(
							'noload',
							'openLazy',
							'The popout was opened without a promise of a sheet',
							'error',
						)
						return args
					}
					return [wrapLoad(load), ...args.slice(1)]
				} catch (error) {
					later(() => diag.fail('openLazy', error))
					return args
				}
			},
		)
		state.hooked = true
		return () => {
			state.hooked = false
			unpatch()
		}
	})
}
