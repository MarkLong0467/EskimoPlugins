import { Design } from '@valenced/discord/design'
import { Text as NativeText, ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { pastel, toHex } from './color'
import { store } from './config'
import { diag } from './diag'
import { counts } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { PastelSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: PastelSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Gives every name in chat its own pastel colour. The colour is worked out from the ID of the person, so it is always the same for the same person. Names that have a role colour keep it unless you turn on the first switch. Messages that are on the screen already change when you open the channel again.'
const NOTHING = 'Nothing yet: open a channel, then come back.'
const EVERYONE_NOTE =
	'Also names that have a role colour. Off, those keep their role colour.'
const WEBHOOK_NOTE =
	'Each name a webhook posts under gets its own colour. Off, the colour comes from the ID of the webhook.'
const MENTION_NOTE = 'Mentions of people who have no role colour.'

/** Names for the preview. Their colours are worked out the way a person's is. */
const SAMPLES = ['Wumpus', 'Clyde', 'Nelly', 'Phibi', 'Mallow', 'Graggle']

/** A few names in the colours the plugin gives, so the look can be seen without leaving the settings. */
function Preview() {
	return (
		<View style={{ marginHorizontal: 16 }}>
			<Design.Card>
				<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
					{SAMPLES.map(name => (
						<NativeText
							key={name}
							style={{
								color: toHex(pastel(name)),
								fontSize: 16,
								fontWeight: '600',
							}}
						>
							{name}
						</NativeText>
					))}
				</View>
			</Design.Card>
		</View>
	)
}

/** The settings screen: whose names are coloured, and what the plugin found. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const entries = Object.entries(counts)
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Preview />
				<Design.TableRowGroup title="Names">
					<Design.TableSwitchRow
						label="Colour everyone"
						subLabel={EVERYONE_NOTE}
						value={store.get('everyone')}
						onValueChange={(value: boolean) => store.set({ everyone: value })}
					/>
					<Design.TableSwitchRow
						label="Colour webhooks by name"
						subLabel={WEBHOOK_NOTE}
						value={store.get('webhookName')}
						onValueChange={(value: boolean) =>
							store.set({ webhookName: value })
						}
					/>
					<Design.TableSwitchRow
						label="Colour mentions"
						subLabel={MENTION_NOTE}
						value={store.get('mentions')}
						onValueChange={(value: boolean) => store.set({ mentions: value })}
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
