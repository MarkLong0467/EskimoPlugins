import { Design } from '@valenced/discord/design'
import { onFluxEventDispatched } from '@valenced/discord/flux'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { mySpotifyActivity, userIdOf } from './activity'
import { enabled } from './config'
import { SPINNER_AFTER_MS, SPINNER_MAX_MS } from './constants'
import { findIcon, store } from './discord'
import { listen } from './listen'
import type { ReactNode } from 'react'
import type { SpotifyActivity, UserStore } from './types'

/** Why the button can't be used right now, or false when it can. */
function disabledReason(
	activity: SpotifyActivity,
	userId: string,
): string | false {
	const self = store<UserStore>('UserStore')?.getCurrentUser()
	const mine = mySpotifyActivity()
	if (self && self.id === userId)
		return 'Listen along with someone else, not yourself.'
	if (mine?.party?.id && mine.party.id === activity.party?.id)
		return "You're already along for this ride."
	return false
}

interface Props {
	/** Discord's own "Play on Spotify" button, drawn next to the new one. */
	button: ReactNode
	/** The other person's Spotify activity. */
	activity: SpotifyActivity
}

/**
 * The Listen along button, drawn beside Discord's own Play on Spotify button.
 *
 * It is an icon button (or a text button if no icon is found) that is dimmed when it cannot be used; tapping it then
 * says why. While it starts it shows a spinner. It draws itself again whenever Spotify's player changes, because "you
 * are already along" depends on that.
 */
function ListenButton({ button, activity }: Props) {
	const [, setTick] = useState(0)
	const [loadingNow, setLoading] = useState(false)
	useEffect(
		() =>
			onFluxEventDispatched('SPOTIFY_PLAYER_STATE', payload => {
				setTimeout(() => setTick(n => n + 1), 0)
				return payload
			}),
		[],
	)

	const userId = userIdOf(activity)
	const reason = userId ? disabledReason(activity, userId) : 'No listener found'
	const loading = loadingNow && !reason
	const Icon = findIcon(['UserPlayIcon', 'MusicIcon', 'PlayIcon'])

	const press = () => {
		if (loading) return
		const started = listen(reason, activity, userId)
		if (started) {
			setLoading(true)
			const done = () => setLoading(false)
			Promise.resolve(started).then(
				() => setTimeout(done, SPINNER_AFTER_MS),
				done,
			)
			setTimeout(done, SPINNER_MAX_MS)
		}
	}

	const control = Icon ? (
		<Design.IconButton
			size="md"
			variant="secondary"
			loading={loading}
			icon={(<Icon size="sm" />) as never}
			accessibilityLabel="Listen along"
			onPress={press}
			style={reason ? { opacity: 0.5 } : undefined}
		/>
	) : (
		<Design.Button
			size="md"
			variant="secondary"
			text="Along"
			loading={loading}
			onPress={press}
		/>
	)

	return (
		<View style={{ flexDirection: 'row', flex: 1, alignItems: 'stretch' }}>
			<View style={{ paddingRight: 6 }}>{control}</View>
			<View style={{ flex: 1, minWidth: 0 }}>{button}</View>
		</View>
	)
}

/** Finds the Spotify activity in whatever props the button received. */
function activityFrom(props: unknown): SpotifyActivity | undefined {
	const value = props as
		| (SpotifyActivity & { activity?: SpotifyActivity })
		| undefined
	if (!value) return undefined
	if (userIdOf(value.activity)) return value.activity
	if (userIdOf(value)) return value
	if (value.party && userIdOf(value.party as { party?: { id?: string } }))
		return value.party as SpotifyActivity
	return undefined
}

/**
 * Puts the Listen along button beside Discord's Play on Spotify button.
 *
 * @param ret The element Discord's button drew.
 * @param props The props of that button; the activity is found in them.
 * @returns The element with the new button, or `ret` unchanged if the setting is off or no activity is found.
 */
export function decorateListen(ret: unknown, props: unknown): unknown {
	if (!ret || !enabled('listenAlong')) return ret
	const activity = activityFrom(props)
	return activity ? (
		<ListenButton button={ret as ReactNode} activity={activity} />
	) : (
		ret
	)
}
