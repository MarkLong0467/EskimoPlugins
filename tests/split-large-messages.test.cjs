'use strict'

/**
 * Tests for Split Large Messages. Run with: node tests/split-large-messages.test.cjs
 * (build first: bun run build:dev split-large-messages, or just run `bun run test`).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Split Large Messages')

/**
 * Builds a fake `MessageActions` module that records every sendMessage call.
 * With `holdFirst`, the first send stays pending until `release()` is called.
 */
function fakeMessageActions(holdFirst = false) {
	const calls = []
	let release = () => {}
	const hold = new Promise(resolve => (release = resolve))
	return {
		calls,
		release: () => release(),
		sendMessage(channelId, message, clearDraft, options) {
			calls.push({ channelId, message, clearDraft, options })
			const index = calls.length
			return holdFirst && index === 1 ? hold.then(() => ({ ok: true, index })) : Promise.resolve({ ok: true, index })
		},
		receiveMessage() {},
	}
}

/** Starts the plugin against a fake runtime whose current user has the given Nitro type. */
async function setup(premiumType, holdFirst = false) {
	const runtime = createRuntime({ stores: { UserStore: { getCurrentUser: () => ({ premiumType }) } } }).install()
	const { definition } = loadPlugin('split-large-messages')
	const running = await startPlugin(definition, runtime)
	const messages = fakeMessageActions(holdFirst)
	const original = messages.sendMessage
	runtime.finders.loadModule(messages)
	await sleep(10)
	return { runtime, running, messages, original }
}

;(async () => {
	// --- Messages inside the limit are left alone
	{
		const { messages } = await setup(0)
		const options = { messageReference: { message_id: '1' } }
		await messages.sendMessage('c1', { content: 'hello', nonce: 'n1' }, true, options)
		check('a short message is sent once, untouched', messages.calls.length === 1 && messages.calls[0].message.content === 'hello' && messages.calls[0].options === options)
	}
	{
		const { messages } = await setup(0)
		await messages.sendMessage('c1', { content: 'x'.repeat(2000), nonce: 'n1' }, true, {})
		check('exactly 2000 characters is not split', messages.calls.length === 1)
	}
	{
		const { messages } = await setup(0)
		await messages.sendMessage('c1', { nonce: 'n1' }, true, {})
		check('a message without text content passes through', messages.calls.length === 1)
	}

	// --- The limit depends on Nitro: 2000 without, 4000 with (premium types 1 and 2)
	{
		const { messages } = await setup(0)
		await messages.sendMessage('c1', { content: 'x'.repeat(2001), nonce: 'n1' }, true, {})
		check('2001 characters without Nitro is split in two', messages.calls.length === 2)
	}
	for (const type of [1, 2]) {
		const { messages } = await setup(type)
		await messages.sendMessage('c1', { content: 'x'.repeat(3500), nonce: 'n1' }, true, {})
		check(`3500 characters with Nitro type ${type} is not split`, messages.calls.length === 1)
		await messages.sendMessage('c1', { content: 'x'.repeat(4001), nonce: 'n2' }, true, {})
		check(`4001 characters with Nitro type ${type} is split`, messages.calls.length === 3)
	}
	{
		const { messages } = await setup(3)
		await messages.sendMessage('c1', { content: 'x'.repeat(2500), nonce: 'n1' }, true, {})
		check('Nitro Basic (type 3) keeps the 2000 limit', messages.calls.length === 2)
	}

	// --- Where the text is cut
	{
		const { messages } = await setup(0)
		const line = `${'a'.repeat(98)}\n`
		const text = line.repeat(60).trimEnd() // 60 lines of 98 characters
		await messages.sendMessage('c1', { content: text, nonce: 'n1' }, true, {})
		const sent = messages.calls.map(call => call.message.content)
		check('every part is within the limit', sent.every(part => part.length <= 2000), sent.map(part => part.length))
		check('text is cut on a line break, never inside a line', sent.every(part => part.split('\n').every(piece => piece.length === 98)), sent.map(part => part.split('\n').map(piece => piece.length)))
		check('no characters are lost', sent.join('\n') === text)
	}
	{
		const { messages } = await setup(0)
		const text = `${'word '.repeat(500)}end` // no line breaks, so cuts fall on spaces
		await messages.sendMessage('c1', { content: text, nonce: 'n1' }, true, {})
		const sent = messages.calls.map(call => call.message.content)
		check('with no line breaks, text is cut on a space and joins back to the original', sent.length > 1 && sent.every(part => !part.startsWith(' ') && !part.endsWith(' ')) && sent.join(' ') === text, sent.map(part => part.length))
	}
	{
		const { messages } = await setup(0)
		await messages.sendMessage('c1', { content: 'y'.repeat(4500), nonce: 'n1' }, true, {})
		const sent = messages.calls.map(call => call.message.content)
		check('text with no break points is cut at the limit', sent.length === 3 && sent[0].length === 2000 && sent[1].length === 2000 && sent[2].length === 500, sent.map(part => part.length))
	}

	// --- Replies, attachments and nonces
	{
		const { messages } = await setup(0)
		const attachments = [{ id: 'file' }]
		const onError = () => {}
		await messages.sendMessage(
			'c1',
			{ content: 'z'.repeat(6000), nonce: 'orig', tts: false },
			false,
			{ messageReference: { message_id: 'reply-target' }, attachmentsToUpload: attachments, onAttachmentUploadError: onError },
		)
		const [first, second, third] = messages.calls
		check('a 6000 character message becomes three messages', messages.calls.length === 3)
		check('the reply stays on the first message only', first.options.messageReference?.message_id === 'reply-target' && !second.options.messageReference && !third.options.messageReference)
		check('the first message keeps its nonce', first.message.nonce === 'orig')
		check('later messages get no copied nonce, so each is unique', !('nonce' in second.message) && !('nonce' in third.message))
		check('attachments are not uploaded with the first message', Array.isArray(first.options.attachmentsToUpload) && first.options.attachmentsToUpload.length === 0)
		check('attachments go with the last message only', third.options.attachmentsToUpload === attachments && third.options.onAttachmentUploadError === onError && !second.options.attachmentsToUpload)
		check('other message fields and clearDraft are kept', second.message.tts === false && messages.calls.every(call => call.clearDraft === false && call.channelId === 'c1'))
	}
	{
		const { messages } = await setup(0)
		await messages.sendMessage('c1', { content: 'q'.repeat(2500), nonce: 'n' }, true, undefined)
		check('a missing options argument is handled', messages.calls.length === 2 && messages.calls[1].options && Object.keys(messages.calls[1].options).length === 0)
	}

	// --- Order and the returned promise
	{
		const { messages } = await setup(0, true)
		const result = messages.sendMessage('c1', { content: 'w'.repeat(2500), nonce: 'n' }, true, {})
		await sleep(15)
		check('the second message waits until the first one has been sent', messages.calls.length === 1, messages.calls.length)
		messages.release()
		const final = await result
		check('then the second message follows', messages.calls.length === 2)
		check('the returned promise resolves with the last message result', final && final.index === 2, final)
	}

	// --- Cleanup
	{
		const { running, messages, runtime } = await setup(0)
		const patched = messages.sendMessage
		await running.stop()
		check('stopping the plugin restores the original sendMessage', messages.sendMessage !== patched)
		await messages.sendMessage('c1', { content: 'x'.repeat(2500), nonce: 'n' }, true, {})
		check('after stopping, long messages are no longer split', messages.calls.length === 1)
		check('and no module subscription is left behind', runtime.finders.activeSubscriptions() === 0)
	}

	done()
})().catch(error => {
	console.error('CRASH', error)
	process.exit(2)
})
