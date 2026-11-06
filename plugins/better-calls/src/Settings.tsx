import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openAudioSheet } from './AudioSheet'
import { getAudioDeviceDisplayText, getAudioDeviceIcon } from './audio'
import { resetSilent, store } from './config'
import { diag } from './diag'
import { findAsset, toast } from './discord'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { CallSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CallSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Two things for calls. Silent Call adds a bell button to the top of a DM: tap it to choose whether calling that person rings them. Remember Audio Output Device keeps the speaker, Bluetooth or earpiece you picked for every call.'
const SILENT_NOTE =
	'You may need to switch between DMs and servers for the changes to take effect. This is because Discord caches rendered components.'
const DEVICE_NOTE_1 =
	'If your device is not persistent, the first device will be selected after the preferred device is removed.'
const DEVICE_NOTE_2 =
	'This also replaces the audio output device selection sheet, which means it may be missing features such as transferring voice chats to a console. Alternatively, you can swipe up the dock in the voice call screen and use the Change Audio Output option.'

/** The icon of a row, from Discord's icons by name, if there is one. */
function iconOf(names: string[]) {
	const id = findAsset(names)
	return id != null ? <Design.TableRow.Icon source={id} /> : undefined
}

/** The settings screen: silent calls, the audio output device and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])

	const silent = store.get('silentCall')
	const remember = store.get('rememberOutputDevice')
	const device = remember.device
	const deviceIcon = getAudioDeviceIcon(device?.simpleDeviceType)
	const choices = Object.keys(silent.users ?? {}).length

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Silent Call" description={SILENT_NOTE}>
					<Design.TableSwitchRow
						icon={iconOf(['BellSlashIcon', 'ic_notif_off'])}
						label="Enable Silent Call"
						subLabel="Silently call someone without ringing, configurable per user."
						value={!!silent.enabled}
						onValueChange={(value: boolean) => {
							store.set({ silentCall: { enabled: !!value } })
							diag.log('setting', `silent call ${value ? 'on' : 'off'}`)
						}}
					/>
					<Design.TableSwitchRow
						icon={iconOf(['PhoneHangUpIcon', 'ic_call_ended'])}
						label="Ring by default"
						subLabel="Ring people by default unless you set otherwise. This will affect unset preferences."
						value={!silent.default}
						onValueChange={(value: boolean) => {
							store.set({ silentCall: { default: !value } })
							diag.log('setting', `ring by default ${value ? 'on' : 'off'}`)
						}}
					/>
					<Design.TableRow
						variant="danger"
						icon={iconOf(['TrashIcon', 'ic_message_delete'])}
						label="Reset preferences"
						subLabel={`Reset all silent call preferences, this will make you ring people by default again. ${choices} saved.`}
						onPress={() => {
							resetSilent()
							toast('Silent call preferences have been reset')
							diag.log('setting', 'silent call preferences reset')
						}}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup
					title="Remember Audio Output Device"
					description={DEVICE_NOTE_1}
				>
					<Design.TableSwitchRow
						icon={iconOf(['SpeakerIcon', 'voice_bar_speaker_new'])}
						label="Remember audio output device"
						subLabel="Remembers your audio output device preferences."
						value={!!remember.enabled}
						onValueChange={(value: boolean) => {
							store.set({ rememberOutputDevice: { enabled: !!value } })
							diag.log('setting', `remember device ${value ? 'on' : 'off'}`)
						}}
					/>
					<Design.TableRow
						disabled={!remember.enabled}
						icon={
							deviceIcon != null ? (
								<Design.TableRow.Icon source={deviceIcon} />
							) : undefined
						}
						label="Current device"
						subLabel={
							device
								? `${device.deviceName} - ${getAudioDeviceDisplayText(device)}`
								: 'No device'
						}
						arrow
						onPress={() =>
							openAudioSheet({ onPress: () => redraw(n => n + 1) })
						}
					/>
				</Design.TableRowGroup>
				<Design.Text
					variant="text-xs/normal"
					color="text-muted"
					style={{ paddingHorizontal: 16 }}
				>
					{DEVICE_NOTE_2}
				</Design.Text>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
