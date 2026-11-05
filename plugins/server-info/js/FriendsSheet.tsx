import { Design } from '@valenced/discord/design'
import { Image } from 'react-native'
import ActionSheetBody from './ActionSheetBody'
import { chevron } from './Chevron'
import { FRIENDS_KEY } from './constants'
import { openProfile, sheets, store } from './discord'
import { avatarUrl } from './format'
import type { Friend, UserStore } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NONE = 'No friends found in this server.'
const CLOSE = 'Close'

interface Props {
	friends: Friend[]
	guildId: string
}

/** The sheet that lists your friends in a server. Tap one to open their profile. */
export default function FriendsSheet({ friends, guildId }: Props) {
	const heading = `Friends in this server (${friends.length})`
	return (
		<ActionSheetBody>
			<Design.Text variant="heading-md/bold">{heading}</Design.Text>
			{friends.length === 0 ? (
				<Design.Text variant="text-md/medium" color="text-muted">
					{NONE}
				</Design.Text>
			) : (
				<Design.TableRowGroup>
					{friends.map(friend => {
						const name =
							friend.nick || friend.globalName || friend.username || friend.id
						const handle = friend.username ? `@${friend.username}` : undefined
						const user = store<UserStore>('UserStore')?.getUser(friend.id)
						return (
							<Design.TableRow
								key={friend.id}
								label={name}
								subLabel={handle && handle !== `@${name}` ? handle : undefined}
								icon={
									<Image
										source={{ uri: avatarUrl(friend.id, user?.avatar) }}
										style={{ width: 28, height: 28, borderRadius: 14 }}
									/>
								}
								trailing={chevron()}
								onPress={() => openProfile(friend.id, guildId)}
							/>
						)
					})}
				</Design.TableRowGroup>
			)}
			<Design.Button
				text={CLOSE}
				variant="secondary"
				onPress={() => sheets().hideActionSheet(FRIENDS_KEY)}
			/>
		</ActionSheetBody>
	)
}
