import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { SpotifySettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: SpotifySettings }>
>

/** The texts of the screen. Constants because React Native text must be passed as an expression. */
const LISTEN_TITLE = 'Listen along'
const SEND_TITLE = 'Send options'
const WHERE_TITLE = 'Where it shows up'
const ABOUT_TITLE = 'About'
const NEEDS_TEXT =
	'Spotify must be linked to Discord. Listening along needs Spotify Premium and Spotify open on your phone.'
const CREDIT_TEXT = "Based on nexpid's NexxUtils for Revenge."

/**
 * The settings screen: a switch for the Listen along button, for each send option, and for the + menu. A switch is on
 * unless it was turned off, and a change is saved the moment it is made.
 */
export default function Settings({ api }: Props) {
	const json = api.jsonStorage
	setStorage(json)
	const settings = { ...DEFAULT_SETTINGS, ...(json.use() ?? {}) }

	const toggle = (
		key: keyof SpotifySettings,
		label: string,
		subLabel: string,
	) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={settings[key] !== false}
			onValueChange={(value: boolean) =>
				json.set({ [key]: value } as Partial<SpotifySettings>)
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
				<Design.TableRowGroup title={LISTEN_TITLE}>
					{toggle(
						'listenAlong',
						'Listen along button',
						"Adds a button next to Play on Spotify on other people's Spotify activity",
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title={SEND_TITLE}>
					{toggle(
						'sendInvite',
						'Send listen along',
						'The invite card for the song you are playing',
					)}
					{toggle(
						'sendSongLink',
						'Send song link',
						'A link to the song you are playing',
					)}
					{toggle(
						'sendAlbumLink',
						'Send playing album',
						'A link to the album you are playing',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title={WHERE_TITLE}>
					{toggle(
						'plusMenu',
						'+ menu',
						'Adds the send options to the menu you get when you tap + next to the message box',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title={ABOUT_TITLE}>
					<Design.TableRow
						key="needs"
						label="Before you start"
						subLabel={NEEDS_TEXT}
					/>
					<Design.TableRow key="credit" label="Credit" subLabel={CREDIT_TEXT} />
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
