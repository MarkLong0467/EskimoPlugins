import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS, DELAY_CHOICES } from './constants'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { TextReactSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: TextReactSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const GENERAL = 'General'
const DELAY_TITLE = 'Pause between reactions'
const ABOUT = 'About'
const HOW =
	'Hold a message and tap Text React. Type some text and it is added to the message as reactions, one at a time. Discord holds at most 20 different reactions on a message.'
const CREDIT =
	'Ported from TextReact for Aliucord by ArjixWasTaken, which is based on text-react by Juby210.'

/**
 * The settings screen: whether "Text React" is in the message menu, whether to warn when part of the text has no emoji,
 * and how long to wait between reactions. A change is saved the moment it is made.
 */
export default function Settings({ api }: Props) {
	const json = api.jsonStorage
	setStorage(json)
	const settings = { ...DEFAULT_SETTINGS, ...(json.use() ?? {}) }

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title={GENERAL}>
					<Design.TableSwitchRow
						key="menu"
						label="Show in the message menu"
						subLabel="Adds Text React when you hold a message"
						value={settings.menu !== false}
						onValueChange={(value: boolean) => json.set({ menu: value })}
					/>
					<Design.TableSwitchRow
						key="animate"
						label="Opening animation"
						subLabel="Turn off to make the sheet pop up at once, which helps if it lags"
						value={settings.animate !== false}
						onValueChange={(value: boolean) => json.set({ animate: value })}
					/>
					<Design.TableSwitchRow
						key="warn"
						label="Warn about missing emoji"
						subLabel="Ask first when part of the text has no emoji"
						value={settings.warn !== false}
						onValueChange={(value: boolean) => json.set({ warn: value })}
					/>
				</Design.TableRowGroup>
				<Design.TableRadioGroup
					title={DELAY_TITLE}
					value={String(settings.delaySeconds)}
					onChange={(value: string) => json.set({ delaySeconds: value })}
				>
					{DELAY_CHOICES.map(seconds => (
						<Design.TableRadioRow
							key={seconds}
							label={`${seconds} second${seconds === '1' ? '' : 's'}`}
							subLabel={seconds === '1' ? 'The default' : undefined}
							value={seconds}
						/>
					))}
				</Design.TableRadioGroup>
				<Design.TableRowGroup title={ABOUT}>
					<Design.TableRow key="how" label="How to use it" subLabel={HOW} />
					<Design.TableRow key="credit" label="Credit" subLabel={CREDIT} />
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
