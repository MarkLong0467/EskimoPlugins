import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { minutes, minutesText, nextMinutes, store } from './config'
import { diag } from './diag'
import { findAsset } from './discord'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { SaverSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: SaverSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'When you mute in a call, Discord only stops sending your voice: your mic keeps recording and every sound still goes through noise cancellation and the rest of the voice processing. When you deafen, everyone’s cameras still come in. This plugin cuts that work while you are muted or deafened, and can remind you (or leave the call) if you stay that way too long.'
const MUTED_NOTE =
	'Skipping Krisp uses an option Discord built into its voice engine but has not turned on for everyone yet. Pausing all processing saves more, but your voice can sound slightly off for a second or two after you unmute while echo cancellation settles again.'
const DEAFENED_NOTE =
	'Cameras paused this way are not saved: they come back when you undeafen. Screen shares are not touched.'
const TIMER_NOTE =
	'Tap a row to change the time. Toasts only show while Discord is open, but the vibration also works in the background.'

/** The icon of a row, from Discord's icons by name, if there is one. */
function iconOf(names: string[]) {
	const id = findAsset(names)
	return id != null ? <Design.TableRow.Icon source={id} /> : undefined
}

/** The settings screen. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])

	const toggle =
		(key: 'skipKrisp' | 'pauseProcessing' | 'pauseVideo') =>
		(value: boolean) => {
			store.set({ [key]: !!value })
			diag.log('setting', `${key} ${value ? 'on' : 'off'}`)
		}
	const remind = minutes('remindMinutes')
	const leave = minutes('leaveMinutes')
	const what =
		store.get('timerWhen') === 'muted' ? 'muted or deafened' : 'deafened'

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="While muted" description={MUTED_NOTE}>
					<Design.TableSwitchRow
						icon={iconOf(['MicrophoneSlashIcon', 'ic_mic_muted_neutral'])}
						label="Skip Krisp while muted"
						subLabel="Noise cancellation is the heaviest part of the mic processing. No downside."
						value={!!store.get('skipKrisp')}
						onValueChange={toggle('skipKrisp')}
					/>
					<Design.TableSwitchRow
						icon={iconOf(['SettingsIcon', 'ic_settings'])}
						label="Pause all mic processing while muted"
						subLabel="Also turns off echo cancellation, noise suppression and gain control, and puts your settings back when you unmute."
						value={!!store.get('pauseProcessing')}
						onValueChange={toggle('pauseProcessing')}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup
					title="While deafened"
					description={DEAFENED_NOTE}
				>
					<Design.TableSwitchRow
						icon={iconOf(['VideoSlashIcon', 'ic_video_disabled'])}
						label="Pause other people’s cameras"
						subLabel="Receiving and showing video uses far more battery than voice."
						value={!!store.get('pauseVideo')}
						onValueChange={toggle('pauseVideo')}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Timers" description={TIMER_NOTE}>
					<Design.TableRow
						icon={iconOf(['BellIcon', 'ic_notif'])}
						label="Remind me after"
						subLabel={
							remind
								? `A toast and a vibration after ${minutesText(remind)} ${what}`
								: 'Off'
						}
						onPress={() => {
							const next = nextMinutes(remind)
							store.set({ remindMinutes: next })
							diag.log('setting', `remind after ${next} min`)
						}}
					/>
					<Design.TableRow
						icon={iconOf(['PhoneHangUpIcon', 'ic_call_ended'])}
						label="Leave the call after"
						subLabel={
							leave
								? `Leaves the call after ${minutesText(leave)} ${what}`
								: 'Off'
						}
						onPress={() => {
							const next = nextMinutes(leave)
							store.set({ leaveMinutes: next })
							diag.log('setting', `leave after ${next} min`)
						}}
					/>
					<Design.TableSwitchRow
						icon={iconOf(['MicrophoneIcon', 'ic_mic_neutral'])}
						label="Count while muted too"
						subLabel="Off: the timers only count while you are deafened."
						value={store.get('timerWhen') === 'muted'}
						onValueChange={(value: boolean) => {
							store.set({ timerWhen: value ? 'muted' : 'deafened' })
							diag.log(
								'setting',
								`timers count while ${value ? 'muted' : 'deafened'}`,
							)
						}}
					/>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
