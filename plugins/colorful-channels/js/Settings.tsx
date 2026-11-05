import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { ColorfulChannelsSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ColorfulChannelsSettings }>
>

/**
 * The settings screen: three switches and a credit line. A switch saves at once. The new value applies the next time
 * the channel list is drawn, which is why the credit line says to open the chat list again.
 */
export default function Settings({ api }: Props) {
	const storage = api.jsonStorage
	// The storage is also handed to the patches, so they read the settings that are being edited here.
	setStorage(storage)
	const settings = { ...DEFAULT_SETTINGS, ...(storage.use() ?? {}) }

	/** One switch row, saved under `key`. */
	const toggle = (
		key: keyof ColorfulChannelsSettings,
		label: string,
		subLabel: string,
	) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={!!settings[key]}
			onValueChange={value => storage.set({ [key]: value })}
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
				<Design.TableRowGroup title="Channels">
					{toggle(
						'nsfwTag',
						'NSFW tag',
						'Adds a red NSFW tag next to channel names',
					)}
					{toggle(
						'colorIcons',
						'Colored icon symbols',
						'Turns locked channel symbols yellow, NSFW channel symbols red',
					)}
					{toggle(
						'colorIconsFallback',
						'Fallback colors for icon symbols',
						'Uses yellow, red and green regardless of theme',
					)}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="About">
					<Design.TableRow
						key="credit"
						label="Credit"
						subLabel="Based on Colorful Channels from NexxUtils by nexpid. Open the chat list again to see changes."
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
