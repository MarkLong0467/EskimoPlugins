import { useEffect, useReducer } from 'react'
import { KmmiioFooter } from '../../../../shared/kmmiio/Footer'
import { ACTIVITY_LABELS, DEFAULTS } from '../constants'
import { diag } from '../diag'
import {
	formatDuration,
	formatElapsed,
	formatRemaining,
	sessionLength,
} from '../lib/elapsed'
import { getImagePreviewUri } from '../lib/state'
import ActivityVisibilityNotice from './components/ActivityVisibilityNotice'
import TextInputRow from './components/TextInputRow'
import { LARGE_IMAGE_ROUTE, SMALL_IMAGE_ROUTE } from './routes'
import { openActivityTypePicker } from './sheets/ActivityTypeSheet'
import { openApplicationSheet } from './sheets/ApplicationSheet'
import {
	openElapsedEndPicker,
	openElapsedTimePicker,
} from './sheets/ElapsedTimeSheet'
import type { PluginApi } from '@valenced/plugins/types'
import type { CustomRpcStorage } from '../types'

const thumbStyle = {
	width: 40,
	height: 40,
	borderRadius: 8,
	backgroundColor: '#1e1f22',
} as const

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: CustomRpcStorage }>
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView, View, Image } = valenced.react.ReactNative
	const { Stack, TableRowGroup, TableRow, TableSwitchRow, Text } =
		valenced.discord.design.Design
	const { useNavigation } =
		valenced.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }

	const s: CustomRpcStorage = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }

	// `use()` alone did not reliably repaint this page when an image was changed
	// on a sub-page, so the Images rows and preview could stay stale until the
	// page was reopened. An explicit subscription guarantees a repaint on every
	// storage write, including ones made from other roots (the asset library).
	const [, forceRender] = useReducer((n: number) => n + 1, 0)
	useEffect(() => api.jsonStorage.subscribe(() => forceRender()), [api])

	const set = (patch: Partial<CustomRpcStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	const setButton = (
		index: 0 | 1,
		patch: Partial<CustomRpcStorage['buttons'][0]>,
	) => {
		const buttons = s.buttons.map((b, i) =>
			i === index ? { ...b, ...patch } : b,
		)
		set({ buttons })
	}

	const largePreview = getImagePreviewUri(s.largeImage, s.clientId)
	const smallPreview = getImagePreviewUri(s.smallImage, s.clientId)

	const imageSubLabel = (config: CustomRpcStorage['largeImage']) => {
		if (config.source === 'none') return 'No image set'
		return config.value || 'Tap to configure'
	}

	// The end is stored as an absolute epoch but always derived as start+length,
	// so the row reports the remaining time the card will show alongside the
	// total session length it was set from.
	const endSubLabel = (config: CustomRpcStorage) => {
		const length = sessionLength(config.timestampStart, config.timestampEnd)
		if (length <= 0) return 'None'
		return `${formatRemaining(config.timestampEnd)} of ${formatDuration(length)}`
	}

	return (
		<Page>
			<ActivityVisibilityNotice />
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="Application">
						<TableRow
							label="Application ID"
							subLabel={
								s.clientId
									? `${s.clientId}${s.applicationName ? ` — ${s.applicationName}` : ''}`
									: 'Tap to set or verify'
							}
							trailing={<TableRow.Arrow />}
							onPress={openApplicationSheet}
						/>
						<TextInputRow
							label="Application name"
							value={s.applicationName}
							onChange={v => set({ applicationName: v })}
							placeholder="Shown next to the status type"
						/>
					</TableRowGroup>

					<TableRowGroup title="Activity">
						<TableSwitchRow
							label="Enabled"
							subLabel="Show this activity on your profile"
							value={s.enabled}
							onValueChange={(v: boolean) => set({ enabled: v })}
						/>
						<TableRow
							label="Status type"
							subLabel={ACTIVITY_LABELS[s.activityType] ?? 'Playing'}
							trailing={<TableRow.Arrow />}
							onPress={openActivityTypePicker}
						/>
						<TextInputRow
							label="Details"
							value={s.details}
							onChange={v => set({ details: v })}
							placeholder="Headline line"
						/>
						<TextInputRow
							label="State"
							value={s.state}
							onChange={v => set({ state: v })}
							placeholder="Secondary line"
						/>
						<TableSwitchRow
							label="Show timestamps"
							subLabel="Works for every status, including Listening"
							value={s.showTimestamp}
							onValueChange={(v: boolean) =>
								set({
									showTimestamp: v,
									// Seeding the anchor on enable is what makes the counter
									// start from zero rather than from the plugin's boot time.
									timestampStart: v
										? s.timestampStart || Date.now()
										: s.timestampStart,
								})
							}
						/>
						<TableRow
							label="Start time"
							subLabel={formatElapsed(s.timestampStart)}
							trailing={<TableRow.Arrow />}
							disabled={!s.showTimestamp}
							onPress={openElapsedTimePicker}
						/>
						<TableRow
							label="End time"
							subLabel={endSubLabel(s)}
							trailing={<TableRow.Arrow />}
							disabled={!s.showTimestamp}
							onPress={openElapsedEndPicker}
						/>
					</TableRowGroup>

					<TableRowGroup title="Images">
						<TableRow
							label="Large image"
							subLabel={imageSubLabel(s.largeImage)}
							trailing={
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										gap: 8,
									}}
								>
									{largePreview ? (
										<Image source={{ uri: largePreview }} style={thumbStyle} />
									) : null}
									<TableRow.Arrow />
								</View>
							}
							onPress={() => navigation.navigate(LARGE_IMAGE_ROUTE)}
						/>
						<TableRow
							label="Small image"
							subLabel={imageSubLabel(s.smallImage)}
							trailing={
								<View
									style={{
										flexDirection: 'row',
										alignItems: 'center',
										gap: 8,
									}}
								>
									{smallPreview ? (
										<Image source={{ uri: smallPreview }} style={thumbStyle} />
									) : null}
									<TableRow.Arrow />
								</View>
							}
							onPress={() => navigation.navigate(SMALL_IMAGE_ROUTE)}
						/>
					</TableRowGroup>

					{/*
					 * Rows must be direct children of the group: `TableRowGroup` walks
					 * them with `React.Children.map` to insert a divider between each
					 * one, and that does NOT descend into a Fragment (verified — a
					 * Fragment counts as one child). So the rows are flattened here
					 * with flatMap instead of being wrapped in a component/Fragment.
					 */}
					<TableRowGroup title="Buttons">
						{s.buttons.flatMap((button, index) => {
							const rows: React.ReactNode[] = [
								<TableSwitchRow
									key={`b${index}-enabled`}
									label={`Button ${index + 1}`}
									subLabel={
										button.enabled ? 'Shown on your profile' : 'Disabled'
									}
									value={button.enabled}
									onValueChange={(v: boolean) =>
										setButton(index as 0 | 1, { enabled: v })
									}
								/>,
							]
							if (button.enabled) {
								rows.push(
									<TextInputRow
										key={`b${index}-label`}
										label="Label"
										value={button.label}
										onChange={v => setButton(index as 0 | 1, { label: v })}
										placeholder="Button text"
									/>,
									<TextInputRow
										key={`b${index}-url`}
										label="URL"
										value={button.url}
										onChange={v => setButton(index as 0 | 1, { url: v })}
										placeholder="https://…"
									/>,
								)
							}
							return rows
						})}
					</TableRowGroup>

					<Text
						variant="text-sm/medium"
						color="text-muted"
						style={{ paddingHorizontal: 16 }}
					>
						Shows a custom Rich Presence activity on your profile. Images and
						buttons require an Application ID.
					</Text>

					<KmmiioFooter diag={diag} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
