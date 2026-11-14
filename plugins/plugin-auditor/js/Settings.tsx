import { Page } from '@valenced/components'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { setStorage, setting } from './config'
import { CopiesTab } from './CopiesTab'
import { diag } from './diag'
import { Hero } from './Hero'
import { HowItWorks } from './HowItWorks'
import { LinksTab } from './LinksTab'
import { OptionsTab } from './OptionsTab'
import { PluginsTab } from './PluginsTab'
import { auditor } from './store'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { AuditorSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: AuditorSettings }>
>

type TabId = 'plugins' | 'links' | 'copies' | 'options'

/** The tabs in the order they are shown. */
const TAB_IDS: readonly TabId[] = ['plugins', 'links', 'copies', 'options']

/** The settings screen: the summary, the tabs, and the debugging section at the bottom. */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [tab, setTab] = useState<TabId>('plugins')
	const [pageWidth, setPageWidth] = useState(360)
	useEffect(() => auditor.subscribe(() => redraw(n => n + 1)), [])

	const state = auditor.state()
	const sum = auditor.summary()
	const scanned = state.scans.length > 0
	const count = (value: number) => (scanned ? ` ${value}` : '')

	// Discord's segmented control only picks the tab; the page under it is drawn here.
	const segmented = Design.useSegmentedControlState({
		items: [
			{ id: 'plugins', label: `Plugins${count(sum.total)}` },
			{
				id: 'links',
				label: `Links${count(auditor.hosts(!setting('hideNoise')).length)}`,
			},
			{ id: 'copies', label: `Copies${count(state.groups.length)}` },
			{ id: 'options', label: 'Options' },
		],
		pageWidth,
		defaultIndex: TAB_IDS.indexOf(tab),
		onSetActiveIndex: index => setTab(TAB_IDS[index] ?? 'plugins'),
	})

	return (
		<Page>
			<View
				style={{ flex: 1 }}
				onLayout={e => setPageWidth(e.nativeEvent.layout.width)}
			>
				<ScrollView
					style={{ flex: 1 }}
					contentContainerStyle={{ paddingBottom: 38 }}
					keyboardShouldPersistTaps="handled"
				>
					<Design.Stack style={{ paddingVertical: 12 }} spacing={20}>
						<Hero />
						<View style={{ marginHorizontal: 16 }}>
							<Design.SegmentedControl
								state={segmented}
								variant="default"
								keyboardShouldPersistTaps="handled"
							/>
						</View>
						{tab === 'plugins' ? <PluginsTab /> : null}
						{tab === 'links' ? <LinksTab /> : null}
						{tab === 'copies' ? <CopiesTab /> : null}
						{tab === 'options' ? <OptionsTab /> : null}
						<HowItWorks />
						<DebugSection diag={diag} />
					</Design.Stack>
				</ScrollView>
			</View>
		</Page>
	)
}
