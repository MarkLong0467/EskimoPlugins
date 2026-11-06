import { pickSeedColor } from '../lib/colorPicker'
import { readWallpaper } from '../lib/native'
import { diagnostics } from '../lib/register'
import { previewStrip, toneIn } from '../lib/scheme'
import { setSettings } from '../lib/settings'
import { isLightTheme } from '../lib/tokens'
import { useSettings } from './hooks'
import type { WallpaperInfo } from '../lib/native'

function PaletteStrip({
	seed,
	mode,
}: {
	seed: string
	mode: 'dark' | 'light'
}) {
	const { View } = valenced.react.ReactNative
	const colours = previewStrip(mode, seed)
	return (
		<View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
			<View
				style={{ flexDirection: 'row', borderRadius: 16, overflow: 'hidden' }}
			>
				{colours.map((colour, index) => (
					<View
						key={index}
						style={{ flex: 1, height: 48, backgroundColor: colour }}
					/>
				))}
			</View>
		</View>
	)
}

function SeedSourceRow() {
	const { useEffect, useState } = valenced.react.React
	const { TableRow } = valenced.discord.design.Design
	const settings = useSettings()
	const [info, setInfo] = useState<WallpaperInfo | undefined>(undefined)

	useEffect(() => {
		let alive = true
		readWallpaper().then(result => {
			if (alive) setInfo(result)
		})
		return () => {
			alive = false
		}
	}, [settings.wallpaper, settings.seed])

	const status = !settings.wallpaper
		? 'Off · the fallback seed is used'
		: info === undefined
			? 'Reading…'
			: info.source === 'wallpaper'
				? `Home screen · ${info.method ?? 'wallpaper'} · ${info.primary}`
				: `${info.note ?? 'Wallpaper unreadable'} · ${settings.seed}`

	return <TableRow label="Seed source" subLabel={status} />
}

/** Open the plugin's options in a sheet over the App Theme screen. */
export function openOptionsSheet(): void {
	valenced.discord.actions.ActionSheetActionCreators.openLazy(
		Promise.resolve({ default: OptionsSheet }),
		'materialcord:options',
		{},
	)
}

let cachedBottomSheetScrollView: any = null

/**
 * The sheet's pan gesture owns vertical drags, so a plain RN ScrollView in the
 * body never receives them; Discord's own sheets scroll with
 * BottomSheetScrollView, which coordinates with the sheet. Fall back to
 * ScrollView if the module is missing.
 */
function resolveBottomSheetScrollView(): any {
	if (cachedBottomSheetScrollView != null) return cachedBottomSheetScrollView
	const finders = valenced.modules.finders
	try {
		const found = finders.lookupModule(
			finders.filters.withProps('BottomSheetScrollView'),
			{ initialize: true },
		)
		const component = found?.[0]?.BottomSheetScrollView
		if (component != null) cachedBottomSheetScrollView = component
		return component ?? null
	} catch {
		return null
	}
}

export default function OptionsSheet() {
	// The barrel's typed surface is missing a few action sheet pieces.
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRowGroup,
		TableRow,
		TableSwitchRow,
		Stack,
	} = Design
	const { ScrollView } = valenced.react.ReactNative
	const Scroll = resolveBottomSheetScrollView() ?? ScrollView

	const s = useSettings()
	const mode = isLightTheme() ? 'light' : 'dark'
	const status = diagnostics()
	const primary = toneIn(mode, s.seed, 'primary', mode === 'dark' ? 80 : 40)

	const semanticLabel =
		status.resolver === 'patched'
			? `${status.entries} entries · ${status.definitions} definitions`
			: status.tokens === 'none'
				? 'Token module not found'
				: 'Resolver unavailable'

	const rawLabel =
		status.raws > 0 ? `${status.raws} repaint getters` : 'Discord values'

	const reloadWallpaper = () => {
		void readWallpaper().then(info => {
			if (info.source === 'wallpaper' && info.primary != null) {
				setSettings({ seed: info.primary })
			}
		})
	}

	return (
		<ActionSheet
			scrollable
			contentStyles={{ paddingHorizontal: 0, paddingBottom: 0 }}
			header={
				<BottomSheetTitleHeader
					title="MaterialCord"
					subtitle="Material theming"
				/>
			}
		>
			<Scroll
				contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
				nestedScrollEnabled={true}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<Stack spacing={16} style={{ paddingHorizontal: 16 }}>
					<TableRowGroup title="Palette">
						<TableSwitchRow
							label="Material palette"
							subLabel="Repaint Discord's colours with Material families"
							value={s.enabled}
							onValueChange={(v: boolean) => setSettings({ enabled: v })}
						/>
						<TableSwitchRow
							label="Seed from wallpaper"
							subLabel="Take the palette from the home screen wallpaper"
							value={s.wallpaper}
							onValueChange={(v: boolean) => setSettings({ wallpaper: v })}
						/>
						<TableRow
							label="Fallback seed"
							subLabel={`${s.seed} · primary ${primary}`}
							arrow
							onPress={pickSeedColor}
						/>
						<SeedSourceRow />
						<TableRow
							label="Reload wallpaper"
							subLabel="Re-read it after changing the wallpaper"
							onPress={reloadWallpaper}
						/>
					</TableRowGroup>

					<PaletteStrip seed={s.seed} mode={mode} />
				</Stack>
			</Scroll>
		</ActionSheet>
	)
}
