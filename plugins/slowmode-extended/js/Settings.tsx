import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { MAX_SLOWMODE_SECONDS } from './constants'
import { status } from './status'
import { describe, extendedValues } from './values'

/**
 * The settings screen. It has no options: it shows whether the extended list is in use and explains where to find it.
 */
export default function Settings() {
	const choices = extendedValues()

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title="Status">
					<Design.TableRow
						key="found"
						label="Slowmode list"
						subLabel={status.found}
					/>
					<Design.TableRow
						key="applied"
						label="Extended list"
						subLabel={
							status.applied
								? `In use: ${status.count} choices, 0s to ${describe(MAX_SLOWMODE_SECONDS)}`
								: `Not applied${status.error ? ` (${status.error})` : ''}`
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="How to use it">
					<Design.TableRow
						key="use"
						label="Channel settings > Slowmode"
						subLabel="The slider now has every second up to 1 minute, every minute up to 1 hour, and every hour up to 6 hours. You need to be allowed to manage the channel."
					/>
					<Design.TableRow
						key="values"
						label="All choices"
						subLabel={choices.map(describe).join(', ')}
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
