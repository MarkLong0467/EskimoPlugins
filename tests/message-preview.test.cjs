'use strict'

/**
 * Tests for Message Preview. Run with: node tests/message-preview.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Set BUNDLE_DIR to run the same checks against another build of the plugin (see tests/lib/harness.cjs).
 */

const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, sleep } = require('./lib/harness.cjs')

const { check, done } = createReporter('Message Preview')

const CHANNEL = 'channel-1'
const ME = { id: 'me', username: 'chase' }

/**
 * Builds a fake Discord with a channel, a draft, the stores the plugin reads, the module that receives messages, and
 * the plugin running. `saved` is what the settings already hold.
 */
async function setup({ saved = {}, uploads = [], draft = '', channel = CHANNEL, receive = true, withIcon = false, pressable = false } = {}) {
	const received = []
	const runtime = createRuntime({
		stores: {
			SelectedChannelStore: { getChannelId: () => channel },
			DraftStore: { getDraft: () => draft },
			UploadAttachmentStore: { getUploads: () => uploads },
			UserStore: { getCurrentUser: () => ME },
		},
	}).install()
	const { valenced } = runtime
	valenced.react.ReactNative.useWindowDimensions = () => ({ height: 800 })
	valenced.utils.discord = {
		lookupGeneratedIconComponent: name => (withIcon && name === 'EyeIcon' ? function EyeIcon() { return null } : undefined),
	}
	const calls = { original: [] }
	if (pressable) {
		valenced.react.ReactNative.Pressable = { type: (...args) => (calls.original.push(args), 'pressed') }
	}
	if (receive) runtime.finders.loadModule({ receiveMessage: (channelId, message) => received.push({ channelId, message }) })

	const { definition } = loadPlugin('message-preview')
	const storage = runtime.makeStorage(saved)
	const running = await startPlugin(definition, runtime, { storage })
	await sleep(5)

	const toasts = () => runtime.log.actions.filter(a => a.label === 'toast').map(a => a.args[1]?.text)
	const alerts = () => runtime.log.actions.filter(a => a.label === 'alert')
	return { runtime, running, definition, storage, received, toasts, alerts, calls, valenced }
}

/** The pieces of the message box the plugin looks into: a text field with `chatInputRef`, and a row of views. */
function messageBox(inputProps) {
	const kids = [{ type: 'Other', props: {} }]
	const tree = {
		type: 'Wrapper',
		props: {
			children: [
				{ type: 'Input', props: { chatInputRef: { current: inputProps } } },
				{ type: 'View', props: { children: kids } },
			],
		},
	}
	return { tree, kids }
}

/** Loads a fake `ChatInputGuardWrapper` that returns the given tree and gives back the module the plugin patched. */
async function loadBox(s, tree) {
	const module = { default: function ChatInputGuardWrapper() { return tree } }
	s.runtime.finders.loadModule(module)
	await sleep(10)
	return module
}

;(async () => {
	// --- Settings
	{
		const s = await setup()
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const groups = findNodes(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the settings show two choices', groups.length === 2, groups.length)
		check('the defaults are the floating pill and the ephemeral message', groups[0].props.value === 'pill' && groups[1].props.value === 'ephemeral')
		check('the button choices are listed', findNodes(groups[0], n => n.type === 'Design.TableRadioRow').length === 2)
		check('the credit is shown', !!findNode(view.tree, n => n.props?.label === 'Credit'))

		groups[0].props.onChange('send')
		await view.settle()
		check('a choice is saved', s.storage.cache.buttonType === 'send', s.storage.cache)
		const again = findNodes(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the screen shows the saved choice', again[0].props.value === 'send')
	}
	{
		const s = await setup({ saved: { previewType: 'popup' } })
		const view = s.runtime.mount(s.runtime.React.createElement(s.definition.SettingsComponent, { api: { jsonStorage: s.storage } }))
		await view.settle()
		const groups = findNodes(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('saved settings are shown', groups[1].props.value === 'popup' && groups[0].props.value === 'pill')
	}

	// --- The message box gets the button
	{
		const s = await setup()
		const input = { handleTextChanged() {} }
		const { tree, kids } = messageBox(input)
		const module = await loadBox(s, tree)
		module.default()
		check('the button is added to the message box', kids.length === 2 && kids[0].key === 'message-preview-button', kids.map(k => k.key))
		check('the button gets the text field', kids[0].props.inputProps === input)
		module.default()
		check('the button is not added twice', kids.length === 2, kids.length)
	}
	{
		const s = await setup({ saved: { buttonType: 'send' } })
		const { tree, kids } = messageBox({ handleTextChanged() {} })
		const module = await loadBox(s, tree)
		module.default()
		check('with the send button setting no pill is added', kids.length === 1)
	}
	{
		const s = await setup()
		const { tree, kids } = messageBox(undefined)
		const module = await loadBox(s, tree)
		check('a box without a text field is left alone', module.default() === tree && kids.length === 1)
		const plain = { type: 'Wrapper', props: { children: 'x' } }
		const m2 = { default: function ChatInputGuardWrapper() { return plain } }
		s.runtime.finders.loadModule(m2)
		await sleep(10)
		check('a box of another shape is left alone', m2.default() === plain)
		const m3 = { default: function ChatInputGuardWrapper() { return undefined } }
		s.runtime.finders.loadModule(m3)
		await sleep(10)
		check('a box that draws nothing is left alone', m3.default() === undefined)
	}

	// --- The button
	{
		const s = await setup({ draft: '' })
		const input = { handleTextChanged() {} }
		const untouched = input.handleTextChanged
		const { tree, kids } = messageBox(input)
		const module = await loadBox(s, tree)
		module.default()
		const view = s.runtime.mount(kids[0])
		await view.settle()
		check('the button listens to typing by wrapping the text handler', input.handleTextChanged !== untouched)
		const press = () => findNode(view.tree, n => n.type === 'Pressable')
		check('the button starts hidden', findNode(view.tree, n => n.type === 'View').props.pointerEvents === 'none')
		check('the button starts without a tap action', press().props.onPress === undefined)
		check('without an icon component the picture is used', !!findNode(view.tree, n => n.type === 'Image' && n.props.source === 'EyeIcon'))

		input.handleTextChanged('hello there')
		await view.settle()
		check('typing shows the button', findNode(view.tree, n => n.type === 'View').props.pointerEvents === 'box-none')
		press().props.onPress()
		await sleep(10)
		check('tapping previews what was typed', s.received.length === 1 && s.received[0].message.content === 'hello there', s.received)
		check('the preview goes to the open channel', s.received[0].channelId === CHANNEL)
		check('the preview carries the author', s.received[0].message.author === ME)
		check('the preview carries an empty list of files', Array.isArray(s.received[0].message.attachments) && s.received[0].message.attachments.length === 0)

		input.handleTextChanged('')
		await view.settle()
		check('clearing the text hides the button', findNode(view.tree, n => n.type === 'View').props.pointerEvents === 'none')
		view.unmount()
		check('the button takes its wrapper off when it goes away', input.handleTextChanged === untouched)
	}
	{
		const s = await setup({ withIcon: true })
		const { tree, kids } = messageBox({ handleTextChanged() {} })
		const module = await loadBox(s, tree)
		module.default()
		const view = s.runtime.mount(kids[0])
		await view.settle()
		check('an icon component is used when Discord has one', !findNode(view.tree, n => n.type === 'Image'))
	}

	// --- The preview itself
	{
		const s = await setup({ uploads: [] })
		const { tree, kids } = messageBox({ handleTextChanged() {} })
		const module = await loadBox(s, tree)
		module.default()
		const view = s.runtime.mount(kids[0])
		await view.settle()
		findNode(view.tree, n => n.type === 'Pressable') // hidden: no tap action
		check('nothing is previewed while the box is empty', s.received.length === 0)
	}

	// --- Holding the send button
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'from the draft', pressable: true })
		const Pressable = s.valenced.react.ReactNative.Pressable
		function handlePressSend() {}
		let originalLongPress = 0
		const props = { onPress: handlePressSend, onLongPress: () => originalLongPress++ }
		Pressable.type(props, 'ref')
		const passed = s.calls.original[0]
		check('other arguments are passed on', passed[1] === 'ref')
		passed[0].onLongPress()
		await sleep(10)
		check('holding send previews the saved draft', s.received.length === 1 && s.received[0].message.content === 'from the draft', s.received)
		check('with the send setting the old long press is not run', originalLongPress === 0)

		const other = { onPress: function somethingElse() {}, onLongPress: () => originalLongPress++ }
		Pressable.type(other)
		check('other buttons are left exactly as they are', s.calls.original[1][0] === other)
	}
	{
		const s = await setup({ saved: { buttonType: 'pill' }, draft: 'x', pressable: true })
		const Pressable = s.valenced.react.ReactNative.Pressable
		function handlePressSend() {}
		let originalLongPress = 0
		Pressable.type({ onPress: handlePressSend, onLongPress: () => originalLongPress++ })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		check('with the pill setting the send button keeps its own long press', originalLongPress === 1 && s.received.length === 0)

		Pressable.type({ onPress: handlePressSend })
		check('a send button without a long press does not break', s.calls.original[1][0].onLongPress() === undefined)
		Pressable.type(undefined)
		check('a missing props object does not break', s.calls.original.length === 3)
	}

	// --- Files
	{
		const upload = {
			uniqueId: 'u1',
			filename: 'cat.png',
			spoiler: true,
			isImage: true,
			getSize: async () => 1234,
			item: { mimeType: 'image/png', uri: 'file:///cat.png', width: 10, height: 20 },
		}
		const s = await setup({ saved: { buttonType: 'send' }, uploads: [upload], draft: '', pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(20)
		check('files alone are enough to preview', s.received.length === 1, s.received)
		const [attachment] = s.received[0].message.attachments
		check(
			'a file is written like a sent attachment',
			attachment.id === 'u1' &&
				attachment.filename === 'SPOILER_cat.png' &&
				attachment.content_type === 'image/png' &&
				attachment.size === 1234 &&
				attachment.url === 'file:///cat.png#' &&
				attachment.proxy_url === 'file:///cat.png#' &&
				attachment.width === 10 &&
				attachment.height === 20,
			attachment,
		)
	}

	// --- The message that is built
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'plain', pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		const { message } = s.received[0]
		check('without a bot message builder a plain message is made', message.flags === 64 && message.state === 'SENT' && message.channel_id === CHANNEL, message)
	}
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'via bot', pressable: true })
		s.runtime.finders.loadModule({ createBotMessage: ({ channelId, content }) => ({ id: 'bot1', channel_id: channelId, content, fromBot: true }) })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		const { message } = s.received[0]
		check('Discord\'s bot message builder is used when it is there', message.fromBot === true && message.id === 'bot1' && message.author === ME, message)
	}

	// --- No receiver: the event, and the failure toast
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'event', receive: false, pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		const event = s.runtime.log.dispatched.find(a => a.type === 'MESSAGE_CREATE')
		check('without receiveMessage a MESSAGE_CREATE event is sent', event && event.channelId === CHANNEL && event.message.content === 'event' && event.optimistic === false, s.runtime.log.dispatched)
		check('no toast when it worked', s.toasts().length === 0)
	}
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'broken', receive: false, pressable: true })
		s.valenced.discord.common.flux.Dispatcher.dispatch = () => {
			throw new Error('no dispatcher')
		}
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		check('a failed preview says why', s.toasts().includes('Could not show the preview (no dispatcher)'), s.toasts())
	}

	// --- No channel, no text
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: '   ', pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		check('a blank draft is not previewed', s.received.length === 0 && s.toasts().length === 0)
	}
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'text', channel: null, pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		check('nothing happens when no channel is open', s.received.length === 0 && s.toasts().length === 0)
	}

	// --- The popup
	{
		const s = await setup({ saved: { buttonType: 'send', previewType: 'popup' }, draft: 'popup text', pressable: true })
		class MessageRecord {
			constructor(fields) {
				Object.assign(this, fields)
			}
		}
		class RowManager {}
		function ChatItem() {
			return null
		}
		// The finders hand over the class itself, as Discord's module for it is the class.
		s.runtime.finders.loadModule(MessageRecord)
		s.runtime.finders.loadModule(RowManager)
		s.runtime.finders.loadModule({ DCDAutoModerationSystemMessageView: 1, default: ChatItem })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		const [open] = s.alerts()
		check('the popup is opened with the plugin\'s key', open && open.name === 'openAlert' && open.args[0] === 'marklong.message-preview', s.alerts())
		check('no message is put in the chat when the popup is shown', s.received.length === 0)
		const element = open.args[1]
		check('the popup is given the message and chat item', element.props.ChatItem === ChatItem && element.props.message.content === 'popup text' && element.props.message.channel_id === CHANNEL, element.props)

		// The popup itself.
		const view = s.runtime.mount(element)
		await view.settle()
		check('the popup has the title', !!findNode(view.tree, n => n.type === 'Design.AlertModal' && n.props.title === 'Message Preview'))
		// The button is given to the alert as its `actions`, not as a child.
		const close = findNode(view.tree, n => n.type === 'Design.AlertModal').props.actions
		check('the popup has a Close button', close && close.props.text === 'Close')
		close.props.onPress()
		check('Close dismisses the popup', s.alerts().some(a => a.name === 'dismissAlert' && a.args[0] === 'marklong.message-preview'), s.alerts())
	}
	{
		const s = await setup({ saved: { buttonType: 'send', previewType: 'popup' }, draft: 'fallback', pressable: true })
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		s.calls.original[0][0].onLongPress()
		await sleep(10)
		check('without the pieces for a popup the message is shown in the chat', s.received.length === 1 && s.alerts().length === 0, s.alerts())
	}

	// --- Stopping
	{
		const s = await setup({ saved: { buttonType: 'send' }, draft: 'bye', pressable: true })
		const { tree, kids } = messageBox({ handleTextChanged() {} })
		const module = await loadBox(s, tree)
		await s.running.stop()
		check('stopping closes the popup', s.alerts().some(a => a.name === 'dismissAlert'), s.alerts())
		module.default()
		check('after stopping the message box is no longer changed', kids.length === 1)
		s.valenced.react.ReactNative.Pressable.type({ onPress: function handlePressSend() {} })
		check('after stopping the send button is no longer changed', s.calls.original[0][0].onLongPress === undefined)
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
