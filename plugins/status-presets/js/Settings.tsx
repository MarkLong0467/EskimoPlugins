import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { presetFromNow } from './apply'
import { Card } from './components'
import { listenToSettings, saveSettings, setStorage, setting } from './config'
import { VERSION } from './constants'
import EditPreset from './EditPreset'
import NowCard from './NowCard'
import PresetList from './PresetList'
import { newId, readPresets, writePresets } from './presets'
import { copyReport, runSelfCheck } from './report'
import { log, toast } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Check, PresetSettings, View as ScreenView } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: PresetSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const HELP =
	'Something not working? Run the self-check, then copy the report and send it.'
const HEADER = `STATUS PRESETS ${VERSION}`

/**
 * The settings screen. It shows either the main screen (your status now, the list of presets, the options, and the
 * self-check and report) or the editor of one preset. It draws itself again whenever a setting or the log changes.
 */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()

	const [, setRedraws] = useState(0)
	const [view, setView] = useState<ScreenView>({ name: 'list' })
	const [checks, setChecks] = useState<Check[] | null>(null)
	useEffect(() => listenToSettings(() => setRedraws(n => n + 1)), [])

	/** Saves your status now as a preset and opens it for editing. */
	const addFromNow = () => {
		const preset = presetFromNow()
		writePresets([...readPresets(), preset])
		toast('Saved. Tap “edit” to rename it.')
		setView({ name: 'edit', id: preset.id })
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack
				style={{ paddingVertical: 20, paddingHorizontal: 12 }}
				spacing={22}
			>
				{view.name === 'edit' ? (
					<EditPreset
						key={view.id}
						id={view.id}
						onBack={() => setView({ name: 'list' })}
					/>
				) : (
					[
						<NowCard key="now" onSaveCurrent={addFromNow} />,
						<PresetList
							key="list"
							onEdit={id => setView({ name: 'edit', id })}
							onAdd={() => setView({ name: 'edit', id: newId() })}
						/>,
						<Design.TableRowGroup key="options" title="Options">
							<Design.TableSwitchRow
								key="inSheet"
								label="Show presets in my account sheet"
								subLabel="Under the status picker (You tab, tap your avatar)"
								value={!!setting('inSheet')}
								onValueChange={(value: boolean) =>
									saveSettings({ inSheet: !!value })
								}
							/>
							<Design.TableSwitchRow
								key="inEditor"
								label="Show presets on the “Set your status” screen"
								subLabel="Between “Clear at” and “Delete status”. Tapping one applies it and closes the screen."
								value={!!setting('inEditor')}
								onValueChange={(value: boolean) =>
									saveSettings({ inEditor: !!value })
								}
							/>
							<Design.TableSwitchRow
								key="buzz"
								label="Vibrate when a preset is applied"
								value={!!setting('buzz')}
								onValueChange={(value: boolean) =>
									saveSettings({ buzz: !!value })
								}
							/>
						</Design.TableRowGroup>,
						<Card key="debug">
							<Design.Text variant="text-xs/bold" color="text-muted">
								{HEADER}
							</Design.Text>
							<Design.Text variant="text-sm/medium" color="text-muted">
								{HELP}
							</Design.Text>
							<View style={{ flexDirection: 'row', gap: 10 }}>
								<View style={{ flex: 1 }}>
									<Design.Button
										text="Run the self-check"
										variant="primary"
										size="sm"
										onPress={() => {
											setChecks(null)
											runSelfCheck(results => setChecks(results.slice()))
										}}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Design.Button
										text="Copy report"
										variant="secondary"
										size="sm"
										onPress={copyReport}
									/>
								</View>
							</View>
						</Card>,
						checks && (
							<Design.TableRowGroup key="checks" title="Self-check">
								{checks.map((r, i) => (
									<Design.TableRow
										key={`check${i}`}
										label={`${r.ok ? '✓' : '✗'} ${r.label}`}
										subLabel={r.detail || undefined}
									/>
								))}
								<Design.TableRow
									key="checkNote"
									label="About the round trip"
									subLabel="It writes your current status back to Discord and reads it again. Nothing visible changes."
								/>
							</Design.TableRowGroup>
						),
						log.length > 0 && (
							<Design.TableRowGroup key="log" title="Last actions">
								{log.slice(0, 6).map((l, i) => (
									<Design.TableRow
										key={`log${i}`}
										label={`${l.ok ? '✓' : '✗'} ${l.text}`}
										subLabel={new Date(l.at).toLocaleTimeString()}
									/>
								))}
							</Design.TableRowGroup>
						),
					]
				)}
			</Design.Stack>
		</ScrollView>
	)
}
