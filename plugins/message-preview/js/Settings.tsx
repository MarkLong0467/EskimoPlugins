import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { PreviewSettings } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const BUTTON_TITLE = 'Button type'
const PREVIEW_TITLE = 'Preview type'
const ABOUT_TITLE = 'About'
const CREDIT_LABEL = 'Credit'
const CREDIT_TEXT = 'Based on Message Preview for Revenge by nexpid and pylix.'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: PreviewSettings }>
>

/** One choice of a group: its value, name and a line under the name. */
interface Choice<T> {
	value: T
	label: string
	subLabel: string
}

const BUTTON_CHOICES: Choice<PreviewSettings['buttonType']>[] = [
	{
		value: 'pill',
		label: 'Floating pill',
		subLabel:
			'A button over the message box that shows when you have typed something',
	},
	{ value: 'send', label: 'Send button', subLabel: 'Holding the send button' },
]

const PREVIEW_CHOICES: Choice<PreviewSettings['previewType']>[] = [
	{
		value: 'popup',
		label: 'Popup',
		subLabel: 'Shown in a window on top of the chat',
	},
	{
		value: 'ephemeral',
		label: 'Ephemeral message',
		subLabel: 'Shown in the chat, only to you',
	},
]

/**
 * The settings screen: where the preview button is, how the preview is shown, and a credit.
 * A choice is saved the moment it is tapped.
 */
export default function Settings({ api }: Props) {
	const json = api.jsonStorage
	setStorage(json)
	const settings = { ...DEFAULT_SETTINGS, ...(json.use() ?? {}) }

	/** A group of radio rows that saves the chosen value under `key`. */
	const radio = <K extends keyof PreviewSettings>(
		title: string,
		key: K,
		choices: Choice<PreviewSettings[K]>[],
	) => (
		<Design.TableRadioGroup
			title={title}
			value={settings[key]}
			onChange={(value: PreviewSettings[K]) =>
				json.set({ [key]: value } as Partial<PreviewSettings>)
			}
		>
			{choices.map(choice => (
				<Design.TableRadioRow
					key={choice.value}
					label={choice.label}
					subLabel={choice.subLabel}
					value={choice.value}
				/>
			))}
		</Design.TableRadioGroup>
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
				{radio(BUTTON_TITLE, 'buttonType', BUTTON_CHOICES)}
				{radio(PREVIEW_TITLE, 'previewType', PREVIEW_CHOICES)}
				<Design.TableRowGroup title={ABOUT_TITLE}>
					<Design.TableRow
						key="credit"
						label={CREDIT_LABEL}
						subLabel={CREDIT_TEXT}
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
