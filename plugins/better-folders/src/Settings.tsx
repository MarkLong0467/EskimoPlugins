import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { getFolders, isExpanded, storesReachable } from './folders'
import { state } from './state'
import { isOn, store } from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { FolderSettings } from './store'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: FolderSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Two small things for the server bar. Hide icons shows the plain folder icon on a collapsed folder instead of little pictures of the servers inside it. Auto collapse closes the other open folders when you open one. Both start off. They work as soon as you switch them, you can look at the server bar to see.'
const TOAST_KEY = 'MARKLONG_BETTER_FOLDERS'

/** The headline: how it is going. */
function headline(): { label: string; detail: string } {
	if (state.dispatcher === 'failed')
		return {
			label: 'Something is not working',
			detail:
				'Auto collapse could not start. Press Copy logs below and send the report.',
		}
	if (state.unexpected > 0)
		return {
			label: 'Hide icons cannot swap the folders',
			detail:
				'Discord draws its folders differently now. Press Copy logs below and send the report.',
		}
	if (state.folderSeen === 0)
		return {
			label: 'Ready',
			detail:
				'Look at the server bar so the plugin can find your folders. It is on from then.',
		}
	return {
		label: 'Working',
		detail: 'The switches below apply straight away.',
	}
}

/** The settings screen: the two switches, your folders, and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopDiag()
		}
	}, [])

	const status = headline()
	const folders = storesReachable() ? getFolders() : []
	const open = folders.filter(
		folder => folder.folderId != null && isExpanded(folder.folderId),
	).length

	const flip = (key: keyof FolderSettings, on: boolean, text: string) => {
		store.set({ [key]: on })
		diag.log('settings', `${key} ${on ? 'on' : 'off'}`)
		openToast(TOAST_KEY, text)
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={24}>
				<IntroCard text={INTRO} />

				<Design.TableRowGroup title="Status">
					<Design.TableRow label={status.label} subLabel={status.detail} />
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Folders">
					<Design.TableSwitchRow
						label="Hide icons"
						subLabel="Don’t show server icons for collapsed folders. You see the folder icon, in the folder’s colour."
						value={isOn('hideIcons')}
						onValueChange={(on: boolean) =>
							flip(
								'hideIcons',
								on,
								on ? 'Folder icons hidden' : 'Folder icons are back',
							)
						}
					/>
					<Design.TableSwitchRow
						label="Auto collapse"
						subLabel="Automatically collapse folders as you expand different ones."
						value={isOn('autoCollapse')}
						onValueChange={(on: boolean) =>
							flip(
								'autoCollapse',
								on,
								on ? 'Auto collapse is on' : 'Auto collapse is off',
							)
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Your folders">
					<Design.TableRow
						label={
							storesReachable()
								? `${folders.length} folder${folders.length === 1 ? '' : 's'}`
								: 'Not available'
						}
						subLabel={
							storesReachable()
								? `${open} open right now`
								: 'Discord’s folder list could not be read. Press Copy logs below and send the report.'
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Good to know">
					<Design.TableRow
						label="Only changes what you see"
						subLabel="Your folders, their colours and their servers are not touched. Turning a switch off puts everything back at once."
					/>
					<Design.TableRow
						label="Open folders"
						subLabel="Hide icons only changes collapsed folders. An open folder shows its servers as always."
					/>
					<Design.TableRow
						label="Turn the plugin off"
						subLabel="Folders look and work like Discord’s own again."
					/>
				</Design.TableRowGroup>

				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
