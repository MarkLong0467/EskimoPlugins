import { showError, showToast } from '../../lib/alerts'
import { presentAppealSheet } from './AppealSheet'
import {
	avatarStyle,
	buildLinkRows,
	getDesign,
	getRN,
	hideSheet,
	openSheet,
} from './helpers'
import { SheetBody } from './SheetBody'
import type { AltEntry } from '../../lib/api'
import type { LinkRow } from './helpers'

function LinkedAltsSheet(props: any) {
	const { userId, rows, sheetKey } = props ?? {}
	const list: LinkRow[] = Array.isArray(rows) ? rows : []
	const design = getDesign()
	const RN = getRN()
	const { TableRowGroup, TableRow, Text } = design ?? {}
	const Image = RN?.Image
	if (!TableRowGroup || !TableRow || !Text) return null

	return (
		<SheetBody
			title="Appeal a false positive"
			subtitle="These accounts are recorded as alts of this profile:"
		>
			<TableRowGroup>
				{list.map(row => (
					<TableRow
						key={row.entryId}
						label={row.name}
						subLabel={
							row.warning
								? `entry #${row.entryId} · ${row.warning}`
								: `entry #${row.entryId}`
						}
						icon={
							Image ? (
								<Image source={{ uri: row.avatarUri }} style={avatarStyle} />
							) : undefined
						}
						onPress={() => {
							hideSheet(sheetKey)
							setTimeout(() => {
								presentAppealSheet(userId, String(row.entryId), row.name)
							}, 250)
						}}
					/>
				))}
			</TableRowGroup>
			<Text variant="text-sm/medium" style={{ textAlign: 'center' }}>
				Tap the entry you want to appeal.
			</Text>
		</SheetBody>
	)
}

export async function presentLinkedAltsSheet(
	userId: string,
	entries: AltEntry[],
): Promise<void> {
	if (!Array.isArray(entries) || entries.length === 0) {
		showToast('No alt accounts are connected to this profile.')
		return
	}

	let rows: LinkRow[]
	try {
		rows = await buildLinkRows(entries)
	} catch (err) {
		showError('AltMaster', (err as any)?.message ?? 'Could not load names.')
		return
	}

	if (openSheet(LinkedAltsSheet, { userId, rows }) == null) {
		showToast('AltMaster: appeals are unavailable right now.')
	}
}
