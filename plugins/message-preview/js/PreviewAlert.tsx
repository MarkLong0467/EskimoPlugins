import { AlertActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { ScrollView, useWindowDimensions } from 'react-native'
import { ALERT_KEY } from './constants'
import type { ChatItemComponent } from './types'

/** The title of the popup and the label of its button. Constants because React Native text must be an expression. */
const TITLE = 'Message Preview'
const CLOSE = 'Close'

/** What the popup needs to draw the message. */
interface Props {
	/** Discord's component for one chat message. */
	ChatItem: ChatItemComponent
	/** The row manager the chat item draws rows with. */
	rows: object
	/** The message to draw. */
	message: object
}

/**
 * The popup: Discord's own alert, with the message drawn inside it by Discord's own chat message component, so the
 * preview looks exactly like the sent message. It can scroll if the message is tall (at most 70% of the screen).
 */
export default function PreviewAlert({ ChatItem, rows, message }: Props) {
	const { height } = useWindowDimensions()
	return (
		<Design.AlertModal
			title={TITLE}
			extraContent={
				<ScrollView style={{ marginVertical: 12, maxHeight: height * 0.7 }}>
					<ChatItem rowGenerator={rows} message={message} />
				</ScrollView>
			}
			actions={
				<Design.AlertActionButton
					text={CLOSE}
					variant="secondary"
					onPress={() => AlertActionCreators.dismissAlert(ALERT_KEY)}
				/>
			}
		/>
	)
}
