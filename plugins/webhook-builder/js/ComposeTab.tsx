/** The message being made: where it goes, who it is from, its text, embeds, buttons and poll, and sending it. */

import { Design } from '@valenced/discord/design'
import { Alert, View } from 'react-native'
import { showActions } from './ActionsSheet'
import {
	addSaved,
	clearDraft,
	loadDraft,
	saveAs,
	saveEdit,
	schedule,
	send,
	stopEditing,
} from './actions'
import {
	avatarUrl,
	describeError,
	fetchChannelMessage,
	parseMessageLink,
} from './api'
import { emptyEmbed, emptyPoll, LIMITS } from './constants'
import { copy, paste, toast } from './discord'
import { move } from './EmbedEditor'
import { Preview } from './Preview'
import { ask } from './PromptSheet'
import {
	draftFrom,
	embedCount,
	exportDraft,
	importText,
	previewOf,
	problems,
} from './payload'
import { editDraft, sentById, state, update, webhookById } from './state'
import { parseWhen, relativeOf, whenOf } from './time'
import {
	Button,
	Buttons,
	Choice,
	Field,
	Group,
	Heading,
	Note,
	Row,
	Toggle,
	useBusy,
} from './ui'
import { VARIABLES } from './variables'
import type {
	Draft,
	LinkButton,
	MentionMode,
	Repeat,
	SendResult,
} from './types'

/** What a send did, in one line. */
function summary(results: SendResult[]): string {
	const ok = results.filter(r => r.ok)
	const failed = results.filter(r => !r.ok)
	if (failed.length === 0)
		return ok.length === 1
			? `Sent with ${ok[0]?.webhook.label}`
			: `Sent with ${ok.length} webhooks`
	const why = failed.map(r => `${r.webhook.label}: ${r.error}`).join('\n')
	return ok.length
		? `Sent with ${ok.length}, ${failed.length} failed:\n${why}`
		: `Not sent:\n${why}`
}

/** Shows what stops a message from being sent. Returns whether there was anything. */
function stopped(draft: Draft, mode: 'send' | 'edit'): boolean {
	const list = problems(draft, mode)
	if (list.length === 0) return false
	Alert.alert(
		'Discord would refuse this message',
		list.map(p => `• ${p}`).join('\n'),
	)
	return true
}

/** Asks when to send the message, and how often. */
export function askSchedule(draft: Draft, webhookIds: string[]): void {
	if (webhookIds.length === 0) {
		toast('Pick a webhook to send with first')
		return
	}
	if (stopped(draft, 'send')) return
	ask({
		title: 'Send later',
		note: 'Scheduled messages are sent while Discord is open. Ones that came due while it was closed are sent when you next open it (see Options).',
		fields: [
			{
				key: 'when',
				label: 'When',
				placeholder: 'in 30m, 18:30, tomorrow 9:00, 2026-12-24 18:00',
			},
		],
		submit: 'Next: how often',
		onSubmit: ({ when }) => {
			const at = parseWhen(when ?? '')
			if (!at)
				throw new Error(
					'That is not a time I can read. Try "in 30m", "18:30" or "2026-12-24 18:00"',
				)
			if (at <= Date.now()) throw new Error('That time has passed')
			const pick = (repeat: Repeat) => () => {
				schedule(at, repeat, webhookIds, draft)
				return `Scheduled for ${whenOf(at)} (${relativeOf(at)})`
			}
			setTimeout(
				() =>
					showActions(`Send ${whenOf(at)}`, [
						{ label: 'Once', run: pick('none') },
						{ label: 'Every hour', run: pick('hourly') },
						{ label: 'Every day', run: pick('daily') },
						{ label: 'Every week', run: pick('weekly') },
					]),
				350,
			)
		},
	})
}

/** Takes a message from pasted JSON or a Discohook link. One message goes into the editor; several are saved. */
export async function pasteJson(): Promise<void> {
	const text = await paste()
	ask({
		title: 'Paste a message',
		note: 'JSON from Discohook (Options → JSON Data Editor), a Discohook backup, a discohook link with the message in it, or JSON copied from here.',
		fields: [
			{
				key: 'json',
				label: 'JSON',
				value:
					text.trim().startsWith('{') || text.includes('data=') ? text : '',
				multiline: true,
			},
		],
		submit: 'Use it',
		onSubmit: ({ json }) => {
			const found = importText(json ?? '')
			if (found.length === 1 && found[0]) {
				loadDraft(found[0].draft)
				toast('Loaded into the editor')
			} else {
				addSaved(found)
				toast(`${found.length} messages added to Saved`)
			}
		},
	})
}

/** Takes a message from its link in Discord. */
export function fromLink(): void {
	ask({
		title: 'Copy a message from Discord',
		note: 'Hold a message, tap Copy Message Link, and paste it here. Any message you can see works.',
		fields: [
			{
				key: 'link',
				label: 'Message link',
				placeholder: 'https://discord.com/channels/…',
			},
		],
		submit: 'Copy into the editor',
		onSubmit: async ({ link }) => {
			const parts = parseMessageLink(link ?? '')
			if (!parts) throw new Error('That is not a message link')
			const message = await fetchChannelMessage(
				parts.channelId,
				parts.messageId,
			)
			if (!message) throw new Error('Could not find that message')
			loadDraft(draftFrom(message))
			toast('Copied into the editor')
		},
	})
}

/** The link buttons. */
function ButtonsEditor({ rows }: { rows: LinkButton[][] }) {
	const set = (fn: (rows: LinkButton[][]) => void) =>
		editDraft(d => {
			fn(d.buttons)
			d.buttons = d.buttons.filter(r => r.length > 0)
		})
	return (
		<Design.Stack spacing={10}>
			<Heading
				title={`Link buttons (${rows.length}/${LIMITS.buttonRows} rows)`}
				sub="Buttons that open a link. Webhooks can only send link buttons."
			/>
			{rows.map((row, r) => (
				<Design.Stack key={`row-${r}`} spacing={8}>
					{row.map((b, i) => (
						<Design.Stack key={`b-${r}-${i}`} spacing={6}>
							<Field
								label={`Row ${r + 1}, button ${i + 1}: label`}
								value={b.label}
								max={LIMITS.buttonLabel}
								onChange={v =>
									set(x => void (x[r]?.[i] && (x[r][i].label = v)))
								}
							/>
							<Field
								label="Link"
								placeholder="https://"
								value={b.url}
								onChange={v =>
									set(x => void (x[r]?.[i] && (x[r][i].url = v.trim())))
								}
							/>
							<Field
								label="Emoji"
								placeholder="🔥 or <:name:id>"
								value={b.emoji}
								onChange={v =>
									set(x => void (x[r]?.[i] && (x[r][i].emoji = v.trim())))
								}
							/>
							<Buttons>
								<Button
									text="←"
									disabled={i === 0}
									onPress={() => set(x => x[r] && move(x[r], i, -1))}
								/>
								<Button
									text="→"
									disabled={i === row.length - 1}
									onPress={() => set(x => x[r] && move(x[r], i, 1))}
								/>
								<Button
									text="Remove"
									variant="destructive"
									onPress={() => set(x => void x[r]?.splice(i, 1))}
								/>
							</Buttons>
						</Design.Stack>
					))}
					{row.length < LIMITS.buttonsPerRow ? (
						<Buttons>
							<Button
								text={`Add a button to row ${r + 1}`}
								onPress={() =>
									set(
										x =>
											void x[r]?.push({
												label: '',
												url: 'https://',
												emoji: '',
											}),
									)
								}
							/>
						</Buttons>
					) : null}
				</Design.Stack>
			))}
			{rows.length < LIMITS.buttonRows ? (
				<Buttons>
					<Button
						text="Add a row of buttons"
						onPress={() =>
							set(x => void x.push([{ label: '', url: 'https://', emoji: '' }]))
						}
					/>
				</Buttons>
			) : null}
		</Design.Stack>
	)
}

/** The poll. */
function PollEditor({ draft }: { draft: Draft }) {
	const poll = draft.poll
	if (!poll)
		return (
			<Buttons>
				<Button
					text="Add a poll"
					onPress={() => editDraft(d => void (d.poll = emptyPoll()))}
				/>
			</Buttons>
		)
	const set = (fn: (p: NonNullable<Draft['poll']>) => void) =>
		editDraft(d => void (d.poll && fn(d.poll)))
	return (
		<Design.Stack spacing={10}>
			<Heading title="Poll" sub="A poll cannot be changed once it is sent." />
			<Field
				label="Question"
				value={poll.question}
				max={LIMITS.pollQuestion}
				onChange={v => set(p => void (p.question = v))}
			/>
			{poll.answers.map((a, i) => (
				<Field
					key={`answer-${i}`}
					label={`Answer ${i + 1}`}
					value={a}
					max={LIMITS.pollAnswer}
					description="An emoji at the start shows as its icon"
					onChange={v => set(p => void (p.answers[i] = v))}
				/>
			))}
			<Buttons>
				<Button
					text="Add an answer"
					disabled={poll.answers.length >= LIMITS.pollAnswers}
					onPress={() => set(p => void p.answers.push(''))}
				/>
				<Button
					text="Remove the last"
					disabled={poll.answers.length <= 1}
					onPress={() => set(p => void p.answers.pop())}
				/>
			</Buttons>
			<Field
				label="Open for (hours)"
				value={String(poll.hours)}
				description={`1 to ${LIMITS.pollHours} (32 days)`}
				onChange={v => {
					const hours = Number.parseInt(v, 10)
					if (hours > 0)
						set(p => void (p.hours = Math.min(LIMITS.pollHours, hours)))
				}}
			/>
			<Group>
				<Toggle
					label="Allow several answers"
					value={poll.multiselect}
					onChange={v => set(p => void (p.multiselect = v))}
				/>
				<Row
					label="Remove the poll"
					danger
					onPress={() => editDraft(d => void (d.poll = null))}
				/>
			</Group>
		</Design.Stack>
	)
}

const MENTIONS: { value: MentionMode; label: string; sub: string }[] = [
	{
		value: 'all',
		label: 'Everyone it mentions',
		sub: '@everyone, @here, roles and people',
	},
	{
		value: 'users',
		label: 'Only people',
		sub: 'Mentions of roles and @everyone do not ping',
	},
	{ value: 'none', label: 'Nobody', sub: 'Mentions show but nobody is pinged' },
]

/** The tab. */
export function ComposeTab({
	onEditEmbed,
}: {
	onEditEmbed: (key: string) => void
}) {
	const s = state()
	const draft = s.draft
	const editing = s.target.editing ? sentById(s.target.editing) : undefined
	const chosen = s.target.webhookIds.filter(id => webhookById(id))
	const first = webhookById(chosen[0] ?? '')
	const [busy, run] = useBusy()
	const list = problems(draft, editing ? 'edit' : 'send')

	const setTarget = (id: string, on: boolean) =>
		update(x => {
			const ids = x.target.webhookIds.filter(w => w !== id)
			x.target.webhookIds = on ? [...ids, id] : ids
		})

	const doSend = () => {
		if (editing) {
			if (stopped(draft, 'edit')) return
			run(async () => {
				try {
					await saveEdit(editing.id, draft)
					toast('Message changed')
				} catch (e) {
					Alert.alert('Not changed', describeError(e))
				}
			})
			return
		}
		if (chosen.length === 0) return toast('Pick a webhook to send with first')
		if (stopped(draft, 'send')) return
		const go = () =>
			run(async () => {
				const results = await send(draft, chosen)
				const text = summary(results)
				if (results.every(r => r.ok)) toast(text)
				else Alert.alert('Sending', text)
			})
		if (!s.options.confirmSend) return go()
		const names = chosen.map(id => webhookById(id)?.label).join(', ')
		Alert.alert(
			'Send this message?',
			`With ${names}.`,
			[
				{ text: 'Cancel', style: 'cancel' },
				{ text: 'Send', onPress: go },
			],
			{ cancelable: true },
		)
	}

	return (
		<Design.Stack spacing={18}>
			{editing ? (
				<View style={{ gap: 8 }}>
					<Note
						text={`Changing a message that was sent: "${editing.preview}". The name, avatar, poll and thread cannot be changed.`}
					/>
					<Buttons>
						<Button text="Make a new message instead" onPress={stopEditing} />
					</Buttons>
				</View>
			) : (
				<Group
					title="Send with"
					description={
						s.webhooks.length
							? 'Pick one or more. Each sends its own copy.'
							: undefined
					}
				>
					{s.webhooks.length === 0 ? (
						<Row label="No webhooks yet" sub="Add one in the Webhooks tab" />
					) : null}
					{s.webhooks.map(w => (
						<Toggle
							key={w.id}
							label={w.label}
							sub={w.name !== w.label ? w.name : undefined}
							value={chosen.includes(w.id)}
							onChange={on => setTarget(w.id, on)}
						/>
					))}
				</Group>
			)}

			<Heading
				title="Profile"
				sub="Leave empty to use the webhook's own name and avatar."
			/>
			<Field
				label="Name"
				value={draft.username}
				max={LIMITS.username}
				placeholder={first?.name}
				onChange={v => editDraft(d => void (d.username = v))}
			/>
			<Field
				label="Avatar"
				placeholder="https:// link to a picture"
				value={draft.avatarUrl}
				onChange={v => editDraft(d => void (d.avatarUrl = v.trim()))}
			/>
			{first && !draft.avatarUrl ? (
				<Buttons>
					<Button
						text="Use the webhook's avatar link"
						onPress={() =>
							editDraft(d => void (d.avatarUrl = avatarUrl(first)))
						}
					/>
				</Buttons>
			) : null}

			<Field
				label="Text"
				value={draft.content}
				max={LIMITS.content}
				multiline
				description="Markdown, mentions (<@id>, <@&role>, <#channel>) and {date}, {t:R}… (see Options)"
				onChange={v => editDraft(d => void (d.content = v))}
			/>

			<Group title={`Embeds (${embedCount(draft)}/${LIMITS.embeds})`}>
				{draft.embeds.map((e, i) => (
					<Row
						key={e.key}
						label={
							e.title ||
							e.authorName ||
							e.description.slice(0, 40) ||
							`Embed ${i + 1}`
						}
						sub={
							[
								e.color,
								e.fields.length ? `${e.fields.length} fields` : '',
								e.image ? 'picture' : '',
							]
								.filter(Boolean)
								.join(' · ') || 'Empty'
						}
						arrow
						onPress={() => onEditEmbed(e.key)}
					/>
				))}
				<Row
					label="Add an embed"
					onPress={
						embedCount(draft) < LIMITS.embeds
							? () => {
									const embed = emptyEmbed()
									editDraft(d => void d.embeds.push(embed))
									onEditEmbed(embed.key)
								}
							: undefined
					}
				/>
			</Group>

			{editing ? null : <PollEditor draft={draft} />}
			<ButtonsEditor rows={draft.buttons} />

			{editing ? null : (
				<>
					<Heading
						title="Thread"
						sub="Optional. For a forum channel, give the new post a title (or an existing post's id)."
					/>
					<Field
						label="Thread or post id"
						value={draft.threadId}
						onChange={v => editDraft(d => void (d.threadId = v.trim()))}
					/>
					<Field
						label="New forum post title"
						value={draft.threadName}
						max={LIMITS.threadName}
						onChange={v => editDraft(d => void (d.threadName = v))}
					/>
				</>
			)}
			<Group title="Options">
				{editing ? null : (
					<Toggle
						label="Silent"
						sub="No push notification (@silent)"
						value={draft.silent}
						onChange={v => editDraft(d => void (d.silent = v))}
					/>
				)}
				<Toggle
					label="Hide link previews"
					value={draft.suppressEmbeds}
					onChange={v => editDraft(d => void (d.suppressEmbeds = v))}
				/>
				{editing ? null : (
					<Toggle
						label="Read aloud (TTS)"
						value={draft.tts}
						onChange={v => editDraft(d => void (d.tts = v))}
					/>
				)}
			</Group>
			<Choice
				title="Who gets pinged"
				value={draft.mentions}
				options={MENTIONS}
				onChange={v => editDraft(d => void (d.mentions = v))}
			/>

			<Heading title="Preview" sub={first ? `As ${first.label}` : undefined} />
			<Preview draft={draft} webhook={first} />
			{list.length ? (
				<Note tone="danger" text={list.map(p => `• ${p}`).join('\n')} />
			) : null}

			<Buttons>
				<Button
					text={
						editing
							? 'Save changes'
							: chosen.length > 1
								? `Send with ${chosen.length}`
								: 'Send'
					}
					variant="primary"
					loading={busy}
					onPress={doSend}
				/>
				{editing ? null : (
					<Button
						text="Send later"
						onPress={() => askSchedule(draft, chosen)}
					/>
				)}
			</Buttons>
			<Buttons>
				<Button
					text="Save"
					onPress={() =>
						ask({
							title: 'Save this message',
							note: 'A saved message with the same name is replaced.',
							fields: [
								{
									key: 'name',
									label: 'Name',
									value: previewOf(draft).slice(0, 40),
								},
							],
							submit: 'Save',
							onSubmit: ({ name }) => {
								saveAs(name ?? '', draft)
								toast('Saved')
							},
						})
					}
				/>
				<Button
					text="Copy JSON"
					onPress={() =>
						copy(exportDraft(draft), 'Copied the JSON (Discohook takes it too)')
					}
				/>
				<Button text="Paste JSON" onPress={() => void pasteJson()} />
			</Buttons>
			<Buttons>
				<Button text="Copy from a message link" onPress={fromLink} />
				<Button
					text="Start over"
					variant="destructive"
					onPress={() =>
						Alert.alert(
							'Start a new message?',
							'The message in the editor is cleared. Saved messages stay.',
							[
								{ text: 'Cancel', style: 'cancel' },
								{ text: 'Clear', style: 'destructive', onPress: clearDraft },
							],
						)
					}
				/>
			</Buttons>
		</Design.Stack>
	)
}

/** The words in braces, for the Options tab. */
export const VARIABLE_HELP = VARIABLES.map(v => `${v.word}  ${v.means}`).join(
	'\n',
)
