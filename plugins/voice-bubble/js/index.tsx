/* SPDX-License-Identifier: GPL-3.0-or-later
 * Mute & Deafen Bubble for Valenced, by MarkLong0467.
 * Based on Mute Bubble 3.3.3 by coder.gg (https://github.com/il1ll/ValencedPlugins, GPL-3.0): the bubble now has a
 * second button that deafens. The native half is source/android/marklong/voicebubble/VoiceBubble.java.
 */
import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { getStore } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { callNativeMethod } from '@valenced/modules/native'
import { afterJSX } from '@valenced/react/jsx-runtime'
import { createElement, Fragment, useEffect, useState } from 'react'
import { AppState, ScrollView } from 'react-native'
import type { JsonStorage } from '@valenced/json-storage'
import type { ComponentType, ReactElement } from 'react'

interface ChangeStore {
	addChangeListener(listener: () => void): void
	removeChangeListener(listener: () => void): void
}

interface VoiceChannelStore extends ChangeStore {
	getVoiceChannelId(): string | null | undefined
}

interface MediaEngineStore extends ChangeStore {
	isSelfMute(): boolean
	isSelfDeaf(): boolean
}

/** Which buttons the bubble has. */
type Buttons = 'both' | 'mute' | 'deafen'

interface BubbleSettings {
	enabled: boolean
	buttons: Buttons
}

const defaults: BubbleSettings = { enabled: true, buttons: 'both' }

const BUTTON_CHOICES: Array<{ value: Buttons; label: string; subLabel: string }> = [
	{ value: 'both', label: 'Mute and deafen', subLabel: 'Two buttons, mute on top' },
	{ value: 'mute', label: 'Mute only', subLabel: 'One button that mutes' },
	{ value: 'deafen', label: 'Deafen only', subLabel: 'One button that deafens' },
]

let running = false
let storage: JsonStorage<BubbleSettings> | undefined

const bubbleEnabled = () => storage?.cache?.enabled ?? defaults.enabled
/** The saved choice, or both buttons when nothing (or something unknown) is saved. */
const bubbleButtons = (): Buttons => {
	const saved = storage?.cache?.buttons
	return BUTTON_CHOICES.some(choice => choice.value === saved) ? (saved as Buttons) : defaults.buttons
}
let voiceStore: VoiceChannelStore | undefined
let mediaStore: MediaEngineStore | undefined
let lastState = ''

/** Asks Discord to toggle mute (`toggleSelfMute`) or deafen (`toggleSelfDeaf`), as its own buttons do. */
function toggle(method: 'toggleSelfMute' | 'toggleSelfDeaf') {
	const [AudioActions] = lookupModule(withProps<any>(method))
	if (typeof AudioActions?.[method] !== 'function') return
	try {
		AudioActions[method]()
	} catch {
		AudioActions[method]({ context: 'default' })
	}
}

function sendState() {
	if (!running) return
	const inCall = !!voiceStore?.getVoiceChannelId()
	const deafened = !!mediaStore?.isSelfDeaf()
	const muted = !!mediaStore?.isSelfMute() || deafened
	const enabled = bubbleEnabled()
	const buttons = bubbleButtons()
	const key = `${inCall}:${muted}:${deafened}:${enabled}:${buttons}`
	if (key === lastState) return
	lastState = key
	callNativeMethod('marklong.voicebubble.setState', [
		inCall,
		muted,
		deafened,
		enabled,
		buttons,
	]).catch(() => {
		lastState = ''
	})
}

async function listenForTaps() {
	while (running) {
		let action: string | null = 'none'
		try {
			action = await callNativeMethod('marklong.voicebubble.nextAction', [])
		} catch {
			await new Promise(resolve => setTimeout(resolve, 2000))
			continue
		}
		if (!running || action === 'stop') return
		if (action === 'toggleMute' || action === 'toggleDeaf') {
			toggle(action === 'toggleMute' ? 'toggleSelfMute' : 'toggleSelfDeaf')
			lastState = ''
			setTimeout(sendState, 300)
		}
	}
}

function EnableBubbleRow({
	store,
	Row,
}: {
	store: JsonStorage<BubbleSettings>
	Row: ComponentType<any>
}) {
	const enabled = store.use()?.enabled ?? defaults.enabled

	return (
		<Row
			label="Enable Bubble"
			subLabel="Show floating voice buttons when you leave Discord during a call"
			icon={<TableRowAssetIcon name="MicrophoneIcon" />}
			value={enabled}
			onValueChange={(value: boolean) => {
				void store.set({ enabled: value }).then(sendState)
			}}
		/>
	)
}

const isAudioOutputRow = (element: ReactElement<any>) =>
	typeof element?.props?.label === 'string' &&
	element.props.label.trim().toLowerCase() === 'change audio output'

function ButtonsGroup({ store }: { store: JsonStorage<BubbleSettings> }) {
	store.use()
	return (
		<Design.TableRadioGroup
			title="Buttons"
			value={bubbleButtons()}
			onChange={(value: Buttons) => {
				void store.set({ buttons: value }).then(sendState)
			}}
		>
			{BUTTON_CHOICES.map(choice => (
				<Design.TableRadioRow
					key={choice.value}
					label={choice.label}
					subLabel={choice.subLabel}
					value={choice.value}
				/>
			))}
		</Design.TableRadioGroup>
	)
}

function SettingsPage() {
	const { TableRowGroup, TableRow } = Design
	const [allowed, setAllowed] = useState<boolean | null>(null)

	const check = () =>
		callNativeMethod('marklong.voicebubble.canDrawOverlays', [])
			.then(value => setAllowed(value === true))
			.catch(() => setAllowed(false))

	useEffect(() => {
		check()
		const subscription = AppState.addEventListener('change', state => {
			if (state === 'active') check()
		})
		return () => subscription.remove()
	}, [])

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
		>
			<Page>
				{storage && (
					<TableRowGroup title="Bubble">
						<EnableBubbleRow store={storage} Row={Design.TableSwitchRow} />
					</TableRowGroup>
				)}
				{storage && <ButtonsGroup store={storage} />}
				<TableRowGroup
					title="Display Over Other Apps"
					description="The bubble needs this permission to float over other apps."
				>
					<TableRow
						label={
							allowed === null
								? 'Checking...'
								: allowed
									? 'Permission allowed'
									: 'Permission not allowed'
						}
						subLabel={
							allowed
								? 'The bubble will show when you leave Discord during a call.'
								: 'Tap below to allow Discord to display over other apps.'
						}
						icon={
							<TableRowAssetIcon
								name={allowed ? 'CircleCheckIcon' : 'CircleErrorIcon'}
							/>
						}
					/>
					<TableRow
						label="Open Permission Settings"
						arrow
						onPress={() =>
							void callNativeMethod(
								'marklong.voicebubble.openOverlaySettings',
								[],
							).catch(() => {})
						}
					/>
				</TableRowGroup>
			</Page>
		</ScrollView>
	)
}

declare module '@valenced/modules/native' {
	export interface NativeMethods {
		'marklong.voicebubble.setState': [
			args: [
				inCall: boolean,
				muted: boolean,
				deafened: boolean,
				enabled: boolean,
				buttons: Buttons,
			],
			returnValue: boolean,
		]
		'marklong.voicebubble.nextAction': [args: [], returnValue: string]
		'marklong.voicebubble.canDrawOverlays': [args: [], returnValue: boolean]
		'marklong.voicebubble.openOverlaySettings': [args: [], returnValue: boolean]
	}
}

export default plugin<{ jsonStorage: BubbleSettings }>({
	jsonStorage: {
		load: true,
		default: defaults,
	},
	start({ cleanup, jsonStorage }) {
		running = true
		lastState = ''
		storage = jsonStorage
		cleanup(jsonStorage.subscribe(() => sendState()))

		const SwitchRow = Design.TableSwitchRow as ComponentType<any>
		const rowTypes = new Set(
			[Design.TableRow, Design.ActionSheetRow].filter(Boolean),
		)
		for (const Row of rowTypes)
			cleanup(
				afterJSX(Row as ComponentType<any>, element => {
					if (!isAudioOutputRow(element as ReactElement<any>)) return element
					return createElement(
						Fragment,
						{ key: (element as ReactElement).key ?? 'voice-bubble' },
						createElement(EnableBubbleRow, {
							store: jsonStorage,
							Row: SwitchRow,
						}),
						element,
					)
				}),
			)

		cleanup(
			getStore<VoiceChannelStore>('SelectedVoiceChannelStore', store => {
				voiceStore = store
				store.addChangeListener(sendState)
				cleanup(() => store.removeChangeListener(sendState))
				sendState()
			}),
			getStore<MediaEngineStore>('MediaEngineStore', store => {
				mediaStore = store
				store.addChangeListener(sendState)
				cleanup(() => store.removeChangeListener(sendState))
				sendState()
			}),
		)

		void listenForTaps()

		cleanup(() => {
			running = false
			voiceStore = undefined
			mediaStore = undefined
			storage = undefined
			callNativeMethod('marklong.voicebubble.setState', [
				false,
				false,
				false,
				false,
				'both',
			]).catch(() => {})
		})
	},
	SettingsComponent: SettingsPage,
})
