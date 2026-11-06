import { getAssetIdByName } from '@valenced/assets'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { store } from './config'
import { diag } from './diag'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { ButtonSettings, HideSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: ButtonSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Hide the chat bar buttons you never use, and choose whether the send button and the action buttons collapse. Changes show the next time the chat bar is drawn: switch to another chat and back if one does not.'

/** The buttons that can be hidden: the name, the icon to try, and the setting. */
const BUTTONS: Array<[name: string, icons: string[], key: keyof HideSettings]> =
	[
		['Apps & Commands', ['GameControllerIcon'], 'app'],
		['Gift', ['GiftIcon'], 'gift'],
		['New Thread', ['ThreadPlusIcon'], 'thread'],
		['Voice Message', ['MicrophoneIcon'], 'voice'],
	]

/** The icon of a row, from Discord's icons by name, if there is one. */
function iconOf(names: string[]) {
	for (const name of names) {
		const id = getAssetIdByName(name)
		if (id != null) return <Design.TableRow.Icon source={id} />
	}
	return undefined
}

/** The settings screen: which buttons to hide, how they collapse and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => store.subscribe(() => redraw(n => n + 1)), [])

	const hide = store.get('hide')
	const collapse = store.get('collapse')

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Hide Action Buttons">
					{BUTTONS.map(([name, icons, key]) => (
						<Design.TableSwitchRow
							key={key}
							icon={iconOf(icons)}
							label={`Hide ${name}`}
							value={!!hide[key]}
							onValueChange={(value: boolean) => {
								store.set({ hide: { [key]: !!value } })
								diag.log('setting', `hide ${key}: ${value ? 'on' : 'off'}`)
							}}
						/>
					))}
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Send Button Collapse Behavior">
					<Design.TableRadioGroup
						defaultValue={collapse.send ? 'collapse' : 'never'}
						onChange={(value: string) => {
							store.set({ collapse: { send: value === 'collapse' } })
							diag.log('setting', `send button: ${value}`)
						}}
					>
						<Design.TableRadioRow label="Never collapse" value="never" />
						<Design.TableRadioRow
							label="Collapse when no text"
							subLabel="Collapse the Send button when the message box is empty."
							value="collapse"
						/>
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Action Buttons Collapse Behavior (Legacy)">
					<Design.TableRadioGroup
						defaultValue={collapse.actions ? 'collapse' : 'never'}
						onChange={(value: string) => {
							store.set({ collapse: { actions: value === 'collapse' } })
							diag.log('setting', `action buttons: ${value}`)
						}}
					>
						<Design.TableRadioRow
							label="Collapse while typing"
							subLabel="Collapse action buttons when you start typing. This is now the default and desirable behavior after the Visual Refresh."
							value="collapse"
						/>
						<Design.TableRadioRow label="Never collapse" value="never" />
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
