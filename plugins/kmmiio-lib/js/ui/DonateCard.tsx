import { AVATAR_URL, GITHUB_URL, SPONSORS_URL, WEBSITE_URL } from './constants'

const { Dimensions } = valenced.react.ReactNative
const { width: SCREEN_WIDTH } = Dimensions.get('window')
const AVATAR_SIZE = Math.min(80, Math.round(SCREEN_WIDTH * 0.15))

const styles = {
	background: {
		position: 'absolute' as const,
		top: 0,
		left: 0,
		width: '100%' as const,
		height: '100%' as const,
	},
	avatar: {
		width: AVATAR_SIZE,
		height: AVATAR_SIZE,
		borderRadius: AVATAR_SIZE / 2,
	},
	avatarWrapper: {
		width: AVATAR_SIZE,
		height: AVATAR_SIZE,
	},
}

export default function DonateCard({
	onAvatarPress,
}: {
	onAvatarPress: () => void
}) {
	const { Stack, Card, Text, Button } = valenced.discord.design.Design
	const { Animated, Image, Linking, Pressable, View } =
		valenced.react.ReactNative
	const { useRef } = valenced.react.React

	const spinAnim = useRef(new Animated.Value(0)).current
	const scaleAnim = useRef(new Animated.Value(1)).current
	const pressCountRef = useRef(0)
	const totalRotationRef = useRef(0)

	const onPressAvatar = () => {
		pressCountRef.current++
		onAvatarPress()

		const duration = Math.max(100, 1000 - pressCountRef.current * 18)
		totalRotationRef.current += 360

		Animated.timing(spinAnim, {
			toValue: totalRotationRef.current,
			duration,
			useNativeDriver: true,
		}).start()
	}

	const onPressIn = () => {
		Animated.timing(scaleAnim, {
			toValue: 1.2,
			duration: 150,
			useNativeDriver: true,
		}).start()
	}

	const onPressOut = () => {
		Animated.timing(scaleAnim, {
			toValue: 1,
			duration: 150,
			useNativeDriver: true,
		}).start()
	}

	const rotate = spinAnim.interpolate({
		inputRange: [0, 360],
		outputRange: ['0deg', '360deg'],
		extrapolate: 'extend',
	})

	return (
		<Card
			style={{
				position: 'relative',
				padding: 0,
				overflow: 'hidden',
			}}
		>
			<View
				style={[
					styles.background,
					{
						opacity: 0.5,
						experimental_backgroundImage:
							'linear-gradient(135deg, rgba(88, 101, 242, 0.4), rgba(0, 0, 0, 0)), ' +
							'linear-gradient(45deg, rgba(0, 0, 0, 0), rgba(88, 101, 242, 0.3))',
					},
				]}
			/>
			<View
				style={{ flexDirection: 'row', padding: 16, alignItems: 'flex-start' }}
			>
				<View style={{ flex: 1, marginRight: 16 }}>
					<View style={{ marginBottom: 6 }}>
						<Text variant="heading-lg/semibold" color="text-strong">
							Support kmmiio99o
						</Text>
					</View>
					<View style={{ marginBottom: 12 }}>
						<Text variant="text-md/medium">
							You can support the development of my plugins by sponsoring on
							GitHub!
						</Text>
					</View>
					<View
						style={{
							flexDirection: 'row',
							flexWrap: 'wrap',
							gap: 8,
							alignItems: 'center',
						}}
					>
						<Button
							size="sm"
							icon={valenced.assets.getAssetIdByName('HeartIcon')}
							text="Sponsor"
							variant="expressive"
							onPress={() => Linking.openURL(SPONSORS_URL)}
						/>
						<Button
							size="sm"
							icon={valenced.assets.getAssetIdByName(
								'img_account_sync_github_light',
							)}
							text="GitHub"
							variant="primary-overlay"
							onPress={() => Linking.openURL(GITHUB_URL)}
						/>
						<Button
							size="sm"
							icon={valenced.assets.getAssetIdByName('GlobeEarthIcon')}
							text="Website"
							variant="tertiary"
							onPress={() => Linking.openURL(WEBSITE_URL)}
						/>
					</View>
				</View>
				<Pressable
					onPress={onPressAvatar}
					onPressIn={onPressIn}
					onPressOut={onPressOut}
					style={styles.avatarWrapper}
					hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
				>
					<Animated.View
						style={{
							width: AVATAR_SIZE,
							height: AVATAR_SIZE,
							borderRadius: AVATAR_SIZE / 2,
							transform: [{ rotate }, { scale: scaleAnim }],
						}}
					>
						<Image source={{ uri: AVATAR_URL }} style={styles.avatar} />
					</Animated.View>
				</Pressable>
			</View>
		</Card>
	)
}
