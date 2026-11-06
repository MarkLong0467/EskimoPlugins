import { Design } from '@valenced/discord/design'
import { cloneElement, useState } from 'react'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { setSilentFor, store as settings, silentFor } from './config'
import { diag } from './diag'
import { findAsset, findIcon, store, toast } from './discord'
import { state } from './state'
import type { ReactElement } from 'react'

/** What a DM header is given. */
interface HeaderProps {
	channelId?: string
}

/** The silent call choice: `true` silent, `false` rings, nothing for "follow the setting". */
type Choice = boolean | undefined

/** What each choice looks like on the button, and what tapping it says. */
const PREFERENCES: Record<
	string,
	{
		icons: string[]
		description: string
		variant: 'tertiary' | 'primary' | 'secondary'
		save(channelId: string): void
	}
> = {
	undefined: {
		icons: ['BellIcon'],
		description: 'Following the global setting for this user',
		variant: 'tertiary',
		save: channelId => setSilentFor(channelId, undefined),
	},
	true: {
		icons: ['BellZIcon', 'BellSlashIcon'],
		description: 'Calling will now silently call this user',
		variant: 'primary',
		save: channelId => setSilentFor(channelId, true),
	},
	false: {
		icons: ['PhoneCallIcon', 'BellIcon'],
		description: 'Calling will now ring this user',
		variant: 'secondary',
		save: channelId => setSilentFor(channelId, false),
	},
}

/** The next choice when the button is tapped: follow the setting, then silent, then ring, then back. */
const NEXT: Record<string, Choice> = {
	undefined: true,
	true: false,
	false: undefined,
}

/** The channel and the people in it, as far as this plugin reads them. */
interface ChannelLike {
	isPrivate?(): boolean
	getRecipientId?(): string | undefined
}

/**
 * Whether the silent call button belongs in this header.
 *
 * Calls are for DMs and group DMs. A bot has no calls, and while you are in a call the header shows hang up instead of the
 * call buttons, so there is nothing to add the button to.
 */
function wantsButton(channelId: string): boolean {
	try {
		const channel = store<{ getChannel(id: string): ChannelLike | undefined }>(
			'ChannelStore',
		)?.getChannel(channelId)
		if (!channel?.isPrivate?.()) return false
		const recipient = channel.getRecipientId?.()
		if (recipient) {
			const user = store<{
				getUser(id: string): { bot?: boolean } | undefined
			}>('UserStore')?.getUser(recipient)
			if (user?.bot) return false
		}
		const inCall = store<{ isInChannel?(id: string): boolean }>(
			'VoiceStateStore',
		)?.isInChannel?.(channelId)
		return !inCall
	} catch {
		return true
	}
}

/** The silent call button: its icon and colour show the choice for this DM, and tapping it moves to the next. */
function SilentToggle({
	channelId,
	choice,
	onChoose,
}: {
	channelId: string
	choice: Choice
	onChoose(next: Choice): void
}) {
	const preference = PREFERENCES[String(choice)] as (typeof PREFERENCES)[string]
	const Icon = findIcon(preference.icons)
	const asset = Icon ? undefined : findAsset(preference.icons)
	return (
		<Design.IconButton
			key="better-calls:silent-call-toggle"
			icon={Icon ? ((<Icon size="sm" />) as never) : ((asset ?? 0) as never)}
			accessibilityLabel="Silent call"
			variant={preference.variant}
			size="sm"
			onPress={() => {
				const next = NEXT[String(choice)]
				onChoose(next)
				const chosen = PREFERENCES[String(next)] as (typeof PREFERENCES)[string]
				chosen.save(channelId)
				toast(chosen.description)
				diag.log('silent call', `${String(next)} for a DM`)
			}}
		/>
	)
}

/** The function inside what Discord gave: the component itself, or the one a `React.memo` wraps. */
function innerFunction<P>(
	type: unknown,
): ((props: P) => ReactElement | null) | undefined {
	if (typeof type === 'function')
		return type as (props: P) => ReactElement | null
	const inner = (type as { type?: unknown } | null)?.type
	return typeof inner === 'function'
		? (inner as (props: P) => ReactElement | null)
		: undefined
}

/**
 * What a DM header draws: Discord's own buttons with the silent call button in front.
 *
 * Discord's own header is drawn first, so its hooks run on every draw. Only a row of buttons has a list of children; a
 * single button (the changelog) does not.
 */
function header(
	props: HeaderProps,
	own: (props: HeaderProps) => ReactElement | null,
): ReactElement | null {
	const channelId = props?.channelId
	// Hooks must run on every draw, so this comes before anything that might return early.
	const [choice, setChoice] = useState<Choice>(() =>
		channelId ? silentFor(channelId) : undefined,
	)
	const drawn = own(props)
	if (!drawn || !channelId) return drawn
	const children = (drawn.props as { children?: unknown }).children
	if (!Array.isArray(children) || !wantsButton(channelId)) return drawn
	state.toggles++
	return cloneElement(drawn, {
		children: [
			<SilentToggle
				key="better-calls:silent-call-toggle"
				channelId={channelId}
				choice={choice}
				onChoose={setChoice}
			/>,
			...children,
		],
	} as never)
}

/**
 * Adds the silent call button to DM headers.
 *
 * In the originals the buttons were inside a fragment in the header. Discord 354 draws the header as a row of the call, video
 * and search buttons, so the new button goes in front of them.
 *
 * The header is found by watching for `PrivateChannelButtons` to be drawn (see `jsxFind.ts`), not by searching Discord's
 * modules, which only finds modules Discord has already loaded. For each header the element is given the plugin's component,
 * which draws Discord's own header and adds the button.
 *
 * @returns What takes the patch off again.
 */
export function installSilentCall(): () => void {
	const undo: Array<() => unknown> = []
	const stand = new WeakMap<
		object,
		(props: HeaderProps) => ReactElement | null
	>()

	state.jsxButtons = installJsxFinder(
		(...fns) => {
			undo.push(...fns)
		},
		[
			{
				name: 'PrivateChannelButtons',
				seen: () => {
					state.buttons = true
					diag.log('found', 'PrivateChannelButtons was drawn')
				},
				replace: type => {
					const own = innerFunction<HeaderProps>(type)
					if (!own) return undefined
					let made = stand.get(type as object)
					if (!made) {
						made = function SilentCallHeader(props) {
							return header(props, own)
						}
						stand.set(type as object, made)
					}
					return made
				},
			},
		],
	)

	return () => {
		for (const fn of undo.splice(0)) {
			try {
				fn()
			} catch {
				// Taking a patch off must not stop the others.
			}
		}
		state.buttons = false
		state.jsxButtons = false
	}
}

/** Whether silent calls are on in the settings. */
export const silentCallEnabled = (): boolean =>
	!!settings.get('silentCall').enabled
