import { KmmiioFooter } from '../../../shared/kmmiio/Footer'
import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { colorIntToHex, openNativeColorPicker } from './lib/colorPicker'
import type { PluginApi } from '@valenced/plugins/types'
import type { ChatBubblesStorage } from './types'

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: ChatBubblesStorage }>
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView, View } = valenced.react.ReactNative
	const { Card, Stack, TableRowGroup, TableRow, TableSwitchRow } =
		valenced.discord.design.Design

	// Root settings page receives api with jsonStorage
	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<ChatBubblesStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Appearance">
						<Card style={{ padding: 16, gap: 20 }}>
							<SliderRow
								label="Avatar Radius"
								value={s.avatarRadius}
								onChange={v => set({ avatarRadius: v })}
							/>
							<SliderRow
								label="Bubble Radius"
								value={s.bubbleChatRadius}
								onChange={v => set({ bubbleChatRadius: v })}
							/>
						</Card>
					</TableRowGroup>
					<TableRowGroup>
						<TableSwitchRow
							label="Custom Bubble Color"
							subLabel="Off uses the plugin's default bubble color"
							value={s.customBubbleColor}
							onValueChange={v => set({ customBubbleColor: v })}
						/>
						{s.customBubbleColor && (
							<TableRow
								label="Bubble Color"
								subLabel={
									s.bubbleColor != null
										? colorIntToHex(s.bubbleColor)
										: 'Tap to choose a color'
								}
								arrow
								trailing={
									<View
										style={{
											width: 24,
											height: 24,
											borderRadius: 12,
											backgroundColor:
												s.bubbleColor != null
													? colorIntToHex(s.bubbleColor)
													: '#000000',
										}}
									/>
								}
								onPress={() =>
									openNativeColorPicker(color => set({ bubbleColor: color }))
								}
							/>
						)}
					</TableRowGroup>
					<KmmiioFooter diag={diag} />
				</Stack>
			</ScrollView>
		</Page>
	)
}

function SliderRow({
	label,
	value,
	onChange,
}: {
	label: string
	value: number
	onChange: (v: number) => void
}) {
	const { View } = valenced.react.ReactNative
	const { Slider, Text } = valenced.discord.design.Design

	return (
		<View style={{ gap: 8 }}>
			<View
				style={{
					flexDirection: 'row',
					justifyContent: 'space-between',
					alignItems: 'center',
				}}
			>
				<Text variant="text-md/semibold" color="text-strong">
					{label}
				</Text>
				<Text variant="text-md/medium" color="text-muted">
					{Math.round(value)}
				</Text>
			</View>
			<Slider
				value={value}
				minimumValue={0}
				maximumValue={50}
				step={1}
				onValueChange={onChange}
			/>
		</View>
	)
}
