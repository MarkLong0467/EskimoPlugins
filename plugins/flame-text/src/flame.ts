/**
 * Makes the flaming GIF for a message, and decides which messages get one.
 *
 * A message gets a GIF only when the picture can be drawn and nothing in it would look wrong as a picture: no links, code,
 * mentions, custom emoji or timestamps (they are shown by Discord, not drawn), Any length works: a long message is wrapped into a paragraph, and only a very long one, whose picture would be too big, is sent as text.
 * Everything else is sent as normal text.
 */

import { plan, prepareFire, seedOf } from './render/fire'
import { drawable } from './render/font'
import { encodeGif, toBase64 } from './render/gif'
import { state } from './state'
import { setting } from './store'
import type { FireOptions } from './render/fire'
import type { SkipReason } from './state'

/** A finished GIF. */
export interface Made {
	bytes: Uint8Array
	base64: string
	width: number
	height: number
	frames: number
	/** How long it took to make, in milliseconds. */
	ms: number
}

/** How long each picture shows, in hundredths of a second. */
const DELAY = 7

/** Gives the phone a moment to draw the screen between the pictures. */
const breathe = (): Promise<void> => new Promise(done => setTimeout(done, 0))

/** What the settings say the flames look like. */
export function looks(text: string, seed?: number): FireOptions {
	return {
		style: setting('style'),
		size: setting('size'),
		height: setting('height'),
		background: setting('background'),
		motion: setting('motion'),
		glow: setting('glow'),
		seed: seed ?? seedOf(text),
	}
}

/**
 * Makes the GIF.
 *
 * @param text What to burn.
 * @param seed Changes where the flames go. The same text and seed give the same GIF.
 * @returns Nothing when the text cannot be drawn.
 */
export async function makeGif(
	text: string,
	seed?: number,
): Promise<Made | undefined> {
	const started = Date.now()
	const prepared = prepareFire(text, looks(text, seed))
	if (!prepared) return undefined
	await breathe()
	const frames: Uint8Array[] = []
	for (let n = 0; n < prepared.frames; n++) {
		frames.push(prepared.frame(n))
		await breathe()
	}
	const bytes = encodeGif({
		width: prepared.width,
		height: prepared.height,
		palette: prepared.palette,
		frames,
		delay: DELAY,
		transparent: prepared.transparent,
	})
	const made: Made = {
		bytes,
		base64: toBase64(bytes),
		width: prepared.width,
		height: prepared.height,
		frames: prepared.frames,
		ms: Date.now() - started,
	}
	state.lastMs = made.ms
	state.lastBytes = bytes.length
	state.lastSize = `${made.width}x${made.height}`
	state.lastFrames = made.frames
	return made
}

/** The parts of a message this file looks at. */
export interface MessageLike {
	content?: unknown
	stickerIds?: unknown
}

/**
 * Why a message cannot be a GIF, or nothing if it can.
 *
 * @param message What is being sent.
 * @param options What Discord was told about the send, which holds the files already attached.
 */
export function whyNot(
	message: MessageLike | undefined,
	options: unknown,
): SkipReason | undefined {
	const text = message?.content
	if (typeof text !== 'string' || text.trim() === '') return 'empty'
	const attached = (options as { attachmentsToUpload?: unknown } | undefined)
		?.attachmentsToUpload
	if (Array.isArray(attached) && attached.length > 0) return 'attachment'
	if (Array.isArray(message?.stickerIds) && message.stickerIds.length > 0)
		return 'sticker'
	if (/https?:\/\/|\bwww\./i.test(text)) return 'link'
	if (text.includes('```') || /`[^`\n]+`/.test(text)) return 'code'
	if (/<(?:@|#|:|a:|t:|\/)[^>\n]*>|@everyone|@here/.test(text)) return 'special'
	if (drawable(text) === undefined) return 'unsupported'
	if (!plan(text, { size: setting('size'), height: setting('height') }))
		return 'toobig'
	return undefined
}

/** What a reason means, for a message to the person. */
export const REASONS: Record<SkipReason, string> = {
	empty: 'There is nothing to draw',
	attachment: 'It has a file attached',
	sticker: 'It has a sticker',
	link: 'It has a link',
	code: 'It has code',
	special: 'It has a mention, emoji or timestamp',
	unsupported: 'It has a letter the flame font does not have, such as an emoji',
	toobig: 'It would make a picture that is too big',
}
