/**
 * What to do with a finished timestamp: send it to the chat, put it in the message being written, or copy it.
 *
 * Sending uses Discord's own `sendMessage`, the way the Spotify and message-splitting plugins do. Putting it in the message uses
 * the chat box itself (its `insertText`, which puts the text at the caret), and if the chat box is not known, Discord's saved
 * draft for the chat, and if that is not there either, the clipboard.
 */

import { Stores } from '@valenced/discord/flux'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { diag } from './diag'
import { state } from './state'

/** The part of the chat box this plugin uses. */
interface ChatBox {
	insertText?(text: string): void
	focus?(): void
}

/** What Discord's `chatInputRef` is: a ref whose `current` is the chat box. */
export interface ChatBoxRef {
	current?: ChatBox | null
}

let chatBox: ChatBoxRef | null = null

/** Remembers the chat box. Called from the hook on Discord's chat input. */
export function setChatBox(ref: ChatBoxRef | null | undefined): void {
	state.inputSeen = true
	if (ref && typeof ref === 'object') {
		chatBox = ref
		state.inputRefKnown = true
	}
}

/** Forgets the chat box. Used when the plugin stops. */
export function forgetChatBox(): void {
	chatBox = null
}

/** The module that sends messages. */
interface MessageActions {
	sendMessage(
		channelId: string,
		message: object,
		clearDraft: boolean,
		options?: object,
	): unknown
	revealMessage: unknown
}

/** The module that changes the saved draft. */
interface DraftActions {
	changeDraft(channelId: string, text: string, type: number): void
	clearDraft: unknown
}

/** Looks a module up now. Nothing if Discord has not loaded it. */
function find<T extends object>(
	first: keyof T & string,
	second: keyof T & string,
): T | undefined {
	try {
		const found = lookupModule(
			withProps<T>(first, second),
		) as unknown as unknown[]
		const exports = found[0] as { default?: T } | undefined
		return exports
			? ((exports.default as T | undefined) ?? (exports as unknown as T))
			: undefined
	} catch (error) {
		diag.fail('find module', error)
		return undefined
	}
}

/** A Discord store, by name. */
function storeOf<T>(name: string): T | undefined {
	return (Stores as unknown as Record<string, T | undefined>)[name]
}

/** The id of the chat that is open. */
export function openChannelId(): string | undefined {
	try {
		return (
			storeOf<{ getChannelId(): string | undefined }>(
				'SelectedChannelStore',
			)?.getChannelId() || undefined
		)
	} catch {
		return undefined
	}
}

/** Copies text. Returns whether it worked. */
export function copyText(text: string): boolean {
	try {
		Clipboard.setString(text)
		state.copied++
		state.last = 'copied a timestamp'
		diag.log('copy', 'Copied a timestamp')
		return true
	} catch (error) {
		diag.fail('copy', error)
		return false
	}
}

/**
 * Sends a message to a chat.
 *
 * @returns Whether Discord took it.
 */
export function sendText(
	channelId: string | undefined,
	content: string,
): boolean {
	const messages = find<MessageActions>('sendMessage', 'revealMessage')
	if (!messages || !channelId) {
		state.last = 'could not send: no message module or no chat'
		diag.log('send', state.last, 'warn')
		return false
	}
	try {
		messages.sendMessage(
			channelId,
			{ content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] },
			false,
			{},
		)
		state.sent++
		state.last = 'sent a timestamp'
		diag.log('send', 'Sent a timestamp')
		return true
	} catch (error) {
		state.last = 'sending failed'
		diag.fail('send', error)
		return false
	}
}

/**
 * Puts text in the message being written.
 *
 * @returns How it got there: `'box'`, `'draft'`, or `'copy'` (nothing else worked, so it was copied), or nothing if even that failed.
 */
export function insertText(
	channelId: string | undefined,
	content: string,
): 'box' | 'draft' | 'copy' | undefined {
	const box = chatBox?.current
	if (box?.insertText) {
		try {
			box.insertText(content)
			box.focus?.()
			state.inserted++
			state.insertWays.box++
			state.last = 'put a timestamp in the message (chat box)'
			diag.log('insert', 'Put a timestamp in the message through the chat box')
			return 'box'
		} catch (error) {
			diag.fail('insert (chat box)', error)
		}
	}
	const drafts = find<DraftActions>('changeDraft', 'clearDraft')
	const draftStore = storeOf<{
		getDraft(channelId: string, type: number): string | undefined
	}>('DraftStore')
	if (drafts && draftStore && channelId) {
		try {
			const draft = draftStore.getDraft(channelId, 0) ?? ''
			drafts.changeDraft(
				channelId,
				draft && !/\s$/.test(draft)
					? `${draft} ${content}`
					: `${draft}${content}`,
				0,
			)
			state.inserted++
			state.insertWays.draft++
			state.last = 'put a timestamp in the message (draft)'
			diag.log('insert', 'Put a timestamp in the message through the draft')
			return 'draft'
		} catch (error) {
			diag.fail('insert (draft)', error)
		}
	}
	if (copyText(content)) {
		state.insertWays.copy++
		return 'copy'
	}
	return undefined
}
