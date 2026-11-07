import { Design } from '@valenced/discord/design'
import { Image, Pressable, View } from 'react-native'
import ActionSheetBody from './ActionSheetBody'
import { chevron } from './Chevron'
import { FRIENDS_KEY } from './constants'
import { openProfile, sheets, store } from './discord'
import { avatarUrl } from './format'
import { Card, color } from './parts'
import type { Friend, UserStore } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NONE = 'No friends found in this server.'
const TITLE = 'Friends'

interface Props {
	friends: Friend[]
	guildId: string
}

/** The sheet that lists your friends in a server. Tap one to open their profile. */
export default function FriendsSheet({ friends, guildId }: Props) {
	const heading = `${friends.length} friend${friends.length === 1 ? '' : 's'} in this server`
	return (
		<ActionSheetBody
			title={TITLE}
			onClose={() => sheets().hideActionSheet(FRIENDS_KEY)}
		>
			<Design.Text variant="text-md/medium" color="text-muted">
				{heading}
			</Design.Text>
			{friends.length === 0 ? (
				<Design.Text variant="text-md/medium" color="text-muted">
					{NONE}
				</Design.Text>
			) : (
				<Card>
					{friends.map((friend, index) => {
						const name =
							friend.nick || friend.globalName || friend.username || friend.id
						const handle = friend.username ? `@${friend.username}` : undefined
						const user = store<UserStore>('UserStore')?.getUser(friend.id)
						return (
							<View key={friend.id}>
								{index > 0 ? (
									<View
										style={{
											height: 1,
											marginLeft: 70,
											backgroundColor: color(
												'BORDER_SUBTLE',
												'rgba(128,128,128,0.2)',
											),
										}}
									/>
								) : null}
								<Pressable
									accessibilityRole="button"
									accessibilityLabel={`Friend: ${name}`}
									onPress={() => openProfile(friend.id, guildId)}
								>
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 14,
											padding: 14,
										}}
									>
										<Image
											source={{ uri: avatarUrl(friend.id, user?.avatar) }}
											style={{ width: 42, height: 42, borderRadius: 21 }}
										/>
										<View style={{ flex: 1 }}>
											<Design.Text variant="text-lg/semibold" numberOfLines={1}>
												{name}
											</Design.Text>
											{handle && handle !== `@${name}` ? (
												<Design.Text
													variant="text-md/medium"
													color="text-muted"
													numberOfLines={1}
												>
													{handle}
												</Design.Text>
											) : null}
										</View>
										{chevron()}
									</View>
								</Pressable>
							</View>
						)
					})}
				</Card>
			)}
		</ActionSheetBody>
	)
}
