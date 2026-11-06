import { KmmiioFooter } from '../../../shared/kmmiio/Footer'
import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { getDesign, getReact } from './lib/modules'
import type { PluginApi } from '@valenced/plugins/types'
import type { AltMasterStorage } from './types'

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: AltMasterStorage }>
}) {
	const { Page } = (valenced as any).components ?? {}
	const { ScrollView } = getReact()?.ReactNative ?? {}
	const { Stack, TableRowGroup, TableSwitchRow, Text, TextField } =
		getDesign() ?? {}
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<AltMasterStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Context menu">
						<TableSwitchRow
							label="Show AltMaster actions"
							subLabel="Adds Check / Report / Appeal rows to the user profile menu"
							value={s.enabled}
							onValueChange={(value: boolean) => set({ enabled: value })}
						/>
					</TableRowGroup>
					<TableRowGroup title="Server">
						<TextField
							label="AltMaster server URL"
							value={s.baseUrl}
							onChange={(value: string) => set({ baseUrl: value })}
						/>
						<Text
							variant="text-sm/medium"
							color="text-muted"
							style={{ textAlign: 'left' }}
						>
							The worker that stores the alt-account links.
						</Text>
					</TableRowGroup>
					<KmmiioFooter diag={diag} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
