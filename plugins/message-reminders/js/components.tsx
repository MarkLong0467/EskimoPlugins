import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import { relativeOf, whenOf } from './time'
import type { ReactNode } from 'react'
import type { Reminder } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NO_TEXT = '(no text, maybe a picture or file)'
const SOMEONE = 'Someone'

/**
 * A message as a reminder shows it: who wrote it, the start of what it says, and when the reminder is.
 *
 * @param reminder The reminder to show.
 * @param children Buttons or rows to put under it.
 */
export function ReminderCard({
	reminder,
	children,
}: {
	reminder: Reminder
	children?: ReactNode
}) {
	const author = reminder.author || SOMEONE
	const preview = reminder.preview || NO_TEXT
	const overdue = reminder.at <= Date.now()
	const line = overdue
		? `Was due ${relativeOf(reminder.at)}`
		: `${whenOf(reminder.at)} · ${relativeOf(reminder.at)}`
	const snoozed = reminder.snoozes > 0 ? ` · snoozed ${reminder.snoozes}x` : ''
	const when = `${line}${snoozed}`
	return (
		<Design.Card>
			<Design.Stack spacing={8}>
				<Design.Text variant="text-md/semibold">{author}</Design.Text>
				<Design.Text variant="text-md/medium">{preview}</Design.Text>
				<Design.Text
					variant="text-sm/medium"
					color={overdue ? 'text-danger' : 'text-muted'}
				>
					{when}
				</Design.Text>
				{children}
			</Design.Stack>
		</Design.Card>
	)
}

/** Buttons side by side, each taking an equal share. */
export function ButtonRow({ children }: { children: ReactNode }) {
	return <View style={{ flexDirection: 'row', gap: 10 }}>{children}</View>
}

/** One button of a {@link ButtonRow}. */
export function RowButton({
	text,
	variant,
	onPress,
}: {
	text: string
	variant: 'primary' | 'secondary' | 'tertiary' | 'destructive'
	onPress: () => void
}) {
	return (
		<View style={{ flex: 1 }}>
			<Design.Button
				text={text}
				variant={variant}
				size="sm"
				onPress={onPress}
			/>
		</View>
	)
}
