import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { store } from './config'
import { diag } from './diag'
import { counts } from './state'
import { removeAll } from './tabs'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Layout, Position, TabsSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: TabsSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Keeps channels, DMs, threads and forum posts as tabs, like a browser. Open a channel and tap ＋ on the bar to save it. Tap a tab to switch to it, ✕ on a tab to close it, ✕ all to close every tab. Hold a tab (or tap Split) to see two tabs at once. Push the little line under the bar up to fold the bar away, and pull it down (or tap it) to bring it back.'
const SPLIT_TEST =
	'Off, the second half only shows which channel is there, and a tap opens it. Lighter, for slow phones.'
const NOTHING = 'Nothing yet: open a channel, then come back.'

const POSITIONS: ReadonlyArray<{ value: Position; label: string }> = [
	{ value: 'top', label: 'On top' },
	{ value: 'left', label: 'On the left' },
]

const LAYOUTS: ReadonlyArray<{ value: Layout; label: string }> = [
	{ value: 'stacked', label: 'One above the other' },
	{ value: 'side', label: 'Side by side' },
]

/** The settings screen: where the bar is, how a split is laid out, and what the plugin found. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const tabs = store.get('tabs')
	const entries = Object.entries(counts)
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRadioGroup<Position>
					title="Tab bar"
					value={store.get('position')}
					onChange={value => store.set({ position: value })}
				>
					{POSITIONS.map(item => (
						<Design.TableRadioRow<Position>
							key={item.value}
							label={item.label}
							value={item.value}
						/>
					))}
				</Design.TableRadioGroup>
				<Design.TableRadioGroup<Layout>
					title="Split screen"
					value={store.get('layout')}
					onChange={value => store.set({ layout: value })}
				>
					{LAYOUTS.map(item => (
						<Design.TableRadioRow<Layout>
							key={item.value}
							label={item.label}
							value={item.value}
						/>
					))}
				</Design.TableRadioGroup>
				<Design.TableRowGroup title="Second half">
					<Design.TableSwitchRow
						label="Draw the chat in the second half"
						subLabel={SPLIT_TEST}
						value={store.get('splitChat')}
						onValueChange={(value: boolean) => store.set({ splitChat: value })}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Tabs">
					<Design.TableSwitchRow
						label="Fold the bar away"
						subLabel="Only the handle is left. The same as pushing the handle up."
						value={store.get('collapsed')}
						onValueChange={(value: boolean) => store.set({ collapsed: value })}
					/>
					<Design.TableRow
						label={`${tabs.length} saved`}
						trailing={
							tabs.length > 0 ? (
								<Design.Button
									size="sm"
									variant="secondary"
									text="Close all"
									onPress={removeAll}
								/>
							) : undefined
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="What it found">
					{entries.length === 0 ? (
						<Design.TableRow label={NOTHING} labelLineClamp={3} />
					) : (
						entries.map(([name, count]) => (
							<Design.TableRow
								key={name}
								label={name}
								trailing={
									<Design.Text variant="text-md/medium" color="text-muted">
										{`${count.changed} of ${count.seen}`}
									</Design.Text>
								}
							/>
						))
					)}
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
