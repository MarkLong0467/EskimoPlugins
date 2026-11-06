import { showError, showToast } from '../../lib/alerts'
import {
	avatarStyle,
	buildRows,
	getCachedRows,
	getDesign,
	getRN,
	hideSheet,
	openAccountProfile,
	openSheet,
	setCachedRows,
} from './helpers'
import { SheetBody } from './SheetBody'
import type { AltEntry } from '../../lib/api'
import type { AltRow } from './helpers'

function AltsSheet(props: any) {
	const { rows, sheetKey } = props ?? {}
	const list: AltRow[] = Array.isArray(rows) ? rows : getCachedRows()
	const design = getDesign()
	const RN = getRN()
	const { TableRowGroup, TableRow, Text } = design ?? {}
	const Image = RN?.Image
	if (!TableRowGroup || !TableRow || !Text) return null

	return (
		<SheetBody
			title="Linked accounts"
			subtitle={`${list.length} account${list.length === 1 ? '' : 's'} listed for this user`}
		>
			<TableRowGroup>
				{list.map(row => (
					<TableRow
						key={row.id}
						label={row.name}
						subLabel={
							row.role === 'main'
								? 'main account'
								: row.warning
									? `linked alt · ${row.warning}`
									: 'linked alt'
						}
						icon={
							Image ? (
								<Image source={{ uri: row.avatarUri }} style={avatarStyle} />
							) : undefined
						}
						onPress={() => {
							if (!openAccountProfile(row.id)) {
								hideSheet(sheetKey)
								showToast(
									`${row.role === 'main' ? 'Main' : 'Alt'} ${row.name} (${row.id})`,
								)
							}
						}}
					/>
				))}
			</TableRowGroup>
			<Text variant="text-sm/medium" style={{ textAlign: 'center' }}>
				Tap a row to open that profile.
			</Text>
		</SheetBody>
	)
}

export async function presentAltsSheet(
	targetId: string,
	entries: AltEntry[],
): Promise<void> {
	if (!Array.isArray(entries) || entries.length === 0) {
		showToast('No linked accounts found for this user.')
		return
	}

	let rows: AltRow[]
	try {
		rows = await buildRows(targetId, entries)
	} catch (err) {
		showError('AltMaster', (err as any)?.message ?? 'Could not load names.')
		return
	}

	if (rows.length === 0) {
		showToast('No linked accounts found for this user.')
		return
	}

	setCachedRows(rows)
	if (openSheet(AltsSheet, { rows }) == null) {
		showToast(
			`Found ${rows.length} linked account${rows.length === 1 ? '' : 's'}.`,
		)
	}
}
