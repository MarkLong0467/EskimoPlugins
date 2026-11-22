/* SPDX-License-Identifier: GPL-3.0-or-later
 * Mute & Deafen Bubble for Valenced, by MarkLong0467.
 * Based on Mute Bubble 3.3.3 by coder.gg (https://github.com/il1ll/ValencedPlugins, GPL-3.0): the bubble also has
 * deafen, screen share and disconnect buttons. The native half is source/android/marklong/voicebubble/VoiceBubble.java.
 */
import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { Design } from '@valenced/discord/design'
import { getStore } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
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

interface StreamingStore extends ChangeStore {
	getCurrentUserActiveStream(): { state?: string } | null | undefined
}

/** A button the bubble can have, in the order they appear (top to bottom). */
type Button = 'mute' | 'deafen' | 'screenshare' | 'disconnect'

/** The 0.2 setting (mute and deafen only). Still read for people upgrading. */
type OldButtons = 'both' | 'mute' | 'deafen'

interface BubbleSettings {
	enabled: boolean
	buttons?: OldButtons
	show?: Partial<Record<Button, boolean>>
}

const defaults: BubbleSettings = { enabled: true }

const BUTTONS: Array<{
	value: Button
	label: string
	subLabel: string
	icon: string
}> = [
	{
		value: 'mute',
		label: 'Mute',
		subLabel: 'Mute or unmute your mic',
		icon: 'MicrophoneIcon',
	},
	{
		value: 'deafen',
		label: 'Deafen',
		subLabel: 'Deafen or undeafen',
		icon: 'HeadphonesIcon',
	},
	{
		value: 'screenshare',
		label: 'Screen share',
		subLabel:
			'Start or stop sharing your screen (opens Discord so Android can ask)',
		icon: 'ScreenArrowIcon',
	},
	{
		value: 'disconnect',
		label: 'Disconnect',
		subLabel: 'Leave the call',
		icon: 'PhoneHangUpIcon',
	},
]

/** Shown in copied error reports. Keep in step with manifest.json. */
const VERSION = '0.3.1'

let running = false
let storage: JsonStorage<BubbleSettings> | undefined

const bubbleEnabled = () => storage?.cache?.enabled ?? defaults.enabled

/** Whether a button is on: its saved switch, else what the 0.2 choice meant. Buttons new in 0.3 start on. */
function isShown(
	settings: Partial<BubbleSettings> | undefined,
	button: Button,
): boolean {
	const saved = settings?.show?.[button]
	if (typeof saved === 'boolean') return saved
	const old = settings?.buttons
	if (button === 'mute') return old !== 'deafen'
	if (button === 'deafen') return old !== 'mute'
	return true
}

/** The buttons the bubble shows, top to bottom. Never empty: with every switch off, mute and deafen show. */
function bubbleButtons(
	settings: Partial<BubbleSettings> | undefined = storage?.cache,
): Button[] {
	const shown = BUTTONS.map(button => button.value).filter(button =>
		isShown(settings, button),
	)
	return shown.length ? shown : ['mute', 'deafen']
}

let voiceStore: VoiceChannelStore | undefined
let mediaStore: MediaEngineStore | undefined
let streamStore: StreamingStore | undefined
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

/** Whether you are sharing your screen now. */
function isSharing() {
	const stream = streamStore?.getCurrentUserActiveStream()
	return !!stream && stream.state !== 'ENDED' && stream.state !== 'FAILED'
}

/** Discord's own screen share functions (its call screen and Go Live sheet use them). */
const screenshareUtils = () =>
	lookupModule(withProps<any>('stopScreenshare', 'startStream'))[0]

/** Starts sharing as Discord's screen share button does; Android then asks for permission. */
async function startScreenshare() {
	// The bubble brings Discord to the front first: Android only asks while Discord is showing.
	for (let i = 0; i < 30 && AppState.currentState !== 'active'; i++)
		await new Promise(resolve => setTimeout(resolve, 100))
	const utils = screenshareUtils()
	const channelId = voiceStore?.getVoiceChannelId()
	const [ChannelStore] = lookupModule(
		withProps<any>('getChannel', 'getDMFromUserId'),
	)
	const channel = channelId ? ChannelStore?.getChannel?.(channelId) : null
	// tryStartScreenShare checks the channel's video permission and the Android version first.
	if (channel && typeof utils?.tryStartScreenShare === 'function')
		utils.tryStartScreenShare(channel)
	else if (typeof utils?.startStream === 'function') utils.startStream()
}

function stopScreenshare() {
	const utils = screenshareUtils()
	if (typeof utils?.stopScreenshare === 'function') utils.stopScreenshare()
	else if (typeof utils?.handleCloseScreenshare === 'function')
		utils.handleCloseScreenshare()
}

/** Leaves the call, as Discord's disconnect button does. */
function disconnect() {
	const [ChannelActions] = lookupModule(
		withProps<any>('selectVoiceChannel', 'disconnect'),
	)
	if (typeof ChannelActions?.disconnect === 'function')
		ChannelActions.disconnect()
	else ChannelActions?.selectVoiceChannel?.(null)
}

/** Store listeners run inside Discord's own updates: nothing here may throw. */
function sendState() {
	try {
		sendStateNow()
	} catch {
		lastState = ''
	}
}

function sendStateNow() {
	if (!running) return
	const inCall = !!voiceStore?.getVoiceChannelId()
	const deafened = !!mediaStore?.isSelfDeaf()
	const muted = !!mediaStore?.isSelfMute() || deafened
	const enabled = bubbleEnabled()
	const buttons = bubbleButtons().join(',')
	const sharing = isSharing()
	const key = `${inCall}:${muted}:${deafened}:${enabled}:${buttons}:${sharing}`
	if (key === lastState) return
	lastState = key
	callNativeMethod('marklong.voicebubble.setState', [
		inCall,
		muted,
		deafened,
		enabled,
		buttons,
		sharing,
	]).catch(() => {
		lastState = ''
	})
}

/** Runs a bubble action, then tells the bubble Discord's real state. */
function act(action: () => unknown) {
	Promise.resolve()
		.then(action)
		.catch(() => {})
		.then(() => {
			lastState = ''
			setTimeout(sendState, 300)
		})
}

const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * Asks the native half for bubble taps. It answers at once, so this asks a few times a second during a call (when the
 * bubble can be there) and every few seconds otherwise.
 */
async function listenForTaps() {
	while (running) {
		let action: string | null = 'none'
		try {
			action = await callNativeMethod('marklong.voicebubble.nextAction', [])
		} catch {
			await wait(2000)
			continue
		}
		if (!running || action === 'stop') return
		if (!action || action === 'none') {
			let inCall = false
			try {
				inCall = !!voiceStore?.getVoiceChannelId() && bubbleEnabled()
			} catch {}
			await wait(inCall ? 250 : 3000)
			continue
		}
		if (action === 'toggleMute') act(() => toggle('toggleSelfMute'))
		else if (action === 'toggleDeaf') act(() => toggle('toggleSelfDeaf'))
		else if (action === 'startShare') act(startScreenshare)
		else if (action === 'stopShare') act(stopScreenshare)
		else if (action === 'disconnect') act(disconnect)
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
	const settings = store.use() ?? store.cache
	const onCount = BUTTONS.filter(button =>
		isShown(settings, button.value),
	).length
	return (
		<Design.TableRowGroup
			title="Buttons"
			description="The buttons on the bubble, top to bottom. At least one stays on."
		>
			{BUTTONS.map(button => {
				const on = isShown(settings, button.value)
				return (
					<Design.TableSwitchRow
						key={button.value}
						label={button.label}
						subLabel={button.subLabel}
						icon={<TableRowAssetIcon name={button.icon} />}
						value={on}
						disabled={on && onCount === 1}
						onValueChange={(value: boolean) => {
							const show = {} as Record<Button, boolean>
							for (const each of BUTTONS)
								show[each.value] = isShown(store.cache, each.value)
							show[button.value] = value
							if (!Object.values(show).some(Boolean)) return
							void store.set({ show }).then(sendState)
						}}
					/>
				)
			})}
		</Design.TableRowGroup>
	)
}

/** The last error the native half caught (it no longer closes the app), with a button to copy it for a bug report. */
function ErrorGroup() {
	const { TableRowGroup, TableRow } = Design
	const [error, setError] = useState('')
	const [copied, setCopied] = useState(false)
	useEffect(() => {
		callNativeMethod('marklong.voicebubble.lastError', [])
			.then(value => setError(typeof value === 'string' ? value : ''))
			.catch(() => {})
	}, [])
	if (!error) return null
	return (
		<TableRowGroup
			title="Last error"
			description="Something went wrong in the bubble. It was stopped instead of closing Discord. Copy this into a bug report."
		>
			<TableRow
				label={copied ? 'Copied' : 'Copy error report'}
				subLabel={error.split('\n')[0]}
				icon={<TableRowAssetIcon name="CopyIcon" />}
				onPress={() => {
					try {
						Clipboard.setString(`Mute & Deafen Bubble ${VERSION}\n${error}`)
						setCopied(true)
					} catch {}
				}}
			/>
		</TableRowGroup>
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
				<ErrorGroup />
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
				buttons: string,
				sharing: boolean,
			],
			returnValue: boolean,
		]
		'marklong.voicebubble.nextAction': [args: [], returnValue: string]
		'marklong.voicebubble.canDrawOverlays': [args: [], returnValue: boolean]
		'marklong.voicebubble.openOverlaySettings': [args: [], returnValue: boolean]
		'marklong.voicebubble.lastError': [args: [], returnValue: string]
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

		const watch = <T extends ChangeStore>(
			name: string,
			keep: (store: T) => void,
		) =>
			getStore<T>(name, store => {
				keep(store)
				store.addChangeListener(sendState)
				cleanup(() => store.removeChangeListener(sendState))
				sendState()
			})

		cleanup(
			watch<VoiceChannelStore>('SelectedVoiceChannelStore', store => {
				voiceStore = store
			}),
			watch<MediaEngineStore>('MediaEngineStore', store => {
				mediaStore = store
			}),
			watch<StreamingStore>('ApplicationStreamingStore', store => {
				streamStore = store
			}),
		)

		void listenForTaps()

		cleanup(() => {
			running = false
			voiceStore = undefined
			mediaStore = undefined
			streamStore = undefined
			storage = undefined
			callNativeMethod('marklong.voicebubble.setState', [
				false,
				false,
				false,
				false,
				'mute,deafen',
				false,
			]).catch(() => {})
		})
	},
	SettingsComponent: SettingsPage,
})
