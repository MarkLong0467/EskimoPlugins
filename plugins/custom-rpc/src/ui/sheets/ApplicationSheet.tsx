import ApplicationEditor from '../components/ApplicationEditor'
import { APPLICATION_SHEET_KEY } from '../sheetKeys'

function ActionSheet() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

function closeSheet() {
	try {
		ActionSheet()?.hideActionSheet?.(APPLICATION_SHEET_KEY)
	} catch {}
}

function ApplicationSheet() {
	const Design = valenced.discord.design.Design as any
	const { ActionSheet: AS, BottomSheetTitleHeader } = Design

	return (
		<AS>
			<BottomSheetTitleHeader title="Application" />
			<ApplicationEditor onVerified={closeSheet} />
		</AS>
	)
}

export function openApplicationSheet() {
	try {
		ActionSheet()?.openLazy?.(
			Promise.resolve({ default: ApplicationSheet }),
			APPLICATION_SHEET_KEY,
			{ sheetKey: APPLICATION_SHEET_KEY } as any,
		)
	} catch {}
}
