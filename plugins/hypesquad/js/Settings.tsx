import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { change } from './change'
import { HOUSES } from './constants'
import { useHouse } from './useHouse'

/**
 * The settings screen: the three houses, with "Current" under the one you are in, and a row to leave HypeSquad that
 * only shows while you are in a house. Tapping a row makes the change.
 */
export default function Settings() {
	const current = useHouse()

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRowGroup title="HypeSquad">
					{HOUSES.map(house => (
						<Design.TableRow
							key={house.id}
							label={house.name}
							subLabel={current === house.id ? 'Current' : undefined}
							onPress={() => change(house.id)}
						/>
					))}
					{current !== 0 ? (
						<Design.TableRow
							key="leave"
							label="Leave HypeSquad"
							variant="danger"
							onPress={() => change(0)}
						/>
					) : null}
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
