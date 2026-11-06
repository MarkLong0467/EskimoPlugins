import { showError, showToast } from '../../lib/alerts'
import { appealEntry, describeError } from '../../lib/api'
import { Field } from './Field'
import { getDesign, getReact, hideSheet, openSheet } from './helpers'
import { SheetBody } from './SheetBody'

async function submitAppeal(
	userId: string,
	entry: string,
	reasonValue: string,
	sheetKey: string,
): Promise<void> {
	const reason = (reasonValue || '').trim()
	if (!/^\d+$/.test(entry)) {
		showError('AltMaster', 'This entry ID looks invalid. Close and retry.')
		return
	}
	if (reason.length === 0) {
		showError(
			'AltMaster',
			"Please write a short reason — the field can't be empty.",
		)
		return
	}
	if (reason.length < 10) {
		showError(
			'AltMaster',
			'Please write a bit more so a moderator can understand the appeal.',
		)
		return
	}
	try {
		await appealEntry(Number(entry), { userId, reason })
		hideSheet(sheetKey)
		showToast('Appeal submitted. An admin will review it.')
	} catch (err) {
		const e = err as any
		if (e?.status === 409) {
			hideSheet(sheetKey)
			showToast(
				e?.data?.error ?? 'You already have an open appeal for this entry.',
			)
			return
		}
		showError('AltMaster', describeError(err))
	}
}

export function AppealSheet(props: any) {
	const { userId, entryId, linkedName, sheetKey } = props ?? {}
	const design = getDesign()
	const React = getReact()
	const { TableRowGroup, TableRow } = design ?? {}
	if (!TableRowGroup || !TableRow) return null
	const [reason, setReason] = React.useState('')
	const reasonRef = React.useRef(null)
	const readReason = (): string => {
		const text = reasonRef.current?.getText?.()
		return typeof text === 'string' ? text : reason
	}

	return (
		<SheetBody
			title="Appeal this entry"
			subtitle={`Entry #${entryId}${linkedName ? ` · ${linkedName}` : ''} — appeal only if this account isn't actually an alt of this profile.`}
		>
			<Field
				label="Reason (required)"
				placeholder="why this account isn't an alt"
				multiline
				maxLength={300}
				helper="A moderator reviews every appeal before it's decided."
				value={reason}
				onChange={setReason}
				inputRef={reasonRef}
			/>
			<TableRowGroup>
				<TableRow
					label="Submit appeal"
					variant="danger"
					onPress={() =>
						void submitAppeal(userId, String(entryId), readReason(), sheetKey)
					}
				/>
				<TableRow label="Cancel" onPress={() => hideSheet(sheetKey)} />
			</TableRowGroup>
		</SheetBody>
	)
}

export function presentAppealSheet(
	userId: string,
	entryId: string,
	linkedName?: string,
): void {
	if (openSheet(AppealSheet, { userId, entryId, linkedName }) == null) {
		showToast('AltMaster: appeals are unavailable right now.')
	}
}
