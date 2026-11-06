import { Design } from '@valenced/discord/design'
import { getModules } from '@valenced/modules/finders'
import { cloneElement, useState } from 'react'
import {
	memoOf,
	propsFilter,
	typeNameFilter,
} from '../../../shared/palmdevs/finders'
import {
	setSilentFor,
	store as settings,
	shouldBeSilent,
	silentFor,
} from './config'
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

/**
 * Adds the silent call button to DM headers and stops Discord from ringing for silent calls.
 *
 * In the originals the buttons were inside a fragment in the header. Discord 354 draws the header as a row of the call, video
 * and search buttons, so the new button goes in front of them.
 *
 * @returns What takes the patches off again.
 */
export function installSilentCall(): () => void {
	const undo: Array<() => void> = []
	let buttons = false
	let ring = false

	undo.push(
		getModules(typeNameFilter('PrivateChannelButtons'), (exports: unknown) => {
			if (buttons) return
			const memo = memoOf<(props: HeaderProps) => ReactElement | null>(exports)
			if (!memo || typeof memo.type !== 'function') {
				diag.log(
					'find',
					'PrivateChannelButtons: found, but it is not a function component',
					'warn',
				)
				return
			}
			buttons = true
			state.buttons = true
			undo.push(
				diag.apply('PrivateChannelButtons', () =>
					valenced.patcher.instead(memo, 'type', ((
						args: [HeaderProps],
						original: (props: HeaderProps) => ReactElement | null,
					) => {
						const channelId = args[0]?.channelId
						// Hooks must run on every draw, so this comes before anything that might return early.
						const [choice, setChoice] = useState<Choice>(() =>
							channelId ? silentFor(channelId) : undefined,
						)
						const header = original(...args)
						if (!header || !channelId) return header
						const children = (header.props as { children?: unknown }).children
						// Only a row of buttons has a list of children. A single button (the changelog) does not.
						if (!Array.isArray(children) || !wantsButton(channelId))
							return header
						state.toggles++
						return cloneElement(header, {
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
					}) as never),
				),
			)
		}),
	)

	undo.push(
		getModules(
			propsFilter('call', 'ring', 'stopRinging'),
			(exports: unknown) => {
				if (ring) return
				const found = exports as { default?: unknown } | null
				const callModule = [exports, found?.default].find(
					candidate =>
						!!candidate &&
						typeof (candidate as { ring?: unknown }).ring === 'function',
				) as { ring(...args: unknown[]): unknown } | undefined
				if (!callModule) return
				ring = true
				state.ring = true
				undo.push(
					diag.apply('CallActionCreators.ring', () =>
						valenced.patcher.instead(callModule, 'ring', ((
							args: [string, ...unknown[]],
							original: (...passed: unknown[]) => unknown,
						) => {
							if (!shouldBeSilent(String(args[0]))) {
								state.rang++
								return original(...args)
							}
							state.silenced++
							return undefined
						}) as never),
					),
				)
			},
		),
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
		state.ring = false
	}
}

/** Whether silent calls are on in the settings. */
export const silentCallEnabled = (): boolean =>
	!!settings.get('silentCall').enabled
