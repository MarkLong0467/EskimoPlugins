import { Design } from '@valenced/discord/design'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { store } from './config'
import { counts } from './state'
import { diag } from './diag'
import {
	isLiquidGlassSupported,
	LiquidGlassContainerView,
	LiquidGlassView,
} from './glass'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { GlassSettings, Strength, Tint } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: GlassSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Gives Discord a frosted glass look: see-through buttons, cards, text fields and sheets with a bright edge, in a colour you pick. It is also a library, so other plugins can use LiquidGlassView, LiquidGlassContainerView and isLiquidGlassSupported from callstack/liquid-glass.'
const REAL = 'Real liquid glass is available on this phone.'
const FALLBACK =
	'This phone cannot draw real liquid glass (it needs iOS 26), so surfaces get a frosted, see-through look instead.'
const NOTHING = 'Nothing yet: open a sheet or a page, then come back.'
const REDRAW =
	'Parts that are already on screen change the next time they are drawn: open another page, or reopen a sheet.'

/** The parts of Discord that can be frosted, each with its switch. */
const AREAS = [
	{
		key: 'bar',
		label: 'Profile bar',
		help: 'A glass rim around the bar with your name and status at the bottom of the channel list.',
	},
	{
		key: 'buttons',
		label: 'Buttons',
		help: 'A glass rim (bright top, warm bottom) on quiet buttons and round icon buttons, such as Search. Their shape and fill stay as they are.',
	},
	{
		key: 'cards',
		label: 'Cards',
		help: 'The boxes that group things on settings pages.',
	},
	{
		key: 'fields',
		label: 'Text fields',
		help: 'Search boxes and inputs.',
	},
	{
		key: 'sheets',
		label: 'Sheets and menus',
		help: 'The panels that slide up from the bottom and the pop-up menus.',
	},
] as const

const STRENGTHS: ReadonlyArray<{ value: Strength; label: string }> = [
	{ value: 'clear', label: 'Clear' },
	{ value: 'regular', label: 'Regular' },
	{ value: 'strong', label: 'Strong' },
]

const TINTS: ReadonlyArray<{ value: Tint; label: string }> = [
	{ value: 'white', label: 'White' },
	{ value: 'blue', label: 'Blue' },
	{ value: 'violet', label: 'Violet' },
	{ value: 'rose', label: 'Rose' },
	{ value: 'mint', label: 'Mint' },
]

/** The three effects shown in the preview. */
const SAMPLES = [
	{ effect: 'regular', text: 'Regular' },
	{ effect: 'clear', text: 'Clear' },
	{ effect: 'none', text: 'None' },
] as const

/** The settings screen: what to frost, how strong, what colour, and a preview. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				<Design.TableRowGroup title="Frost these" description={REDRAW}>
					{AREAS.map(area => (
						<Design.TableSwitchRow
							key={area.key}
							label={area.label}
							subLabel={area.help}
							value={!!store.get(area.key)}
							onValueChange={(value: boolean) =>
								store.set({ [area.key]: value })
							}
						/>
					))}
				</Design.TableRowGroup>
				<Design.TableRadioGroup<Strength>
					title="Strength"
					value={store.get('strength')}
					onChange={value => store.set({ strength: value })}
				>
					{STRENGTHS.map(item => (
						<Design.TableRadioRow<Strength>
							key={item.value}
							label={item.label}
							value={item.value}
						/>
					))}
				</Design.TableRadioGroup>
				<Design.TableRadioGroup<Tint>
					title="Colour"
					value={store.get('tint')}
					onChange={value => store.set({ tint: value })}
				>
					{TINTS.map(item => (
						<Design.TableRadioRow<Tint>
							key={item.value}
							label={item.label}
							value={item.value}
						/>
					))}
				</Design.TableRadioGroup>
				<Design.TableRowGroup title="This phone">
					<Design.TableRow
						label={isLiquidGlassSupported ? REAL : FALLBACK}
						labelLineClamp={4}
					/>
				</Design.TableRowGroup>
				<View style={{ marginHorizontal: 16 }}>
					<View
						style={{
							backgroundColor: '#5865F2',
							borderRadius: 20,
							padding: 18,
						}}
					>
						<LiquidGlassContainerView spacing={12}>
							<View style={{ gap: 12 }}>
								{SAMPLES.map(item => (
									<LiquidGlassView
										key={item.effect}
										effect={item.effect}
										style={{ borderRadius: 16, padding: 16 }}
									>
										<Design.Text variant="text-md/semibold">
											{item.text}
										</Design.Text>
									</LiquidGlassView>
								))}
							</View>
						</LiquidGlassContainerView>
					</View>
				</View>
				<Design.TableRowGroup
					title="What it found"
					description="How many of each part of Discord this plugin has drawn since it started. A part at 0 was not found."
				>
					{Object.keys(counts).length === 0 ? (
						<Design.TableRow label={NOTHING} />
					) : (
						Object.entries(counts).map(([name, count]) => (
							<Design.TableRow
								key={name}
								label={name}
								trailing={
									<Design.Text variant="text-md/medium" color="text-muted">
										{`${count.frosted} of ${count.seen}`}
									</Design.Text>
								}
							/>
						))
					)}
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
