import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { setStorage } from './config'
import { DEFAULT_SETTINGS, SHOWN_HEARD } from './constants'
import { clearHeard, heardList, hooks, logText, subscribe } from './state'
import { copyText } from './util'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { HapticsSettings } from './types'

/** The heading and the line under it. They are constants because React Native text must be passed as an expression. */
const TITLE = 'Haptics'
const SUBTITLE = 'Choose what buzzes your phone'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: HapticsSettings }>
>

/** A row with a label and a line of text under it. */
const row = (label: string, subLabel?: string) => (
	<Design.TableRow
		key={String(label) + String(subLabel || '')}
		label={label}
		subLabel={subLabel}
	/>
)

/** A row that does something when tapped. */
const press = (label: string, subLabel: string, onPress: () => void) => (
	<Design.TableRow
		key={`p:${label}`}
		label={label}
		subLabel={subLabel}
		onPress={onPress}
	/>
)

/** A titled group of rows. */
const group = (title: string, rows: ReactNode[]) => (
	<Design.TableRowGroup key={`g:${title}`} title={title}>
		{rows.filter(Boolean)}
	</Design.TableRowGroup>
)

/** A short muted paragraph between groups. */
const noteText = (text: string) => (
	<Design.Text
		key={`n:${text.slice(0, 24)}`}
		variant="text-sm/medium"
		color="text-muted"
		style={{ paddingHorizontal: 4 }}
	>
		{text}
	</Design.Text>
)

/**
 * The settings screen: three switches (menus, other haptic feedback, vibrations), what the plugin found in Discord,
 * the buzzes that went by just now, and tools for tracking down a buzz that is not caught (copy the log, clear the list).
 * It draws itself again whenever the plugin notices something new.
 */
export default function Settings({ api }: Props) {
	const storage = api.jsonStorage
	setStorage(storage)
	const data = { ...DEFAULT_SETTINGS, ...(storage.use() ?? {}) }

	const [, setTick] = useState(0)
	useEffect(() => subscribe(() => setTick(count => count + 1)), [])

	/** One switch row, saved under `key`. */
	const toggle = (
		key: keyof HapticsSettings,
		label: string,
		subLabel: string,
	) => (
		<Design.TableSwitchRow
			key={key}
			label={label}
			subLabel={subLabel}
			value={!!data[key]}
			onValueChange={value => storage.set({ [key]: value })}
		/>
	)

	const lines = heardList()
		.slice(0, SHOWN_HEARD)
		.map(buzz => row(buzz.label, `${buzz.note} · ${buzz.count}x`))

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 48 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack
				style={{ paddingVertical: 16, paddingHorizontal: 12 }}
				spacing={20}
			>
				{[
					<View key="title" style={{ paddingHorizontal: 4 }}>
						<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{SUBTITLE}
						</Design.Text>
					</View>,
					group('Buzzing', [
						toggle(
							'menus',
							'Buzz when a menu opens',
							'The buzz when you long-press a message, server or person and a menu opens',
						),
						toggle(
							'discord',
							'Other haptic feedback',
							'Taps, switches and other small buzzes from Discord',
						),
						toggle(
							'vibration',
							'Vibrations',
							'Longer vibrations an app asks for',
						),
					]),
					noteText(
						'Turn a switch off to stop that buzz. Changes apply right away. If something still buzzes, the list below shows what Discord asked for.',
					),
					group('What this found', [
						row('Menus', hooks.menus),
						row('Haptic libraries', hooks.libraries),
						row('Vibrations', hooks.vibration),
					]),
					group(
						'Buzzes just now',
						lines.length
							? lines
							: [
									row(
										'Nothing yet',
										'Long-press something, then come back here',
									),
								],
					),
					group('Troubleshooting', [
						press('Copy the log', 'Send this when a buzz is not caught', () =>
							copyText(logText(), 'Log'),
						),
						press(
							'Clear the list',
							'Start the list of buzzes again',
							clearHeard,
						),
					]),
					group('About', [
						row(
							'What this does',
							'Switches off the buzzing from Discord that you do not want. It cannot change the touch feedback of your phone itself, which is set in Android under Sound and vibration.',
						),
					]),
				]}
			</Design.Stack>
		</ScrollView>
	)
}
