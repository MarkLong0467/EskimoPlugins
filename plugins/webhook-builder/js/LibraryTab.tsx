/** Saved messages, scheduled ones and the ones that were sent, each with what can be done with it. */

import { Design } from '@valenced/discord/design'
import { Alert } from 'react-native'
import { showActions } from './ActionsSheet'
import {
	addSaved,
	deleteSent,
	forgetSent,
	loadDraft,
	loadSent,
	removeSaved,
	renameSaved,
	send,
	unschedule,
} from './actions'
import { describeError, messageLink } from './api'
import { askSchedule, pasteJson } from './ComposeTab'
import { copy, open } from './discord'
import { ask } from './PromptSheet'
import { exportAll, exportDraft } from './payload'
import { state, update, webhookById } from './state'
import { relativeOf, whenOf } from './time'
import { Button, Buttons, Group, Row } from './ui'
import type { Saved, Scheduled, Sent } from './types'

const REPEAT_TEXT = {
	none: 'once',
	hourly: 'every hour',
	daily: 'every day',
	weekly: 'every week',
}

/** What can be done with a saved message. */
function savedActions(item: Saved, goCompose: () => void): void {
	const targets = state().target.webhookIds.filter(id => webhookById(id))
	showActions(item.name, [
		{
			label: 'Open in the editor',
			sub: 'The message in the editor is replaced',
			run: () => {
				loadDraft(item.draft)
				goCompose()
			},
		},
		{
			label: targets.length
				? `Send now with ${targets.length === 1 ? webhookById(targets[0] as string)?.label : `${targets.length} webhooks`}`
				: 'Send now',
			sub: 'With the webhooks picked in Compose',
			run: async () => {
				if (targets.length === 0) return 'Pick a webhook in Compose first'
				const results = await send(item.draft, targets)
				const failed = results.filter(r => !r.ok)
				if (failed.length)
					Alert.alert(
						'Sending',
						failed.map(r => `${r.webhook.label}: ${r.error}`).join('\n'),
					)
				return failed.length ? '' : 'Sent'
			},
		},
		{ label: 'Send later', run: () => askSchedule(item.draft, targets) },
		{
			label: 'Rename',
			run: () =>
				ask({
					title: 'Rename',
					fields: [{ key: 'name', label: 'Name', value: item.name }],
					submit: 'Rename',
					onSubmit: ({ name }) => renameSaved(item.id, name ?? ''),
				}),
		},
		{
			label: 'Make a copy',
			run: () => {
				addSaved([{ name: `${item.name} (copy)`, draft: item.draft }])
				return 'Copied'
			},
		},
		{
			label: 'Copy JSON',
			run: () => copy(exportDraft(item.draft), 'Copied the JSON'),
		},
		{ label: 'Delete', danger: true, run: () => removeSaved(item.id) },
	])
}

/** What can be done with a message that was sent. */
function sentActions(item: Sent, goCompose: () => void): void {
	const webhook = webhookById(item.webhookId)
	const link = item.channelId
		? messageLink(item.guildId, item.channelId, item.messageId)
		: ''
	showActions(item.preview, [
		...(link ? [{ label: 'Open in Discord', run: () => open(link) }] : []),
		...(webhook
			? [
					{
						label: 'Change it',
						sub: 'Loads it into the editor as it is now',
						run: async () => {
							await loadSent(item.id)
							goCompose()
						},
					},
					{
						label: 'Delete it in Discord',
						danger: true,
						run: () =>
							Alert.alert(
								'Delete this message in Discord?',
								'This cannot be undone.',
								[
									{ text: 'Cancel', style: 'cancel' },
									{
										text: 'Delete',
										style: 'destructive',
										onPress: () =>
											deleteSent(item.id).catch(e =>
												Alert.alert('Not deleted', describeError(e)),
											),
									},
								],
							),
					},
				]
			: []),
		...(link
			? [{ label: 'Copy its link', run: () => copy(link, 'Copied the link') }]
			: []),
		{
			label: 'Take it off this list',
			sub: 'It stays in Discord',
			run: () => forgetSent(item.id),
		},
	])
}

/** What can be done with a scheduled message. */
function scheduledActions(item: Scheduled, goCompose: () => void): void {
	showActions(`Scheduled for ${whenOf(item.at)}`, [
		{
			label: 'Send it now',
			sub:
				item.repeat === 'none'
					? 'And take it off the schedule'
					: 'It stays on the schedule',
			run: async () => {
				const results = await send(item.draft, item.webhookIds)
				if (item.repeat === 'none') unschedule(item.id)
				const failed = results.filter(r => !r.ok)
				return failed.length
					? failed.map(r => `${r.webhook.label}: ${r.error}`).join('; ')
					: 'Sent'
			},
		},
		{
			label: 'Open in the editor',
			run: () => {
				loadDraft(item.draft)
				update(s => void (s.target.webhookIds = [...item.webhookIds]))
				goCompose()
			},
		},
		{ label: 'Cancel it', danger: true, run: () => unschedule(item.id) },
	])
}

/** The tab. */
export function LibraryTab({ goCompose }: { goCompose: () => void }) {
	const s = state()
	return (
		<Design.Stack spacing={18}>
			<Group
				title={`Scheduled (${s.scheduled.length})`}
				description={
					s.scheduled.length ? 'Sent while Discord is open.' : undefined
				}
			>
				{s.scheduled.length === 0 ? (
					<Row label="Nothing scheduled" sub="Use Send later in Compose" />
				) : null}
				{s.scheduled.map(x => (
					<Row
						key={x.id}
						label={`${whenOf(x.at)} · ${relativeOf(x.at)}`}
						sub={[
							REPEAT_TEXT[x.repeat],
							x.webhookIds
								.map(id => webhookById(id)?.label ?? 'a webhook')
								.join(', '),
							x.lastError ? `last time: ${x.lastError}` : '',
						]
							.filter(Boolean)
							.join(' · ')}
						arrow
						onPress={() => scheduledActions(x, goCompose)}
					/>
				))}
			</Group>
			<Group title={`Saved (${s.saved.length})`}>
				{s.saved.length === 0 ? (
					<Row
						label="No saved messages"
						sub="Use Save in Compose, or paste JSON"
					/>
				) : null}
				{s.saved.map(x => (
					<Row
						key={x.id}
						label={x.name}
						sub={`Saved ${relativeOf(x.savedAt)}`}
						arrow
						onPress={() => savedActions(x, goCompose)}
					/>
				))}
			</Group>
			<Buttons>
				<Button text="Paste JSON" onPress={() => void pasteJson()} />
				<Button
					text="Copy all as JSON"
					disabled={s.saved.length === 0}
					onPress={() =>
						copy(exportAll(s.saved), `Copied ${s.saved.length} messages`)
					}
				/>
			</Buttons>
			<Group
				title={`Sent (${s.sent.length})`}
				description={
					s.options.keepHistory
						? 'Messages sent from here can be changed or deleted later.'
						: 'Turned off in Options.'
				}
			>
				{s.sent.length === 0 ? <Row label="Nothing sent yet" /> : null}
				{s.sent.map(x => (
					<Row
						key={x.id}
						label={x.preview}
						sub={`${webhookById(x.webhookId)?.label ?? 'A webhook that is not saved'} · ${relativeOf(x.at)}`}
						arrow
						onPress={() => sentActions(x, goCompose)}
					/>
				))}
			</Group>
		</Design.Stack>
	)
}
