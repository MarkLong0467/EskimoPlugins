import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { RawViewerSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: RawViewerSettings }>
>

const RAW_TITLE = 'RAW files'
const INFO_TITLE = 'Picture info'
const PRIVACY_TITLE = 'Privacy'
const PRIVACY_TEXT =
	'The map is one picture loaded from OpenStreetMap, which then sees the place. Turn it off to open Google Maps only when you tap.'

/** The settings screen: a switch for each feature. A switch is on unless it was turned off, and a change is saved at once. */
export default function Settings({ api }: Props) {
	const json = api.jsonStorage
	setStorage(json)
	const settings = { ...DEFAULT_SETTINGS, ...(json.use() ?? {}) }

	const toggle = (
		key: keyof RawViewerSettings,
		label: string,
		subLabel: string,
	) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={settings[key] !== false}
			onValueChange={(value: boolean) =>
				json.set({ [key]: value } as Partial<RawViewerSettings>)
			}
		/>
	)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title={RAW_TITLE}>
					{toggle(
						'convertRaw',
						'Show RAW files as photos',
						'Nikon, Canon, Sony, Fujifilm, Olympus, Panasonic, Pentax, DNG and more. Needs a reload to turn off.',
					)}
					{toggle(
						'renderOnDemand',
						'Render only when I ask',
						'RAW files stay files until you hold the message and tap Render RAW photo',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title={INFO_TITLE}>
					{toggle(
						'infoButton',
						'Info button',
						'An i button on every picture in the viewer',
					)}
					{toggle(
						'swipeUp',
						'Swipe up for info',
						'Swipe up on the handle at the bottom of the viewer',
					)}
					{toggle(
						'mapPreview',
						'Map preview',
						'Show a map when the picture has a place',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title={PRIVACY_TITLE}>
					<Design.TableRow label="Map" subLabel={PRIVACY_TEXT} />
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
