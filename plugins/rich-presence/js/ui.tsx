import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import type { ReactNode } from 'react'
import type { Choice } from './types'

/** A row of text, which can be tapped. */
export const row = (
	label: string,
	subLabel: string,
	onPress?: () => void,
	arrow?: boolean,
) => (
	<Design.TableRow
		key={label}
		label={label}
		subLabel={subLabel}
		onPress={onPress}
		arrow={arrow}
	/>
)

/** A group of rows with a title and, if wanted, a line under the title. Empty entries are left out. */
export const section = (
	title: string,
	description: string | undefined,
	...kids: ReactNode[]
) => (
	<Design.TableRowGroup key={title} title={title} description={description}>
		{kids.filter(Boolean)}
	</Design.TableRowGroup>
)

/** A row with a switch. */
export const toggleRow = (
	label: string,
	subLabel: string,
	value: boolean,
	onChange: (value: boolean) => void,
) => (
	<Design.TableSwitchRow
		key={label}
		label={label}
		subLabel={subLabel}
		value={value}
		onValueChange={(next: boolean) => onChange(!!next)}
	/>
)

/** A list to pick one choice from. Each choice can have a line under it that says what it does. */
export const radio = <V extends string | number>(
	title: string,
	value: V,
	items: Choice<V>[],
	onChange: (value: V) => void,
	description?: string,
) => (
	<Design.TableRadioGroup
		key={title}
		title={title}
		description={description}
		value={value}
		onChange={onChange}
	>
		{items.map(item => (
			<Design.TableRadioRow
				key={String(item.v)}
				label={item.l}
				subLabel={item.s}
				value={item.v}
			/>
		))}
	</Design.TableRadioGroup>
)

/** A button that goes back to the list. */
export const Back = ({
	title,
	onPress,
}: {
	title: string
	onPress: () => void
}) => (
	<View style={{ paddingHorizontal: 4 }}>
		<Design.Button
			text={`‹ ${title}`}
			variant="secondary"
			size="sm"
			onPress={onPress}
		/>
	</View>
)

/** A row of buttons that picks one page. The page that is open is the filled button. */
export function Tabs<V extends string>({
	tabs,
	value,
	onChange,
}: {
	tabs: Choice<V>[]
	value: V
	onChange: (value: V) => void
}) {
	return (
		<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
			{tabs.map(tab => (
				<Design.Button
					key={tab.v}
					text={tab.l}
					variant={tab.v === value ? 'primary' : 'secondary'}
					size="sm"
					onPress={() => onChange(tab.v)}
				/>
			))}
		</View>
	)
}
