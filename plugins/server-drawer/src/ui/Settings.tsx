import { KmmiioFooter } from '../../../../shared/kmmiio/Footer'
import { diag } from '../diag'
import { normalizeStorage } from '../lib/modules'
import { DM_TILE_OPTIONS, openDmTileSheet } from './DmTileSheet'
import type { PluginApi } from '@valenced/plugins/types'
import type { ServerDrawerStorage } from '../lib/modules'

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: ServerDrawerStorage }>
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView } = valenced.react.ReactNative
	const { Stack, TableRow, TableRowGroup, TableSwitchRow } =
		valenced.discord.design.Design

	const s = normalizeStorage(api.jsonStorage.use())
	// `set` deep-merges, so only the changed key has to be sent.
	const set = (patch: Partial<ServerDrawerStorage>) =>
		api.jsonStorage.set(patch)

	const dmTileLabel =
		DM_TILE_OPTIONS.find(option => option.value === s.dmTileMode)?.label ??
		DM_TILE_OPTIONS[0].label

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Server Drawer">
						<TableRow
							label="DM Tile"
							subLabel={dmTileLabel}
							arrow
							onPress={openDmTileSheet}
						/>
						<TableSwitchRow
							label="Show Guild Names"
							subLabel="Displays guild names under each server icon"
							value={s.showGuildNames}
							onValueChange={v => set({ showGuildNames: v })}
						/>
					</TableRowGroup>
					<KmmiioFooter diag={diag} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
