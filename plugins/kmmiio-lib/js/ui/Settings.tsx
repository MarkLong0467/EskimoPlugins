import { KmmiioFooter } from '../../../../shared/kmmiio/Footer'
import { diag } from '../diag'
import DonateCard from './DonateCard'
import FallingStars from './FallingStars'
import PluginList from './PluginList'

export default function Settings() {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView, View } = valenced.react.ReactNative
	const { Stack } = valenced.discord.design.Design
	const { useState, useRef } = valenced.react.React

	const pressCountRef = useRef(0)
	const [starsActive, setStarsActive] = useState(false)

	const handleAvatarPress = () => {
		pressCountRef.current++
		if (pressCountRef.current >= 50) setStarsActive(true)
	}

	return (
		<Page>
			<View style={{ flex: 1, position: 'relative' }}>
				<ScrollView contentContainerStyle={{ padding: 0 }}>
					<Stack>
						<DonateCard onAvatarPress={handleAvatarPress} />
						<PluginList />
						<KmmiioFooter diag={diag} />
					</Stack>
				</ScrollView>
				<FallingStars active={starsActive} />
			</View>
		</Page>
	)
}
