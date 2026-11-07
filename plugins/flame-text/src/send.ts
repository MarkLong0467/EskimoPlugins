/**
 * Sends the GIF. It does what Discord's own share and voice-message code does to send a file:
 *
 * 1. The GIF is written into Discord's cache folder with Discord's `writeFile` (as base64), which gives back a file address.
 * 2. The address goes into a `CloudUpload`, Discord's upload object.
 * 3. The message is sent with `sendMessage(channelId, message, false, { attachmentsToUpload: [upload] })`.
 *
 * When something goes wrong before the send, the message goes out as the plain text you wrote, so nothing is lost.
 */

import { getModules, lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { makeGif, REASONS, whyNot } from './flame'
import { state } from './state'
import { setting, store } from './store'
import { loadUploadClass } from './uploader'
import type { Made } from './flame'

type Cleanup = (...fns: Array<() => unknown>) => unknown

const TOAST_KEY = 'MARKLONG_FLAME_TEXT'

/** A message, as far as this file reads it. */
type Message = { content?: unknown; [field: string]: unknown }
type Options = { [field: string]: unknown }

/** Discord's module that sends messages. */
interface MessageActions {
	sendMessage(
		channelId: string,
		message: Message,
		clearDraft?: unknown,
		options?: Options,
	): unknown
	receiveMessage: unknown
}

/** Discord's file code. */
interface Files {
	writeFile(
		folder: string,
		path: string,
		data: string,
		encoding: string,
	): Promise<string>
	removeFile?(folder: string, path: string): unknown
}

/** Discord's upload object, made with `new`. */
type UploadClass = new (item: Options, channelId: string) => unknown

let files: Files | undefined
let Upload: UploadClass | undefined
let platform = 0
let messages: MessageActions | undefined
/** Set while this plugin sends a message of its own, so the send hook lets it through. */
let passing = false

/** What a module's exports are: the exports, or the `default` of them. */
function unwrap<T>(exports: unknown, prop: string): T | undefined {
	const bag = exports as { default?: unknown } | null | undefined
	for (const candidate of [exports, bag?.default]) {
		if (
			candidate != null &&
			typeof (candidate as Record<string, unknown>)[prop] !== 'undefined'
		)
			return candidate as T
	}
	return undefined
}

/** Looks a module up right now. */
function lookup<T>(prop: string, ...more: string[]): T | undefined {
	try {
		const found = lookupModule(withProps(prop, ...more)) as unknown as unknown[]
		return unwrap<T>(found[0], prop)
	} catch {
		return undefined
	}
}

/** Finds Discord's file code and upload object, now or when Discord loads them. */
export function installFinders(cleanup: Cleanup): void {
	const takeFiles = (exports: unknown): void => {
		const found = unwrap<Files>(exports, 'writeFile')
		if (typeof found?.writeFile !== 'function' || files) return
		files = found
		state.fileModule = true
		diag.log('found', 'Found Discord’s file code (writeFile)')
	}
	const takeUpload = (exports: unknown): void => {
		const found = unwrap<{ CloudUpload?: UploadClass }>(exports, 'CloudUpload')
		if (typeof found?.CloudUpload !== 'function' || Upload) return
		Upload = found.CloudUpload
		state.uploadModule = true
		diag.log('found', 'Found Discord’s upload object (CloudUpload)')
	}
	const takePlatform = (exports: unknown): void => {
		const found = unwrap<{ UploadPlatform?: { REACT_NATIVE?: unknown } }>(
			exports,
			'UploadPlatform',
		)
		const value = found?.UploadPlatform?.REACT_NATIVE
		if (typeof value !== 'number') return
		platform = value
		state.platform = String(value)
	}
	cleanup(
		getModules(withProps('writeFile', 'moveFile'), takeFiles),
		getModules(withProps('CloudUpload'), takeUpload),
		getModules(withProps('UploadPlatform'), takePlatform),
		() => {
			files = undefined
			Upload = undefined
			platform = 0
			messages = undefined
			passing = false
		},
	)
}

/** Everything needed to send, looked up again if it was missed. Discord's upload object is loaded if it is not loaded yet. */
export function parts(): { files: Files; Upload: UploadClass } | undefined {
	files ??= lookup<Files>('writeFile', 'moveFile')
	if (files) state.fileModule = true
	if (!Upload) {
		const found = lookup<{ CloudUpload?: UploadClass }>('CloudUpload')
		Upload = found?.CloudUpload ?? loadUploadClass()
		if (Upload) state.uploadModule = true
	}
	return files && Upload ? { files, Upload } : undefined
}

/** The step a send was at when it failed. */
class StepError extends Error {
	readonly stage: string
	constructor(stage: string, cause: unknown) {
		super(cause instanceof Error ? cause.message : String(cause))
		this.stage = stage
	}
}

/** Makes the GIF and sends it as a file. */
async function sendGif(
	text: string,
	channelId: string,
	message: Message,
	options: Options,
	send: (message: Message, options: Options) => unknown,
): Promise<unknown> {
	state.stage = 'drawing the GIF'
	let made: Made | undefined
	try {
		made = await makeGif(text)
	} catch (error) {
		throw new StepError('drawing the GIF', error)
	}
	if (!made)
		throw new StepError('drawing the GIF', 'the text could not be drawn')

	const ready = parts()
	if (!ready) throw new StepError('finding Discord’s upload code', 'not found')

	state.stage = 'saving the GIF'
	const name = `flame-${Date.now().toString(36)}.gif`
	let uri: string
	try {
		uri = await ready.files.writeFile('cache', name, made.base64, 'base64')
	} catch (error) {
		throw new StepError('saving the GIF', error)
	}
	if (typeof uri !== 'string' || uri === '')
		throw new StepError('saving the GIF', 'no file address came back')

	state.stage = 'making the upload'
	let upload: unknown
	try {
		upload = new ready.Upload(
			{
				uri,
				originalUri: uri,
				mimeType: 'image/gif',
				filename: 'flame.gif',
				platform,
				width: made.width,
				height: made.height,
			},
			channelId,
		)
	} catch (error) {
		throw new StepError('making the upload', error)
	}

	state.stage = 'sending'
	const result = await send(
		{ ...message, content: setting('caption') ? text : '' },
		{
			...options,
			attachmentsToUpload: [upload],
			onAttachmentUploadError: (
				_file: unknown,
				code: unknown,
				reason: unknown,
			) => {
				state.failed++
				state.lastError = `upload refused (code ${String(code)}${reason ? `, ${String(reason)}` : ''})`
				state.last = 'Discord refused the upload'
				diag.log('upload', state.lastError, 'error')
				openToast(TOAST_KEY, 'Discord did not take the flame GIF')
			},
		},
	)
	// The file is not needed once Discord has it.
	setTimeout(() => {
		try {
			ready.files.removeFile?.('cache', name)
		} catch {
			// Discord cleans its cache anyway.
		}
	}, 600_000)
	state.stage = 'done'
	state.flamed++
	state.last = `sent a flame GIF (${made.width}x${made.height}, ${made.frames} pictures, ${Math.round(made.bytes.length / 1024)} KB, made in ${made.ms} ms)`
	diag.log('send', state.last)
	return result
}

/**
 * Sends a message as a flame GIF. If making or saving it fails, the plain message is sent instead.
 *
 * @param plain Sends the message as it was written.
 */
async function burn(
	text: string,
	channelId: string,
	message: Message,
	options: Options,
	send: (message: Message, options: Options) => unknown,
	plain: () => unknown,
): Promise<unknown> {
	try {
		return await sendGif(text, channelId, message, options, send)
	} catch (error) {
		const stage = error instanceof StepError ? error.stage : state.stage
		state.failed++
		state.lastError = `${stage}: ${error instanceof Error ? error.message : String(error)}`
		diag.fail(stage, error)
		// A send that failed may have gone out. Only the steps before it are safe to answer with the plain text.
		if (!(error instanceof StepError)) throw error
		state.fellBack++
		state.last = `sent as plain text because of a problem while ${stage}`
		openToast(TOAST_KEY, 'Could not make the flame GIF, sent as text')
		return plain()
	}
}

/** Sends this text as a flame GIF to a chat now, whether the switch is on or not. Used by `/flame text`. */
export function sendOnce(channelId: string | undefined, text: string): void {
	const module = messages
	if (!module || !channelId) {
		openToast(TOAST_KEY, 'Flame Text could not find the chat to send to')
		state.last = 'could not send: no message module or no chat'
		return
	}
	const reason = whyNot({ content: text }, undefined)
	if (reason) {
		openToast(TOAST_KEY, REASONS[reason])
		state.last = `/flame text was not sent: ${reason}`
		return
	}
	const message: Message = {
		content: text,
		tts: false,
		invalidEmojis: [],
		validNonShortcutEmojis: [],
	}
	const through = (m: Message, o: Options) => {
		passing = true
		try {
			return module.sendMessage(channelId, m, false, o)
		} finally {
			passing = false
		}
	}
	burn(text, channelId, message, {}, through, () => through(message, {})).catch(
		error => {
			state.last = 'sending failed'
			diag.fail('send', error)
		},
	)
}

/** Modules that are already patched. */
const patched = new WeakSet<object>()

/**
 * Finds Discord's message module and turns what you send into a GIF while the switch is on.
 *
 * @param cleanup Where to register what undoes it.
 */
export function installSend(cleanup: Cleanup): void {
	cleanup(
		getModules(
			withProps<MessageActions>('sendMessage', 'receiveMessage'),
			found => {
				if (patched.has(found)) return
				patched.add(found)
				messages = found
				state.sendModule = true
				cleanup(
					diag.apply('flame text in sent messages', () => {
						try {
							const unpatch = instead(
								found,
								'sendMessage',
								function (args, original) {
									const pass = () => Reflect.apply(original, this, args)
									try {
										if (passing || !store.get('on')) return pass()
										const [channelId, message, , options] = args as [
											string,
											Message | undefined,
											unknown,
											Options | undefined,
										]
										state.seen++
										const reason = whyNot(message, options)
										if (reason || !message || typeof channelId !== 'string') {
											if (reason) {
												state.skipped[reason]++
												state.last = `sent as plain text: ${reason}`
											}
											return pass()
										}
										const through = (m: Message, o: Options) => {
											passing = true
											try {
												return Reflect.apply(original, this, [
													channelId,
													m,
													args[2],
													o,
												])
											} finally {
												passing = false
											}
										}
										return burn(
											String(message.content),
											channelId,
											message,
											options ?? {},
											through,
											pass,
										)
									} catch (error) {
										diag.fail('send hook', error)
										return pass()
									}
								},
							)
							state.sendHook = 'patched'
							return unpatch
						} catch (error) {
							state.sendHook = 'failed'
							throw error
						}
					}),
				)
			},
		),
	)
}
