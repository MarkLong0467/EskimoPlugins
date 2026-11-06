import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import {
	getAudioDeviceDisplayText,
	getAudioDeviceIcon,
	getAudioDevices,
	setAudioOutputDevice,
} from './audio'
import { setDevice, store } from './config'
import { diag } from './diag'
import { DEVICE_SHEET_KEY, sheets } from './discord'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Select Preferred Audio Output Device'
const NO_DEVICES = 'No audio output devices were found on this phone.'
const FROM_CALL_HELP =
	'Alternatively, you can swipe up the dock and use the Change Audio Output option.'

/** What the sheet is opened with. */
export interface AudioSheetProps {
	/** Called after a device is chosen. */
	onPress?: () => void
	/** Whether the sheet was opened from the voice call screen, which adds a hint. */
	fromVoiceCall?: boolean
}

/** Opens the sheet that chooses the preferred audio output device. */
export function openAudioSheet(props: AudioSheetProps): void {
	try {
		sheets().openLazy(
			Promise.resolve({ default: () => <AudioSheet {...props} /> }),
			DEVICE_SHEET_KEY,
			{},
		)
	} catch (error) {
		diag.fail('audio sheet', error)
	}
}

/** The sheet: the phone's audio output devices, with the preferred one chosen. */
function AudioSheet({ onPress, fromVoiceCall }: AudioSheetProps) {
	const devices = getAudioDevices()
	const [chosen, setChosen] = useState(
		String(store.get('rememberOutputDevice').device?.deviceId ?? ''),
	)

	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 12 }}>
				<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
				{devices.length === 0 ? (
					<Design.Text variant="text-md/medium" color="text-muted">
						{NO_DEVICES}
					</Design.Text>
				) : (
					<Design.TableRadioGroup
						title="Audio Devices"
						defaultValue={chosen}
						onChange={(deviceId: string) => {
							const device = devices.find(d => String(d.deviceId) === deviceId)
							if (!device) return
							setChosen(deviceId)
							setDevice(device)
							setAudioOutputDevice(device)
							diag.log('device', `chose ${device.simpleDeviceType}`)
							onPress?.()
						}}
					>
						{devices.map(device => {
							const icon = getAudioDeviceIcon(device.simpleDeviceType)
							return (
								<Design.TableRadioRow
									key={String(device.deviceId)}
									icon={
										icon != null ? (
											<Design.TableRow.Icon source={icon} />
										) : undefined
									}
									label={getAudioDeviceDisplayText(device)}
									subLabel={device.deviceName}
									value={String(device.deviceId)}
								/>
							)
						})}
					</Design.TableRadioGroup>
				)}
				{fromVoiceCall ? (
					<Design.Text variant="text-xs/normal" color="text-muted">
						{FROM_CALL_HELP}
					</Design.Text>
				) : null}
			</View>
		</Design.ActionSheet>
	)
}
