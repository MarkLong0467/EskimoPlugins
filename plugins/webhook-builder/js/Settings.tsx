/**
 * The plugin's screen, which is where messages are made. Tabs: Compose (the message), Webhooks, Library (saved,
 * scheduled and sent messages) and Options. An embed or a webhook opens a screen of its own over the tabs.
 */

import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { ComposeTab, VARIABLE_HELP } from './ComposeTab'
import { diag } from './diag'
import { EmbedEditor } from './EmbedEditor'
import { LibraryTab } from './LibraryTab'
import { setStorage, state, subscribe, update } from './state'
import { flushFields, Group, Heading, Note, Toggle } from './ui'
import { WebhookScreen, WebhooksTab } from './WebhooksTab'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps, ReactNode } from 'react'
import type { Options, State } from './types'

type Props = ComponentProps<PluginSettingsComponent<{ jsonStorage: State }>>

type TabId = 'compose' | 'webhooks' | 'library' | 'options'
const TAB_IDS: readonly TabId[] = ['compose', 'webhooks', 'library', 'options']

const INTRO =
	'Make messages with embeds, buttons and polls, and send them with your webhooks, like Discohook. Save them, schedule them, and change or delete them after they are sent. Hold a message in chat and tap Webhook Builder to copy it here.'

/** The options. */
function OptionsTab() {
	const o = state().options
	const set = (patch: Partial<Options>) =>
		update(s => void Object.assign(s.options, patch))
	return (
		<Design.Stack spacing={18}>
			<Group title="Options">
				<Toggle
					label="Webhook Builder in the message menu"
					sub="Hold a message to copy it here, resend it, or change it"
					value={o.menu}
					onChange={v => set({ menu: v })}
				/>
				<Toggle
					label="Ask before sending"
					value={o.confirmSend}
					onChange={v => set({ confirmSend: v })}
				/>
				<Toggle
					label="Send late scheduled messages"
					sub="Ones that came due while Discord was closed are sent when it opens. Off: they are skipped"
					value={o.sendLate}
					onChange={v => set({ sendLate: v })}
				/>
				<Toggle
					label="Remember sent messages"
					sub="So they can be changed or deleted later. Off: the list is cleared"
					value={o.keepHistory}
					onChange={v => set({ keepHistory: v })}
				/>
			</Group>
			<Heading
				title="Words filled in when sending"
				sub="In the text, embeds, buttons and poll."
			/>
			<Note tone="muted" text={VARIABLE_HELP} />
		</Design.Stack>
	)
}

/** The screen. */
export default function Settings({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	useEffect(() => subscribe(() => redraw(n => n + 1)), [])
	const [tab, setTab] = useState<TabId>('compose')
	const [embedKey, setEmbedKey] = useState<string | null>(null)
	const [webhookId, setWebhookId] = useState<string | null>(null)
	const [pageWidth, setPageWidth] = useState(360)
	const segmented = Design.useSegmentedControlState({
		items: [
			{ id: 'compose', label: 'Compose' },
			{ id: 'webhooks', label: `Webhooks` },
			{ id: 'library', label: 'Library' },
			{ id: 'options', label: 'Options' },
		],
		pageWidth,
		defaultIndex: TAB_IDS.indexOf(tab),
		onSetActiveIndex: (index: number) => {
			flushFields()
			setTab(TAB_IDS[index] ?? 'compose')
		},
	})

	const goCompose = () => {
		setTab('compose')
		segmented.setActiveIndex?.(0)
	}

	let body: ReactNode
	if (embedKey)
		body = <EmbedEditor embedKey={embedKey} onBack={() => setEmbedKey(null)} />
	else if (webhookId)
		body = <WebhookScreen id={webhookId} onBack={() => setWebhookId(null)} />
	else
		body = (
			<Design.Stack spacing={18} style={{ paddingVertical: 16 }}>
				{tab === 'compose' ? <IntroCard text={INTRO} /> : null}
				<View style={{ marginHorizontal: 16 }}>
					<Design.SegmentedControl state={segmented} variant="default" />
				</View>
				{tab === 'compose' ? <ComposeTab onEditEmbed={setEmbedKey} /> : null}
				{tab === 'webhooks' ? <WebhooksTab onOpen={setWebhookId} /> : null}
				{tab === 'library' ? <LibraryTab goCompose={goCompose} /> : null}
				{tab === 'options' ? <OptionsTab /> : null}
				{tab === 'options' ? <DebugSection diag={diag} /> : null}
			</Design.Stack>
		)

	return (
		<View
			style={{ flex: 1 }}
			onLayout={e => setPageWidth(e.nativeEvent.layout.width)}
		>
			<ScrollView
				style={{ flex: 1 }}
				contentContainerStyle={{ paddingBottom: 60 }}
				keyboardShouldPersistTaps="handled"
			>
				{body}
			</ScrollView>
		</View>
	)
}
