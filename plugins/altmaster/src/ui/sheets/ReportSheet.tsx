import { showError, showToast } from '../../lib/alerts'
import { describeError, isSnowflake, reportAlt } from '../../lib/api'
import { getCurrentUserId } from '../../lib/modules'
import { Field } from './Field'
import { getDesign, getReact, hideSheet, openSheet } from './helpers'
import { SheetBody } from './SheetBody'

async function submitReport(
	mainId: string,
	altIdValue: string,
	warningValue: string,
	anon: boolean,
	sheetKey: string,
): Promise<void> {
	const value = (altIdValue || '').trim()
	if (!value) {
		showError('AltMaster', "Enter the alt account's user ID.")
		return
	}
	if (!isSnowflake(value)) {
		showError(
			'AltMaster',
			"That doesn't look like a Discord user ID (it should be a snowflake like 123456789012345678).",
		)
		return
	}
	if (value === mainId) {
		showError('AltMaster', 'A user cannot be their own alt.')
		return
	}
	const warning = (warningValue || '').trim()
	try {
		await reportAlt({
			mainId,
			altId: value,
			warning: warning || undefined,
			reporterId: anon ? undefined : getCurrentUserId(),
		})
		hideSheet(sheetKey)
		showToast('Report submitted. An admin will review the link.')
	} catch (err) {
		const e = err as any
		if (e?.status === 409) {
			const status = e?.data?.status ? ` (${e.data.status})` : ''
			hideSheet(sheetKey)
			showToast(`Already known: this pair is on record${status}.`)
			return
		}
		showError('AltMaster', describeError(err))
	}
}

function ReportSheet(props: any) {
	const { mainId, sheetKey } = props ?? {}
	const design = getDesign()
	const React = getReact()
	const { TableRowGroup, TableRow, TableSwitchRow } = design ?? {}
	if (!TableRowGroup || !TableRow) return null
	const [altId, setAltId] = React.useState('')
	const [warning, setWarning] = React.useState('')
	const [anon, setAnon] = React.useState(true)
	const altIdRef = React.useRef(null)
	const warningRef = React.useRef(null)
	const readAltId = (): string => {
		const text = altIdRef.current?.getText?.()
		return typeof text === 'string' ? text : altId
	}
	const readWarning = (): string => {
		const text = warningRef.current?.getText?.()
		return typeof text === 'string' ? text : warning
	}

	return (
		<SheetBody
			title="Report alt account"
			subtitle="This profile will be recorded as the main account."
		>
			<Field
				label="Alt account ID"
				placeholder="Alt user ID (snowflake)"
				helper="The secondary account you believe is linked."
				value={altId}
				onChange={setAltId}
				inputRef={altIdRef}
			/>
			<Field
				label="Warning (optional)"
				placeholder="e.g. same voice, follow-only, same avatar hash"
				helper="Anything a moderator should see when reviewing."
				multiline
				maxLength={200}
				value={warning}
				onChange={setWarning}
				inputRef={warningRef}
			/>
			<TableRowGroup>
				{TableSwitchRow ? (
					<TableSwitchRow
						label="Report anonymously"
						subLabel="Hide your user ID from the report"
						value={anon}
						onValueChange={setAnon}
					/>
				) : null}
			</TableRowGroup>
			<TableRowGroup>
				<TableRow
					label="Submit report"
					variant="danger"
					onPress={() =>
						void submitReport(
							mainId,
							readAltId(),
							readWarning(),
							anon,
							sheetKey,
						)
					}
				/>
				<TableRow label="Cancel" onPress={() => hideSheet(sheetKey)} />
			</TableRowGroup>
		</SheetBody>
	)
}

export function presentReportSheet(mainId: string): void {
	showToast('Report alt account')
	if (openSheet(ReportSheet, { mainId }) == null) {
		showToast('AltMaster: reporting is unavailable right now.')
	}
}
