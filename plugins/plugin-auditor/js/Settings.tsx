import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { CopiesTab } from './CopiesTab'
import { Tabs } from './components'
import { setStorage, setting } from './config'
import { diag } from './diag'
import { Hero } from './Hero'
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

/** The settings screen: the summary, the tabs, and the debugging section at the bottom. */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [tab, setTab] = useState<TabId>('plugins')
	useEffect(() => auditor.subscribe(() => redraw(n => n + 1)), [])

	const state = auditor.state()
	const sum = auditor.summary()
	const scanned = state.scans.length > 0

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={20}>
				<Hero />
				<View style={{ marginHorizontal: 16 }}>
					<Tabs<TabId>
						value={tab}
						onChange={setTab}
						tabs={[
							{
								id: 'plugins',
								label: 'Plugins',
								badge: scanned ? String(sum.total) : undefined,
							},
							{
								id: 'links',
								label: 'Links',
								badge: scanned
									? String(auditor.hosts(!setting('hideNoise')).length)
									: undefined,
							},
							{
								id: 'copies',
								label: 'Copies',
								badge: scanned ? String(state.groups.length) : undefined,
							},
							{ id: 'options', label: 'Options' },
						]}
					/>
				</View>
				{tab === 'plugins' ? <PluginsTab /> : null}
				{tab === 'links' ? <LinksTab /> : null}
				{tab === 'copies' ? <CopiesTab /> : null}
				{tab === 'options' ? <OptionsTab /> : null}
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
