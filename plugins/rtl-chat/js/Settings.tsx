import { Design } from '@valenced/discord/design'
import { ScrollView } from 'react-native'
import { DEFAULT_SETTINGS, STYLES } from './constants'
import { applyDirection, isRtlNow, restartApp } from './direction'
import { changed, hooked, saveSettings, setStorage, textAligned } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Mode, RtlSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: RtlSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const STYLE_TITLE = 'Style'
const RESTART_TITLE = 'Restart needed'
const MIRROR_TITLE = 'Mirror everything'
const STATUS_TITLE = 'Status'

/**
 * The settings screen: the style, a note (and a restart button) when the layout direction will only change after a
 * restart, the "readable text" switch for the mirror style, and a status list of what is hooked.
 * Choosing a style asks the phone for the matching layout direction at once; the phone applies it when Discord restarts.
 */
export default function Settings({ api }: Props) {
	const json = api.jsonStorage
	setStorage(json)
	const settings = { ...DEFAULT_SETTINGS, ...(json.use() ?? {}) }

	/** Saves one setting and tells the mirrored app to draw again. */
	const put = (patch: Partial<RtlSettings>) => {
		saveSettings(patch)
		setTimeout(changed, 50)
	}

	const mode: Mode = settings.mode === 'align' ? 'rtl' : settings.mode
	const now = isRtlNow()
	const wantRtl = mode === 'rtl'
	const pending = wantRtl !== now

	const rows = `${hooked.rows} · rows seen: ${hooked.seen} · lined up: ${hooked.changed}${textAligned() ? '' : ' · (off in this style)'}`
	const hookLine =
		hooked.how + (hooked.fired ? ` · flipped through ${hooked.fired}` : '')

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				<Design.TableRadioGroup
					title={STYLE_TITLE}
					value={mode}
					onChange={(value: Mode) => {
						put({ mode: value })
						hooked.direction = applyDirection(value)
					}}
				>
					{STYLES.map(r => (
						<Design.TableRadioRow
							key={r.value}
							label={r.label}
							subLabel={r.subLabel}
							value={r.value}
						/>
					))}
				</Design.TableRadioGroup>
				{pending ? (
					<Design.TableRowGroup title={RESTART_TITLE}>
						<Design.TableRow
							key="pending"
							label={
								wantRtl
									? 'Right to left is set, but not on yet'
									: 'Normal direction is set, but right to left is still on'
							}
							subLabel="Discord decides the layout direction when it starts. Restart it to apply."
						/>
						<Design.TableRow
							key="restart"
							label="Restart Discord now"
							subLabel="Closes and reopens the app"
							onPress={restartApp}
						/>
					</Design.TableRowGroup>
				) : null}
				{mode === 'mirror' ? (
					<Design.TableRowGroup title={MIRROR_TITLE}>
						<Design.TableSwitchRow
							key="readable"
							label="Readable text and pictures"
							subLabel="Letters and pictures face the normal way. Off is a true mirror, letters reversed. Messages are drawn by Discord itself, so their letters stay mirrored either way"
							value={!!settings.readable}
							onValueChange={(value: boolean) => put({ readable: value })}
						/>
					</Design.TableRowGroup>
				) : null}
				<Design.TableRowGroup title={STATUS_TITLE}>
					<Design.TableRow
						key="dir"
						label="Layout direction right now"
						subLabel={now ? 'Right to left' : 'Left to right'}
					/>
					<Design.TableRow key="rows" label="Message text" subLabel={rows} />
					{hooked.direction ? (
						<Design.TableRow
							key="dirError"
							label="Problem"
							subLabel={hooked.direction}
						/>
					) : null}
					{mode === 'mirror' ? (
						<Design.TableRow
							key="hook"
							label="Mirror hooked into"
							subLabel={hookLine}
						/>
					) : null}
					{mode === 'mirror' ? (
						<Design.TableRow
							key="registry"
							label="Apps Discord registered"
							subLabel={hooked.registry || 'unknown'}
						/>
					) : null}
					<Design.TableRow
						key="note"
						label="Before you uninstall"
						subLabel="Set the style to Off first and restart Discord, or the phone can stay right to left."
					/>
				</Design.TableRowGroup>
			</Design.Stack>
		</ScrollView>
	)
}
