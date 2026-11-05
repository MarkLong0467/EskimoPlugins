import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { Card, Picker, Pill, Radio } from './components'
import { listenToSettings, saveSettings, setStorage, setting } from './config'
import {
	ASK_ABOVE,
	PASSES,
	QUALITIES,
	RATIOS,
	SIDES,
	SMALLEST,
	TARGETS,
	VERSION,
} from './constants'
import { toast } from './format'
import { copyReport, runSelfCheck } from './report'
import { hooks, log, stats } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Check, CropSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: CropSettings }>
>

/** The texts of the screen. Constants because React Native text must be passed as an expression. */
const SMALLEST_TITLE = 'Need a really small crop?'
const SMALLEST_TEXT =
	'One tap sets this up: crop again and again on its own until the picture is 32 px or less, no starting shape, up to 15 crops. Each crop starts from the last one, so the area you pick shrinks every time. Tap Cancel in the cropper when it is small enough.'
const MODE_ITEMS = [
	{
		v: 'ask',
		l: 'Ask me after each crop',
		s: 'A sheet: crop smaller, use this one, go back or cancel',
	},
	{
		v: 'auto',
		l: 'Keep going until it is small',
		s: 'The cropper opens again at once. Tap Cancel in it to keep the last result',
	},
]
const SCOPE_ITEMS = [
	{
		v: 'attachments',
		l: 'Pictures you send',
		s: 'The Edit image crop of an attachment',
	},
	{
		v: 'everywhere',
		l: 'Every crop',
		s: 'Also profile pictures, server icons and so on',
	},
]

/** The size of a limit on its chip: `256px`, or a word for 0. */
const pixels = (zero: string) => (value: number) =>
	value ? `${value}px` : zero

/**
 * The settings screen: the main switch and status, the one-tap "smallest crop" setup, the options for crop again and
 * the cropper's look, shrinking, a self-check, the last actions and some notes on how the cropper behaves.
 * It draws itself again whenever a setting or the log changes.
 */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, setRedraws] = useState(0)
	const [checks, setChecks] = useState<Check[] | null>(null)
	useEffect(() => listenToSettings(() => setRedraws(n => n + 1)), [])

	const on = !!setting('enabled')
	const state = !on
		? { text: 'Off', color: '#80848e' }
		: hooks.cropper !== 'found'
			? { text: 'Waiting for the cropper', color: '#f0b232' }
			: { text: 'On', color: '#23a55a' }

	const switchRow = (
		key: keyof CropSettings,
		label: string,
		subLabel: string,
	) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={!!setting(key)}
			onValueChange={(value: boolean) => saveSettings({ [key]: !!value })}
		/>
	)
	const title = `Crop Plus ${VERSION}`
	const summary = `${stats.crops} crop${stats.crops === 1 ? '' : 's'} so far, ${stats.extra} extra pass${stats.extra === 1 ? '' : 'es'}. To use it: add a picture, tap it, choose Edit image, crop, and a sheet offers to crop smaller.`

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 20, paddingHorizontal: 12 }}
				spacing={22}
			>
				<Card key="top">
					<View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
						<Design.Text variant="heading-lg/bold">{title}</Design.Text>
						<Pill text={state.text} color={state.color} />
					</View>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{summary}
					</Design.Text>
					<View style={{ flexDirection: 'row', gap: 10 }}>
						<View style={{ flex: 1 }}>
							<Design.Button
								text="Self-check"
								variant="primary"
								size="sm"
								onPress={() => setChecks(runSelfCheck())}
							/>
						</View>
						<View style={{ flex: 1 }}>
							<Design.Button
								text="Copy report"
								variant="secondary"
								size="sm"
								onPress={() => copyReport()}
							/>
						</View>
					</View>
				</Card>
				<Card key="smallest">
					<Design.Text variant="text-md/bold">{SMALLEST_TITLE}</Design.Text>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{SMALLEST_TEXT}
					</Design.Text>
					<Design.Button
						text="Set up for the smallest crop"
						variant="primary"
						size="sm"
						onPress={() => {
							saveSettings(SMALLEST)
							toast('Done. Add a picture, tap Edit image and crop it.')
						}}
					/>
				</Card>
				<Design.TableRowGroup key="general" title="General">
					{switchRow('enabled', 'Crop Plus', 'The main switch')}
					{switchRow(
						'again',
						'Crop again',
						'After each crop, crop the result again so the passes add up',
					)}
				</Design.TableRowGroup>
				{setting('again') && (
					<Radio
						key="mode"
						title="How it goes on"
						value={setting('mode')}
						onChange={v => saveSettings({ mode: v as CropSettings['mode'] })}
						items={MODE_ITEMS}
					/>
				)}
				{setting('again') && setting('mode') === 'auto' && (
					<Picker
						key="target"
						title="Stop when the longest side is at most"
						value={setting('targetPx')}
						options={TARGETS}
						format={v => `${v}px`}
						onPick={v => saveSettings({ targetPx: v })}
					/>
				)}
				<Radio
					key="scope"
					title="Where it works"
					value={setting('scope')}
					onChange={v => saveSettings({ scope: v as CropSettings['scope'] })}
					items={SCOPE_ITEMS}
				/>
				<Picker
					key="passes"
					title="Most crops in a row"
					value={setting('maxPasses')}
					options={PASSES}
					onPick={v => saveSettings({ maxPasses: v })}
				/>
				<Picker
					key="above"
					title="Only ask when the picture is bigger than"
					subtitle="The longest side, in pixels. 0 asks after every crop"
					value={setting('askAbove')}
					options={ASK_ABOVE}
					format={pixels('Always')}
					onPick={v => saveSettings({ askAbove: v })}
				/>
				<Design.TableRowGroup key="extra" title="The sheet">
					{switchRow(
						'undoStack',
						'Allow going back one crop',
						'Shows "Go back to ..." from the second crop on',
					)}
					{switchRow(
						'cleanTemp',
						'Delete the pictures of earlier crops',
						'When you are done, only the last one is kept',
					)}
					{switchRow(
						'titles',
						'Show the crop number in the title',
						'The cropper’s title says "Crop 2 · 500 × 400" from the second crop on',
					)}
					{switchRow(
						'tips',
						'Show a tip when the cropper opens',
						'Once each time Discord starts',
					)}
				</Design.TableRowGroup>
				<Radio
					key="ratio"
					title="Starting shape of the frame"
					value={setting('ratio')}
					onChange={v => saveSettings({ ratio: v })}
					items={RATIOS}
				/>
				<Design.TableRowGroup key="look" title="The cropper">
					{switchRow(
						'freeStyle',
						'Free resizing',
						'The frame can be dragged to any shape',
					)}
					{switchRow('guidelines', 'Grid lines', 'Thirds inside the frame')}
					{switchRow('frame', 'Frame border', 'The line around the frame')}
					{switchRow(
						'rotation',
						'Rotate with two fingers',
						'The Rotate tab always works',
					)}
					{switchRow(
						'bottomControls',
						'Scale and Rotate tabs',
						'Keep the controls at the bottom',
					)}
				</Design.TableRowGroup>
				<Picker
					key="maxWidth"
					title="Shrink the result: widest"
					subtitle="Pictures bigger than this are scaled down. 0 does not shrink"
					value={setting('maxWidth')}
					options={SIDES}
					format={pixels('No limit')}
					onPick={v => saveSettings({ maxWidth: v })}
				/>
				<Picker
					key="maxHeight"
					title="Shrink the result: tallest"
					value={setting('maxHeight')}
					options={SIDES}
					format={pixels('No limit')}
					onPick={v => saveSettings({ maxHeight: v })}
				/>
				<Picker
					key="quality"
					title="Quality of the result"
					subtitle="Lower is a smaller file"
					value={setting('quality')}
					options={QUALITIES}
					format={v => `${v}%`}
					onPick={v => saveSettings({ quality: v })}
				/>
				{checks && (
					<Design.TableRowGroup key="checks" title="Self-check">
						{checks.map((c, i) => (
							<Design.TableRow
								key={`c${i}`}
								label={`${c.ok ? '✓' : '✗'} ${c.label}`}
								subLabel={c.detail || undefined}
							/>
						))}
					</Design.TableRowGroup>
				)}
				{log.length > 0 && (
					<Design.TableRowGroup key="log" title="Last actions">
						{log.slice(0, 6).map((l, i) => (
							<Design.TableRow
								key={`l${i}`}
								label={`${l.ok ? '✓' : '✗'} ${l.text}`}
								subLabel={new Date(l.at).toLocaleTimeString()}
							/>
						))}
					</Design.TableRowGroup>
				)}
				<Design.TableRowGroup key="good" title="Good to know">
					<Design.TableRow
						key="g0"
						label="The frame cannot get smaller"
						subLabel="Discord’s cropper has a smallest frame (about 100 dp) that no plugin can change. What helps: pinch to zoom into the picture so the frame covers less, then tap the check mark. Crop Plus opens the cropper again on the result. The X on the first crop cancels everything; on later crops it keeps the last result."
					/>
					<Design.TableRow
						key="g1"
						label="Why crop again"
						subLabel="Discord’s cropper has a smallest frame and a biggest zoom. Cropping the result again starts from a smaller picture, so the passes add up."
					/>
					<Design.TableRow
						key="g2"
						label="Quality"
						subLabel="Each pass saves the picture again. Keep the quality at 100% unless you need a small file."
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
