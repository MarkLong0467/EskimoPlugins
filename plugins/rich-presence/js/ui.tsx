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

/** A big title with one short line under it, which starts each part of the editor. */
export const Heading = ({ title, hint }: { title: string; hint?: string }) => (
	<View style={{ paddingHorizontal: 4, gap: 4 }}>
		<Design.Text variant="heading-lg/bold">{title}</Design.Text>
		{hint ? (
			<Design.Text variant="text-sm/medium" color="text-muted">
				{hint}
			</Design.Text>
		) : null}
	</View>
)

/** One part of the editor: a big title, one short line, and what belongs to it. Empty entries are left out. */
export const block = (
	title: string,
	hint: string | undefined,
	...kids: ReactNode[]
) => (
	<Design.Stack key={title} spacing={12}>
		<Heading title={title} hint={hint} />
		{kids.filter(Boolean)}
	</Design.Stack>
)

/** A card of rows or text boxes with no title of its own (the title is the block's). `id` keeps it apart from its siblings. */
export const group = (id: string, ...kids: ReactNode[]) => (
	<Design.TableRowGroup key={id}>{kids.filter(Boolean)}</Design.TableRowGroup>
)

/** A part of a screen with one card of rows: a big title, one short line, and the rows. */
export const part = (
	title: string,
	hint: string | undefined,
	...kids: ReactNode[]
) => block(title, hint, group(title, ...kids))
