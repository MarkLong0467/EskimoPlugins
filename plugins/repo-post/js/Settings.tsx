import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useEffect, useState } from 'react'
import { Alert, ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { saveSettings, setStorage, setting, subscribe } from './config'
import { diag } from './diag'
import { toast } from './discord'
import { describeError } from './http'
import {
	isBusy,
	lastResult,
	limitNow,
	loadPost,
	onResult,
	renderNow,
	restorePrevious,
	sync,
} from './sync'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { LimitChoice, PostData, PostSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: PostSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Keeps the plugin list in your repository thread post up to date. Publish a plugin and the post gets the new list, with version numbers, the next time Discord is open. Only a post you wrote can be edited. Below is exactly what the post will say.'
const PREVIEW_TITLE = 'What the post will say'
const LOADING = 'Loading the list…'

/** `3 min ago` for a time in milliseconds. */
function ago(at: number): string {
	const minutes = Math.round((Date.now() - at) / 60_000)
	if (minutes < 1) return 'just now'
	if (minutes < 120) return `${minutes} min ago`
	return `${Math.round(minutes / 60)} h ago`
}

/** The preview at the top: the text of the post as it will be sent, and how long it is. */
function Preview({ data, error }: { data: PostData | null; error: string }) {
	if (!data) {
		return (
			<Design.TableRowGroup title={PREVIEW_TITLE}>
				<Design.Card>
					<Design.Text
						variant="text-md/medium"
						color={error ? 'text-danger' : 'text-muted'}
					>
						{error || LOADING}
					</Design.Text>
				</Design.Card>
			</Design.TableRowGroup>
		)
	}
	const rendered = renderNow(data)
	const how =
		rendered.level === 'full'
			? 'Full descriptions.'
			: rendered.level === 'shortened'
				? `Descriptions shortened to fit (up to ${rendered.maxDescription} characters).`
				: rendered.level === 'names only'
					? 'Names and versions only, to fit.'
					: 'Too long to send.'
	const count = `${rendered.text.length} of ${rendered.limit} characters. ${how}`
	return (
		<Design.TableRowGroup title={PREVIEW_TITLE} description={count}>
			<Design.Card>
				<Design.Text
					variant="text-sm/normal"
					color={rendered.fits ? 'text-normal' : 'text-danger'}
					selectable
				>
					{rendered.text}
				</Design.Text>
			</Design.Card>
		</Design.TableRowGroup>
	)
}

/** The settings screen: the preview first, then what it is doing and the options. */
export default function SettingsScreen({ api }: Props) {
	setStorage(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [data, setData] = useState<PostData | null>(null)
	const [error, setError] = useState('')

	/** Fetches the list again. */
	const refresh = () => {
		setError('')
		loadPost().then(
			next => setData(next),
			e => setError(describeError(e)),
		)
	}
	useEffect(() => {
		refresh()
		const stopSaved = subscribe(() => redraw(n => n + 1))
		const stopResult = onResult(() => redraw(n => n + 1))
		return () => {
			stopSaved()
			stopResult()
		}
	}, [])

	const result = lastResult()
	const busy = isBusy()
	const status = busy
		? 'Updating…'
		: result
			? `${result.detail} (${ago(result.at)})`
			: setting('syncedAt')
				? `Last matched the list ${ago(Number(setting('syncedAt')))}`
				: 'Not updated yet'
	const statusColor = result?.status === 'error' ? 'text-danger' : 'text-muted'
	const limit = setting('limit') as LimitChoice

	const confirmRestore = () =>
		Alert.alert(
			'Put back the previous text?',
			'The post goes back to what it said before the last change, and automatic updates are turned off.',
			[
				{ text: 'Cancel', style: 'cancel' },
				{
					text: 'Restore',
					style: 'destructive',
					onPress: () => {
						restorePrevious()
					},
				},
			],
			{ cancelable: true },
		)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<Preview data={data} error={error} />
				<Design.TableRowGroup title="Your post">
					<Design.Card>
						<Design.Stack spacing={10}>
							<Design.Text variant="text-md/medium" color={statusColor}>
								{status}
							</Design.Text>
							<Design.Button
								text="Update the post now"
								variant="primary"
								loading={busy}
								disabled={busy}
								onPress={() => {
									sync()
									refresh()
								}}
							/>
							<View style={{ flexDirection: 'row', gap: 10 }}>
								<View style={{ flex: 1 }}>
									<Design.Button
										text="Copy the text"
										variant="secondary"
										size="sm"
										disabled={!data}
										onPress={() => {
											if (!data) return
											Clipboard.setString(renderNow(data).text)
											toast('Post text copied')
											diag.log('copy', 'text copied')
										}}
									/>
								</View>
								<View style={{ flex: 1 }}>
									<Design.Button
										text="Refresh preview"
										variant="secondary"
										size="sm"
										onPress={refresh}
									/>
								</View>
							</View>
							{setting('previousText') ? (
								<Design.Button
									text="Restore the previous text"
									variant="tertiary"
									size="sm"
									onPress={confirmRestore}
								/>
							) : null}
						</Design.Stack>
					</Design.Card>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Options">
					<Design.TableSwitchRow
						label="Update the post by itself"
						subLabel="Checks every 10 minutes while Discord is open, and when you open it."
						value={!!setting('auto')}
						onValueChange={(value: boolean) => saveSettings({ auto: !!value })}
					/>
					<Design.TableSwitchRow
						label="Show version numbers"
						value={!!setting('versions')}
						onValueChange={(value: boolean) =>
							saveSettings({ versions: !!value })
						}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup
					title="Message length"
					description={`The post may have ${limitNow()} characters. If the list is longer, the descriptions are shortened.`}
				>
					<Design.TableRadioGroup
						defaultValue={limit}
						onChange={(value: string) =>
							saveSettings({ limit: value as LimitChoice })
						}
					>
						<Design.TableRadioRow
							value="auto"
							label="Automatic (by your account)"
						/>
						<Design.TableRadioRow value="2000" label="2000 characters" />
						<Design.TableRadioRow
							value="4000"
							label="4000 characters (Nitro)"
						/>
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				<View style={{ paddingHorizontal: 16, gap: 10 }}>
					<Design.TextInput
						label="Thread id"
						size="md"
						value={String(setting('channelId') || '')}
						onChange={(value: string) =>
							saveSettings({ channelId: value.replace(/[^0-9]/g, '') })
						}
					/>
					<Design.TextInput
						label="Message id"
						size="md"
						value={String(setting('messageId') || '')}
						onChange={(value: string) =>
							saveSettings({ messageId: value.replace(/[^0-9]/g, '') })
						}
					/>
					<Design.TextInput
						label="Address of the list"
						size="md"
						value={String(setting('postUrl') || '')}
						onChange={(value: string) =>
							saveSettings({ postUrl: value.trim() })
						}
					/>
				</View>
				<IntroCard text={INTRO} />
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
