import Page from '@valenced/components/Page'
import TableRowAssetIcon from '@valenced/components/TableRowAssetIcon'
import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useEffect, useState } from 'react'
import { ScrollView } from 'react-native'
import { call, sendConfig } from './native'
import { buildReport } from './report'
import { defaults, getStorage } from './config'
import type { MediaSettings } from './config'

interface Row {
	key: keyof MediaSettings
	label: string
	subLabel: string
	icon: string
}

const BACKGROUND: Row[] = [
	{ key: 'backgroundVideo', label: 'Videos', subLabel: 'Keep playing, with sound, when you leave Discord or lock the screen', icon: 'VideoIcon' },
	{ key: 'backgroundAudio', label: 'Audio files', subLabel: 'Keep audio attachments playing in the background', icon: 'MusicIcon' },
	{ key: 'backgroundVoice', label: 'Voice messages', subLabel: 'Keep voice messages playing in the background', icon: 'MicrophoneIcon' },
]

const PLAYBACK: Row[] = [
	{
		key: 'simultaneous',
		label: 'Play several at once',
		subLabel: 'Videos, audio and voice messages play side by side while Discord is open. When you leave, only the newest keeps playing; the others pause.',
		icon: 'LayersIcon',
	},
	{
		key: 'crossChat',
		label: 'Keep videos playing across chats',
		subLabel: 'A video you leave while it plays carries on in a small player you can drag, tap to pause, or close.',
		icon: 'WindowLaunchIcon',
	},
]

const CONTROLS: Row[] = [
	{ key: 'notification', label: 'Notification controls', subLabel: 'Play, pause, a seek bar and the time in your notifications', icon: 'BellIcon' },
	{ key: 'pictureInPicture', label: 'Picture-in-Picture', subLabel: 'A playing video goes to a floating window when you leave Discord', icon: 'ScreenIcon' },
]

function Switches({ title, description, rows }: { title: string; description?: string; rows: Row[] }) {
	const store = getStorage()
	const saved = (store?.use() ?? store?.cache ?? {}) as Partial<MediaSettings>
	return (
		<Design.TableRowGroup title={title} description={description}>
			{rows.map(row => (
				<Design.TableSwitchRow
					key={row.key}
					label={row.label}
					subLabel={row.subLabel}
					icon={<TableRowAssetIcon name={row.icon} />}
					value={typeof saved[row.key] === 'boolean' ? (saved[row.key] as boolean) : defaults[row.key]}
					onValueChange={(value: boolean) => {
						void store?.set({ [row.key]: value } as Partial<MediaSettings>).then(sendConfig)
					}}
				/>
			))}
		</Design.TableRowGroup>
	)
}

export default function Settings() {
	const [status, setStatus] = useState<{ pip?: string; version?: string } | null>(null)
	useEffect(() => {
		void call('status', []).then(text => {
			try {
				setStatus(text ? JSON.parse(text) : {})
			} catch {
				setStatus({})
			}
		})
	}, [])
	const nativeLoaded = !!status?.version

	return (
		<ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 38 }}>
			<Page>
				<Switches title="Keep playing in the background" description="Also with the screen locked." rows={BACKGROUND} />
				<Switches title="Playback" rows={PLAYBACK} />
				<Switches title="Controls" rows={CONTROLS} />
				<Design.TableRowGroup title="Status">
					<Design.TableRow
						label={status === null ? 'Checking…' : nativeLoaded ? 'Native part loaded' : 'Native part not loaded'}
						subLabel={
							nativeLoaded
								? `Picture-in-Picture: ${status?.pip ?? 'unknown'}`
								: 'Notification controls, Picture-in-Picture, the small player and some background playback need it. Restart Discord after installing.'
						}
						icon={<TableRowAssetIcon name={nativeLoaded ? 'CircleCheckIcon' : 'CircleErrorIcon'} />}
					/>
					<Design.TableRow
						label="Copy report"
						subLabel="What the plugin found on this phone. Paste it in the chat if something does not work."
						icon={<TableRowAssetIcon name="CopyIcon" />}
						arrow
						onPress={() => {
							void buildReport().then(text => {
								try {
									Clipboard.setString(text)
									ToastActionCreators.open('MARKLONG_BETTER_MEDIAS', { text: 'Report copied' })
								} catch {}
							})
						}}
					/>
				</Design.TableRowGroup>
			</Page>
		</ScrollView>
	)
}
