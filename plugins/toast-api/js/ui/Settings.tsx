import { KmmiioFooter } from '../../../../shared/kmmiio/Footer'
import { toasts } from '../api/api'
import { diag } from '../diag'
import { setSettings } from '../lib/settings'
import { LivePreview } from './components/LivePreview'
import { useSettings } from './hooks'
import { openColoursSheet } from './sheets/ColoursSheet'
import { openIconSheet } from './sheets/IconSheet'
import { openLayoutSheet } from './sheets/LayoutSheet'
import { openPlacementSheet } from './sheets/PlacementSheet'
import { openSubtitleSheet } from './sheets/SubtitleSheet'
import { openTextSheet } from './sheets/TextSheet'
import { openTimingSheet } from './sheets/TimingSheet'
import type { PluginApi } from '@valenced/plugins/types'
import type { ToastApiSettings, ToastDurationMode } from '../types'

const MODE_LABEL: Record<ToastDurationMode, string> = {
	toast: 'Follow each toast',
	default: 'Use the default',
	override: 'Force one duration',
}

function demoUpdate(): void {
	const id = toasts.show({
		content: 'Uploading…',
		subtitle: 'photo.png',
		variant: 'info',
		duration: 0,
	})
	setTimeout(() => {
		toasts.update(id, {
			content: 'Still uploading…',
			subtitle: '4.2 MB of 18 MB',
		})
	}, 1500)
	setTimeout(() => {
		toasts.update(id, {
			content: 'Uploaded',
			subtitle: 'photo.png',
			variant: 'success',
		})
	}, 3500)
	setTimeout(() => toasts.close(id), 5500)
}

function demoPositions(): void {
	toasts.show({
		key: 'demo-top',
		content: 'At the top',
		position: 'top',
		duration: 4000,
	})
	toasts.show({
		key: 'demo-bottom',
		content: 'At the bottom',
		position: 'bottom',
		duration: 4000,
	})
}

function demoStack(): void {
	const labels = ['First', 'Second', 'Third']
	labels.forEach((label, index) => {
		toasts.show({
			key: `demo-stack-${index}`,
			content: `${label} of three`,
			duration: 4000,
		})
	})
}

const ALERT_KEY = 'toast-api-demo-alert'

function demoModal(): void {
	toasts.show({
		content: 'Tap to open a modal',
		subtitle: 'onPress → openAlert()',
		variant: 'info',
		duration: 0,
		onPress: () => {
			const { AlertModal, AlertActionButton } = valenced.discord.design
				.Design as any
			const alerts = valenced.discord.actions?.AlertActionCreators
			if (typeof alerts?.openAlert !== 'function') {
				toasts.show({ content: 'Alerts are unavailable', variant: 'critical' })
				return
			}
			alerts.openAlert(
				ALERT_KEY,
				<AlertModal
					title="Opened from a toast"
					content="The toast's onPress ran and handed this element straight to Discord's alert store. The toast closed itself the moment the tap landed."
					actions={
						<AlertActionButton
							variant="primary"
							text="Close"
							onPress={() => alerts.dismissAlert?.(ALERT_KEY)}
						/>
					}
				/>,
			)
		},
	})
}

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: ToastApiSettings }>
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { useEffect, useReducer } = valenced.react.React
	const { ScrollView } = valenced.react.ReactNative
	const { Stack, TableRow, TableRowGroup, TableSwitchRow } =
		valenced.discord.design.Design

	const s = useSettings()
	// Sheets write through `setSettings`, which repaints this page synchronously.
	// The storage subscription is a safety net for writes made from another root.
	const [, forceRender] = useReducer((n: number) => n + 1, 0)
	useEffect(() => api.jsonStorage.subscribe(() => forceRender()), [api])

	const layoutSub = `${s.radius} px radius · ${s.gap} px gap · ${
		s.shadow ? 'shadow' : 'no shadow'
	}`
	const textSub = s.fontFamily
		? `${s.textVariant} · ${s.fontFamily}`
		: s.textVariant
	const timingSub = `${MODE_LABEL[s.durationMode]} · ${
		s.maxVisible === 0 ? 'unlimited' : `${s.maxVisible} visible`
	}`
	const placementSub = s.position === 'top' ? 'Top' : 'Bottom'
	const iconSub = `${s.iconSize} px · ${s.iconSide === 'left' ? 'left' : 'right'}${
		s.showSecondIcon ? ' · two icons' : ''
	}`
	const shortSub =
		s.durationMode === 'toast'
			? 'duration: 1000 passed to show()'
			: 'Set Timing to Follow each toast to see 1 s'
	const updateSub =
		s.durationMode === 'toast'
			? 'show() → update() → update() → close()'
			: 'Needs Timing set to Follow each toast'
	const colourOverrides = [
		s.textColor,
		s.backgroundColor,
		s.borderColor,
	].filter(value => value.length > 0).length

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="What it does">
						<TableRow
							label="Legacy look"
							subLabel="Discord's own toast — rounded chip, hairline border, monochrome icon, legacy type"
						/>
						<TableRow
							label="Legacy motion"
							subLabel="The same springs Discord slides its toasts in and out with"
						/>
						<TableRow
							label="Your placement"
							subLabel={`${placementSub} by default, ${
								s.maxVisible === 0 ? 'unlimited' : `up to ${s.maxVisible}`
							} on screen`}
						/>
						<TableRow
							label="Ids, not keys"
							subLabel="show() hands back an id you can update() or close() later"
						/>
						<TableRow
							label="Ready for plugins"
							subLabel="plugin.api.toasts, or unscoped.toasts from anywhere"
						/>
					</TableRowGroup>

					<LivePreview />

					<TableRowGroup title="Try it">
						<TableRow
							label="Plain"
							subLabel={'toasts.show("Saved to your library")'}
							onPress={() => toasts.show('Saved to your library')}
						/>
						<TableRow
							label="With subtitle"
							subLabel="content plus a second line"
							onPress={() =>
								toasts.show({
									content: 'Message sent',
									subtitle: '#general',
								})
							}
						/>
						<TableRow
							label="Success"
							subLabel="variant: 'success'"
							onPress={() =>
								toasts.show({
									content: 'Saved to your library',
									subtitle: 'Synced across devices',
									variant: 'success',
								})
							}
						/>
						<TableRow
							label="Warning"
							subLabel="variant: 'warning'"
							onPress={() =>
								toasts.show({
									content: 'Storage almost full',
									subtitle: 'Free up space to keep syncing',
									variant: 'warning',
								})
							}
						/>
						<TableRow
							label="Critical"
							subLabel="variant: 'critical'"
							onPress={() =>
								toasts.show({
									content: 'Could not connect',
									subtitle: 'Tap to retry',
									variant: 'critical',
								})
							}
						/>
						<TableRow
							label="Info"
							subLabel="variant: 'info'"
							onPress={() =>
								toasts.show({
									content: 'Two new updates available',
									subtitle: 'Restart to apply them',
									variant: 'info',
								})
							}
						/>
						<TableRow
							label="Pressable"
							subLabel="onPress runs, then the toast closes itself"
							onPress={() =>
								toasts.show({
									content: 'Tap to retry',
									subtitle: 'The request timed out',
									variant: 'critical',
									duration: 0,
									onPress: () =>
										toasts.show({
											content: 'Retrying…',
											variant: 'info',
											duration: 2000,
										}),
								})
							}
						/>
						<TableRow
							label="Stays open after a tap"
							subLabel="onPress with closeOnPress: false"
							onPress={() =>
								toasts.show({
									content: 'Tap me as often as you like',
									subtitle: 'Nothing closes it but the clock',
									duration: 8000,
									closeOnPress: false,
									onPress: () => {},
								})
							}
						/>
						<TableRow
							label="Opens a modal"
							subLabel="onPress opens an alert, the toast closes itself"
							onPress={demoModal}
						/>
					</TableRowGroup>

					<TableRowGroup title="Try it — the rest of the API">
						<TableRow
							label="Update live"
							subLabel={updateSub}
							onPress={demoUpdate}
						/>
						<TableRow
							label="Both positions"
							subLabel="One at the top, one at the bottom"
							onPress={demoPositions}
						/>
						<TableRow
							label="Stack three"
							subLabel="Three separate ids on screen at once"
							onPress={demoStack}
						/>
						<TableRow
							label="Short toast"
							subLabel={shortSub}
							onPress={() =>
								toasts.show({ content: 'Gone in a second', duration: 1000 })
							}
						/>
						<TableRow
							label="Dismiss everything"
							subLabel="toasts.closeAll()"
							onPress={() => toasts.closeAll()}
						/>
					</TableRowGroup>

					<TableRowGroup title="Configure">
						<TableRow
							label="Layout"
							subLabel={layoutSub}
							arrow
							onPress={openLayoutSheet}
						/>
						<TableRow
							label="Text"
							subLabel={textSub}
							arrow
							onPress={openTextSheet}
						/>
						<TableRow
							label="Icon"
							subLabel={iconSub}
							arrow
							onPress={openIconSheet}
						/>
						<TableRow
							label="Subtitle"
							subLabel={
								s.showSubtitle ? s.subtitleVariant : 'Hidden for every toast'
							}
							arrow
							onPress={openSubtitleSheet}
						/>
						<TableRow
							label="Timing"
							subLabel={timingSub}
							arrow
							onPress={openTimingSheet}
						/>
						<TableRow
							label="Placement"
							subLabel={placementSub}
							arrow
							onPress={openPlacementSheet}
						/>
						<TableRow
							label="Colours"
							subLabel={
								colourOverrides === 0
									? "Discord's own tokens"
									: `${colourOverrides} of 3 overridden`
							}
							arrow
							onPress={openColoursSheet}
						/>
					</TableRowGroup>

					<TableRowGroup title="Overrides">
						<TableSwitchRow
							label="Override Discord's toasts"
							subLabel="Draw the toasts Discord asks for through this layer"
							value={s.overrideDiscordToasts}
							onValueChange={(v: boolean) =>
								setSettings({ overrideDiscordToasts: v })
							}
						/>
					</TableRowGroup>

					<KmmiioFooter diag={diag} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
