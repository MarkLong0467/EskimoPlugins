/** The saved webhooks: adding them, finding the ones of a server, making new ones, and the screen of one. */

import { Design } from '@valenced/discord/design'
import { Alert, Image } from 'react-native'
import {
	addListed,
	addWebhook,
	changeWebhook,
	destroyWebhook,
	forgetWebhook,
	makeWebhook,
	refreshWebhook,
	relabel,
	send,
} from './actions'
import {
	avatarUrl,
	describeError,
	listWebhooks,
	parseWebhookUrl,
	webhookUrl,
} from './api'
import { emptyDraft } from './constants'
import {
	channel,
	copy,
	currentChannelId,
	currentGuildId,
	paste,
	placeOf,
	toast,
} from './discord'
import { ask } from './PromptSheet'
import { state, update, webhookById } from './state'
import { relativeOf } from './time'
import {
	Button,
	Buttons,
	confirm,
	Group,
	Heading,
	Note,
	Row,
	useBusy,
} from './ui'

/** A webhook's avatar, for a row. */
function Avatar({ uri }: { uri: string }) {
	return (
		<Image
			source={{ uri }}
			style={{ width: 32, height: 32, borderRadius: 16 }}
		/>
	)
}

/** Asks for a webhook's address and saves it. The clipboard is filled in if it holds one. */
export async function askAddress(): Promise<void> {
	const clip = await paste()
	ask({
		title: 'Add a webhook',
		note: 'In Discord: Server Settings → Integrations → Webhooks → a webhook → Copy Webhook URL. Anyone with the address can send with it, so keep it private.',
		fields: [
			{
				key: 'url',
				label: 'Webhook address',
				value: parseWebhookUrl(clip) ? clip.trim() : '',
				placeholder: 'https://discord.com/api/webhooks/…',
			},
			{
				key: 'label',
				label: 'Name here (optional)',
				placeholder: 'Announcements',
			},
		],
		submit: 'Add',
		onSubmit: async ({ url, label }) => {
			const webhook = await addWebhook(url ?? '', label)
			toast(`Added ${webhook.label}`)
		},
	})
}

/** Lists the webhooks of the open server or channel and saves them. */
async function find(where: 'guild' | 'channel'): Promise<void> {
	const guildId = currentGuildId()
	const channelId = currentChannelId()
	if (where === 'guild' && !guildId) return toast('Open a server first')
	if (where === 'channel' && !channelId) return toast('Open a channel first')
	try {
		const list = await listWebhooks(
			where === 'guild' ? { guildId } : { channelId },
		)
		if (list.length === 0) return toast('No webhooks you can use there')
		const added = addListed(list)
		toast(
			added
				? `Added ${added} webhook${added === 1 ? '' : 's'}`
				: 'You already have them all',
		)
	} catch (error) {
		Alert.alert(
			'Could not list the webhooks',
			`${describeError(error)}\n\nYou need the Manage Webhooks permission there.`,
		)
	}
}

/** Asks for a name and makes a webhook in the open channel. */
function askMake(): void {
	const channelId = currentChannelId()
	const here = channel(channelId)
	if (!channelId || !here?.guild_id) {
		toast('Open a server channel first')
		return
	}
	// A thread's webhooks belong to the channel it is in.
	const target =
		here.type === 11 || here.type === 12 || here.type === 10
			? (here.parent_id ?? channelId)
			: channelId
	ask({
		title: `New webhook in #${channel(target)?.name ?? 'this channel'}`,
		note: 'You need the Manage Webhooks permission in this channel.',
		fields: [
			{ key: 'name', label: 'Name', value: 'Webhook Builder' },
			{
				key: 'avatar',
				label: 'Avatar (optional)',
				placeholder: 'https:// link to a picture',
			},
		],
		submit: 'Make it',
		onSubmit: async ({ name, avatar }) => {
			const webhook = await makeWebhook(target, name ?? '', avatar)
			toast(`Made ${webhook.label}`)
		},
	})
}

/** The screen of one webhook. */
export function WebhookScreen({
	id,
	onBack,
}: {
	id: string
	onBack: () => void
}) {
	const webhook = webhookById(id)
	const [busy, run] = useBusy()
	if (!webhook)
		return (
			<Design.Stack spacing={16} style={{ paddingVertical: 16 }}>
				<Note text="This webhook is not saved any more." />
				<Buttons>
					<Button text="Back" onPress={onBack} />
				</Buttons>
			</Design.Stack>
		)
	const sent = state().sent.filter(x => x.webhookId === id)
	const safely = (what: string, job: () => Promise<unknown>) =>
		run(async () => {
			try {
				await job()
				toast(what)
			} catch (error) {
				Alert.alert('That did not work', describeError(error))
			}
		})

	return (
		<Design.Stack spacing={18} style={{ paddingVertical: 16 }}>
			<Buttons>
				<Button text="← Back to the webhooks" onPress={onBack} />
			</Buttons>
			<Group title={webhook.label}>
				<Row
					label={webhook.name || 'No name'}
					sub={
						placeOf(webhook.channelId, webhook.guildId) ||
						'Where it posts is not known'
					}
					icon={<Avatar uri={avatarUrl(webhook)} />}
				/>
				<Row
					label="Sent with it"
					sub={
						sent.length
							? `${sent.length} messages, last ${relativeOf(sent[0]?.at ?? 0)}`
							: 'Nothing yet'
					}
				/>
			</Group>
			<Group title="Use">
				<Row
					label="Send the message in the editor with only this one"
					onPress={() => {
						update(s => {
							s.target.webhookIds = [id]
							s.target.editing = ''
						})
						toast('Picked. Go to Compose to send')
					}}
				/>
				<Row
					label="Send a test message"
					sub="A short message to see that it works"
					onPress={() =>
						safely('Test sent', async () => {
							const draft = emptyDraft()
							draft.content = `Webhook Builder test: ${webhook.label} works. {t:R}`
							const [result] = await send(draft, [id])
							if (!result?.ok) throw new Error(result?.error ?? 'Not sent')
						})
					}
				/>
				<Row
					label="Copy its address"
					sub="Anyone with it can send with this webhook"
					onPress={() =>
						copy(webhookUrl(webhook), 'Copied the address. Keep it private')
					}
				/>
				<Row
					label="Check it again"
					sub="Gets its name, avatar and channel from Discord"
					onPress={() => safely('Up to date', () => refreshWebhook(id))}
				/>
			</Group>
			<Group title="Change">
				<Row
					label="Name here"
					sub={webhook.label}
					arrow
					onPress={() =>
						ask({
							title: 'Name here',
							note: 'Only for this list. Discord keeps the webhook’s own name.',
							fields: [{ key: 'label', label: 'Name', value: webhook.label }],
							submit: 'Rename',
							onSubmit: ({ label }) => relabel(id, label ?? ''),
						})
					}
				/>
				<Row
					label="Name and avatar on Discord"
					sub="What messages show when they do not set their own"
					arrow
					onPress={() =>
						ask({
							title: 'Change on Discord',
							fields: [
								{ key: 'name', label: 'Name', value: webhook.name },
								{
									key: 'avatar',
									label: 'New avatar',
									placeholder: 'https:// link to a picture (empty keeps it)',
								},
							],
							submit: 'Change',
							onSubmit: async ({ name, avatar }) => {
								await changeWebhook(id, { name, avatarLink: avatar })
								toast('Changed')
							},
						})
					}
				/>
				{webhook.avatar ? (
					<Row
						label="Remove its avatar"
						onPress={() =>
							safely('Avatar removed', () =>
								changeWebhook(id, { removeAvatar: true }),
							)
						}
					/>
				) : null}
			</Group>
			<Group>
				<Row
					label="Forget it"
					sub="Takes it off this list. It keeps working on Discord."
					danger
					onPress={() =>
						confirm(
							'Forget this webhook?',
							'You can add it again with its address.',
							'Forget',
							() => {
								forgetWebhook(id)
								onBack()
							},
						)
					}
				/>
				<Row
					label="Delete it on Discord"
					sub="Nobody can send with it any more. Its messages stay."
					danger
					onPress={() =>
						confirm(
							'Delete this webhook on Discord?',
							'This cannot be undone.',
							'Delete',
							() =>
								safely('Deleted', async () => {
									await destroyWebhook(id)
									onBack()
								}),
						)
					}
				/>
			</Group>
			{busy ? <Note tone="muted" text="Working…" /> : null}
		</Design.Stack>
	)
}

/** The tab. */
export function WebhooksTab({ onOpen }: { onOpen: (id: string) => void }) {
	const s = state()
	const [busy, run] = useBusy()
	return (
		<Design.Stack spacing={18}>
			<Group title={`Webhooks (${s.webhooks.length})`}>
				{s.webhooks.length === 0 ? (
					<Row label="No webhooks yet" sub="Add one below" />
				) : null}
				{s.webhooks.map(w => (
					<Row
						key={w.id}
						label={w.label}
						sub={
							[
								w.name !== w.label ? w.name : '',
								placeOf(w.channelId, w.guildId),
							]
								.filter(Boolean)
								.join(' · ') || undefined
						}
						icon={<Avatar uri={avatarUrl(w)} />}
						arrow
						onPress={() => onOpen(w.id)}
					/>
				))}
			</Group>
			<Group title="Add">
				<Row
					label="Paste a webhook address"
					arrow
					onPress={() => void askAddress()}
				/>
				<Row
					label="Find the webhooks of this server"
					sub="Needs Manage Webhooks"
					onPress={() => run(() => find('guild'))}
				/>
				<Row
					label="Find the webhooks of this channel"
					sub="Needs Manage Webhooks in the channel"
					onPress={() => run(() => find('channel'))}
				/>
				<Row
					label="Make a webhook in this channel"
					sub="Needs Manage Webhooks"
					arrow
					onPress={askMake}
				/>
			</Group>
			{busy ? <Note tone="muted" text="Asking Discord…" /> : null}
			<Heading
				title="Keep them private"
				sub="A webhook's address is all anyone needs to post with it. The plugin keeps them on this phone only and leaves them out of its logs."
			/>
		</Design.Stack>
	)
}
