/** A sheet with a list of things to do, for a saved message, a sent one, a scheduled one or a message in chat. */

import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { describeError } from './api'
import { diag } from './diag'
import { hideSheets, openSheet, toast } from './discord'

/** The key the sheet opens with. */
export const ACTIONS_SHEET_KEY = 'WebhookBuilderActions'

export interface SheetAction {
	label: string
	sub?: string
	danger?: boolean
	/** What it does. The sheet closes first. What it returns, if text, is shown as a toast; an error is shown too. */
	run: () => unknown
}

/** Runs an action of the sheet. */
async function perform(action: SheetAction): Promise<void> {
	hideSheets()
	try {
		const said = await action.run()
		if (typeof said === 'string' && said) toast(said)
	} catch (error) {
		diag.log('action', `${action.label}: ${describeError(error)}`, 'warn')
		toast(describeError(error))
	}
}

/** The sheet. */
export function ActionsSheet({
	title,
	actions,
}: {
	title: string
	actions: SheetAction[]
}) {
	return (
		<Design.ActionSheet>
			<Design.BottomSheetTitleHeader title={title} />
			<ScrollView style={{ maxHeight: 560 }}>
				<Design.TableRowGroup>
					{actions.map(a => (
						<Design.TableRow
							key={a.label}
							label={a.label}
							subLabel={a.sub}
							variant={a.danger ? 'danger' : undefined}
							onPress={() => perform(a)}
						/>
					))}
				</Design.TableRowGroup>
			</ScrollView>
		</Design.ActionSheet>
	)
}

/** Opens the sheet. */
export function showActions(title: string, actions: SheetAction[]): void {
	openSheet(ACTIONS_SHEET_KEY, () => (
		<ActionsSheet title={title} actions={actions} />
	))
}
