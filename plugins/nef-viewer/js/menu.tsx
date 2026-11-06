import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { after } from '@valenced/patcher'
import { cloneElement, createElement } from 'react'
import { setting } from './config'
import {
	COPY_LABELS,
	RENDER_ICONS,
	RENDER_LABEL,
	TARGET_MAX_AGE_MS,
} from './constants'
import { asset } from './discord'
import { hasUnrenderedRaw, renderMessage } from './queue'
import type { ReactElement } from 'react'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** The message the menu on screen is for, as last noticed. */
let target: { channelId: string; messageId: string; at: number } | null = null

/** A row of the menu: an element that has a text label. */
type Row = ReactElement<Record<string, unknown>>

/** Notes which message a piece of the menu is about, from its props. */
function noteTarget(props: Record<string, unknown>): void {
	const message = props.message as
		| { id?: unknown; channel_id?: unknown; channelId?: unknown }
		| undefined
	const channel = props.channel as { id?: unknown } | undefined
	if (
		typeof props.messageId === 'string' &&
		typeof props.channelId === 'string'
	) {
		target = {
			channelId: props.channelId,
			messageId: props.messageId,
			at: Date.now(),
		}
		return
	}
	if (!message || typeof message !== 'object' || typeof message.id !== 'string')
		return
	const channelId = [
		message.channel_id,
		message.channelId,
		channel?.id,
		props.channelId,
	].find(id => typeof id === 'string') as string | undefined
	if (channelId) target = { channelId, messageId: message.id, at: Date.now() }
}

/** Whether something is a row of the menu (an element with a text `label`). */
function isRow(value: unknown): value is Row {
	const props = (
		value as { props?: Record<string, unknown> } | null | undefined
	)?.props
	return !!props && typeof props.label === 'string'
}

/** Adds "Render RAW photo" to the box of the message menu that holds the copy rows, for a message with RAW files not rendered yet. */
function decorateRows(
	group: ReactElement<Record<string, unknown>>,
): ReactElement {
	const children = group.props.children
	const kept = Array.isArray(children) ? children.flat() : [children]
	const rows = kept.filter(isRow)
	if (rows.length < 2 || rows.some(row => row.props.label === RENDER_LABEL))
		return group
	const template = rows.find(row =>
		COPY_LABELS.includes(row.props.label as string),
	)
	if (
		!template ||
		!rows.every(
			row =>
				typeof row.props.onPress === 'function' ||
				row.props.onPress === undefined,
		)
	)
		return group
	if (!target || Date.now() - target.at > TARGET_MAX_AGE_MS) return group

	const message = { ...target }
	if (!hasUnrenderedRaw(message.channelId, message.messageId)) return group

	const iconId = RENDER_ICONS.map(asset).find(id => id != null)
	let lastPress = 0
	const row = createElement(template.type as never, {
		...template.props,
		key: 'raw-viewer-render',
		label: RENDER_LABEL,
		subLabel: undefined,
		icon:
			iconId != null
				? createElement(Design.TableRow.Icon, { source: iconId })
				: undefined,
		onPress: () => {
			// One tap can reach more than one handler, so only the first one counts.
			if (Date.now() - lastPress < 1500) return
			lastPress = Date.now()
			try {
				ActionSheetActionCreators.hideAllActionSheets()
			} catch {
				// No sheet was open.
			}
			renderMessage(message.channelId, message.messageId)
		},
	})
	return cloneElement(group, {} as never, [...kept, row] as never)
}

/** Looks at every element Discord creates: notes the message it is about and, in the message menu, adds the row. */
function onNewElement(drawn: unknown): unknown {
	try {
		const element = drawn as
			| ReactElement<Record<string, unknown>>
			| null
			| undefined
		const props = element?.props
		if (!element || !props) return drawn
		noteTarget(props)
		if (
			setting('renderOnDemand') &&
			setting('convertRaw') &&
			props.children &&
			typeof props.children === 'object'
		)
			return decorateRows(element)
		return drawn
	} catch {
		return drawn
	}
}

/** Patches the JSX runtime so every element Discord creates passes through `onNewElement`. */
export function installMenuHook(cleanup: Cleanup): void {
	const runtime =
		(lookupModule(withProps('jsx', 'jsxs'))[0] as
			| Record<string, unknown>
			| undefined) ||
		(valenced.react.ReactJSXRuntime as unknown as Record<string, unknown>)
	for (const name of ['jsx', 'jsxs']) {
		if (runtime && typeof runtime[name] === 'function')
			cleanup(
				after(
					runtime as Record<string, (...args: unknown[]) => unknown>,
					name,
					onNewElement as never,
				),
			)
	}
	cleanup(() => {
		target = null
	})
}
