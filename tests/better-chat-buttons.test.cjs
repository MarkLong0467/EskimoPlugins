'use strict'

/** Tests for Better Chat Buttons. Run with: node tests/better-chat-buttons.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Better Chat Buttons')

// The chat bar draws the parts again and again; the plugin looks at their refs after the next frame.
globalThis.requestAnimationFrame = fn => setTimeout(fn, 0)

/** A `React.memo` of a `forwardRef` component with a display name, like Discord's chat bar parts. */
function fakePart(name, render) {
	const type = { $$typeof: Symbol.for('react.forward_ref'), render, displayName: name }
	return { memo: { $$typeof: Symbol.for('react.memo'), type }, type, original: render }
}

/** The three parts, recording the props they were drawn with. */
function fakeChatBar() {
	const drawn = { send: [], actions: [], right: [] }
	const send = fakePart('ChatInputSendButton', (props, ref) => {
		drawn.send.push({ ...props })
		return { type: 'SendButton', props: {}, ref }
	})
	const actions = fakePart('ChatInputActions', (props, ref) => {
		drawn.actions.push({ ...props })
		return { type: 'Actions', props: {}, ref }
	})
	const right = fakePart('ChatInputRightActions', props => {
		drawn.right.push({ ...props })
		return { type: 'RightActions', props: {} }
	})
	return { drawn, send, actions, right }
}

const load = bar => runtime => {
	const { loadModule } = runtime.valenced.modules.finders
	loadModule({ default: bar.send.memo })
	loadModule({ default: bar.actions.memo })
	loadModule({ default: bar.right.memo })
}

/** A ref with the functions the parts give out. */
function fakeRefs() {
	const calls = { setHasText: [], dismiss: [] }
	const sendRef = { current: { setHasText: value => calls.setHasText.push(value) } }
	const actionsRef = { current: { onDismissActions: () => calls.dismiss.push(1), onShowActions() {} } }
	return { calls, sendRef, actionsRef }
}

const switches = view => findNodes(view.tree, n => n.type === 'Design.TableSwitchRow')

;(async () => {
	// --- Hiding buttons
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		check('all three parts are patched', bar.send.type.render !== bar.send.original && bar.actions.type.render !== bar.actions.original && bar.right.type.render !== bar.right.original)

		bar.send.type.render({ canSendVoiceMessage: true }, {})
		check('by default the voice message button is hidden', bar.drawn.send[0].canSendVoiceMessage === false)
		bar.actions.type.render({ isAppLauncherEnabled: true, canStartThreads: true, shouldShowGiftButton: true }, {})
		const a = bar.drawn.actions[0]
		check('by default Apps & Commands, New Thread and Gift are hidden', a.isAppLauncherEnabled === false && a.canStartThreads === false && a.shouldShowGiftButton === false, a)
		bar.right.type.render({ shouldShowGiftButton: true })
		check('the redesigned bar hides the gift button too', bar.drawn.right[0].shouldShowGiftButton === false)

		bar.actions.type.render({ isAppLauncherEnabled: false }, {})
		check('a button Discord already left out stays out', bar.drawn.actions[1].isAppLauncherEnabled === false)
		bar.send.type.render({ canSendVoiceMessage: false }, {})
		check('and the voice message button stays off when Discord has it off', bar.drawn.send[1].canSendVoiceMessage === false)
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}

	// --- Showing buttons again
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', {
			saved: { hide: { app: false, gift: false, thread: false, voice: false } },
			before: load(bar),
		})
		bar.send.type.render({ canSendVoiceMessage: true }, {})
		bar.actions.type.render({ isAppLauncherEnabled: true, canStartThreads: true, shouldShowGiftButton: true }, {})
		bar.right.type.render({ shouldShowGiftButton: true })
		check('with every switch off the buttons are left as Discord has them', bar.drawn.send[0].canSendVoiceMessage === true && bar.drawn.actions[0].isAppLauncherEnabled === true && bar.drawn.actions[0].shouldShowGiftButton === true && bar.drawn.right[0].shouldShowGiftButton === true)
		check('New Thread is drawn when it is not hidden', bar.drawn.actions[0].canStartThreads === true)
		s.stop()
	}
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', { saved: { hide: { thread: false } }, before: load(bar) })
		bar.actions.type.render({ canStartThreads: true, shouldShowGiftButton: true }, {})
		check('each switch works on its own (only New Thread shown)', bar.drawn.actions[0].canStartThreads === true && bar.drawn.actions[0].shouldShowGiftButton === false)
		s.stop()
	}

	// --- The send button collapses
	{
		const bar = fakeChatBar()
		const refs = fakeRefs()
		const s = await startPort('better-chat-buttons', { saved: { collapse: { send: true, actions: true } }, before: load(bar) })
		let result = bar.send.type.render({}, refs.sendRef)
		check('with an empty box and nothing said yet the send button is drawn', result !== null)
		await sleep(10)
		refs.sendRef.current.setHasText(false)
		check('the box’s own state still gets what it is told', refs.calls.setHasText.join() === 'false', refs.calls.setHasText)
		result = bar.send.type.render({}, refs.sendRef)
		check('with no text the send button collapses', result === null)
		refs.sendRef.current.setHasText(true)
		result = bar.send.type.render({}, refs.sendRef)
		check('with text it comes back', result !== null && refs.calls.setHasText.join() === 'false,true')

		for (let i = 0; i < 5; i++) bar.send.type.render({}, refs.sendRef)
		await sleep(10)
		refs.calls.setHasText.length = 0
		refs.sendRef.current.setHasText(false)
		check('drawing it again and again wraps the box’s state only once', refs.calls.setHasText.length === 1, refs.calls.setHasText)

		await s.storage.set({ collapse: { send: false } })
		check('turning the collapse off brings the button back at once', bar.send.type.render({}, refs.sendRef) !== null)
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}
	{
		const bar = fakeChatBar()
		const refs = fakeRefs()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		bar.send.type.render({}, refs.sendRef)
		await sleep(10)
		refs.sendRef.current.setHasText(false)
		check('with "never collapse" the send button stays even with no text', bar.send.type.render({}, refs.sendRef) !== null)
		s.stop()
	}

	// --- The action buttons collapse
	{
		const bar = fakeChatBar()
		const refs = fakeRefs()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		bar.actions.type.render({}, refs.actionsRef)
		await sleep(10)
		refs.actionsRef.current.onDismissActions()
		check('by default the action buttons collapse while typing', refs.calls.dismiss.length === 1)
		await s.storage.set({ collapse: { actions: false } })
		refs.actionsRef.current.onDismissActions()
		check('with "never collapse" Discord’s dismiss is skipped', refs.calls.dismiss.length === 1)
		for (let i = 0; i < 4; i++) bar.actions.type.render({}, refs.actionsRef)
		await sleep(10)
		await s.storage.set({ collapse: { actions: true } })
		refs.actionsRef.current.onDismissActions()
		check('and drawing again does not wrap it twice', refs.calls.dismiss.length === 2, refs.calls.dismiss)
		s.stop()
	}

	// --- Chats with no ref
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		bar.send.type.render({ canSendVoiceMessage: true }, undefined)
		bar.actions.type.render({}, { current: null })
		await sleep(10)
		check('a part with no ref (a bot chat) does not break', s.errors.length === 0 && bar.drawn.send.length === 1)
		s.stop()
	}

	// --- The parts are found when Discord draws them, with no module search
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons')
		const jsx = (type, props) => s.runtime.valenced.react.ReactJSXRuntime.jsx(type, props)
		check('before Discord draws anything nothing is patched', bar.send.type.render === bar.send.original)
		const element = jsx(bar.send.memo, { canSendVoiceMessage: true })
		check('when Discord makes the element for a part, the part is patched at once', bar.send.type.render !== bar.send.original)
		check('and the element is Discord’s own (the plugin changes what it draws, not the element)', element.type === bar.send.memo)
		bar.send.type.render({ canSendVoiceMessage: true }, {})
		check('so the first draw already has the voice message button hidden', bar.drawn.send[0].canSendVoiceMessage === false, bar.drawn.send)
		jsx(bar.actions.memo, {})
		jsx(bar.right.memo, {})
		bar.actions.type.render({ isAppLauncherEnabled: true, canStartThreads: true, shouldShowGiftButton: true }, {})
		bar.right.type.render({ shouldShowGiftButton: true })
		check('the other two parts are found the same way', bar.drawn.actions[0].isAppLauncherEnabled === false && bar.drawn.right[0].shouldShowGiftButton === false)
		const wrapped = bar.send.type.render
		jsx(bar.send.memo, {})
		jsx(bar.send.memo, {})
		check('drawing a part again does not patch it again', bar.send.type.render === wrapped)
		jsx(() => null, {})
		jsx('View', {})
		check('other elements are left alone', bar.send.type.render === wrapped)
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		const view = await s.mountSettings()
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		check('the self-check says the parts were found', textOf(view.tree).includes('The send button was found'))
		view.unmount()
		s.stop()
		check('after stopping new elements no longer find parts', (() => { const other = fakeChatBar(); jsx(other.send.memo, {}); return other.send.type.render === other.send.original })())
		check('and the parts that were patched are back', bar.send.type.render === bar.send.original && bar.actions.type.render === bar.actions.original)
	}
	{
		// A part found by Discord's module and then drawn is patched once.
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		const patchedFirst = bar.send.type.render
		s.runtime.valenced.react.ReactJSXRuntime.jsx(bar.send.memo, {})
		check('a part found both ways is patched once', bar.send.type.render === patchedFirst)
		s.stop()
	}

	// --- The parts load later, or are not what was expected
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons')
		check('before Discord loads the parts nothing is patched', bar.send.type.render === bar.send.original)
		load(bar)(s.runtime)
		await sleep(10)
		check('when it does they are patched', bar.send.type.render !== bar.send.original)
		s.stop()
	}
	{
		const plain = { $$typeof: Symbol.for('react.memo'), type: Object.assign(() => null, { displayName: 'ChatInputSendButton' }) }
		const s = await startPort('better-chat-buttons', {
			before: runtime => runtime.valenced.modules.finders.loadModule({ default: plain }),
		})
		const view = await s.mountSettings()
		check('a part that is not a forwardRef component is reported, not patched', s.errors.length === 0 && textOf(view.tree).includes('ChatInputSendButton: found, but it has no render function'), textOf(view.tree).slice(-300))
		view.unmount()
		s.stop()
	}

	// --- The settings screen
	{
		const bar = fakeChatBar()
		const s = await startPort('better-chat-buttons', { before: load(bar) })
		const view = await s.mountSettings()
		const text = textOf(view.tree)
		const labels = switches(view).map(n => n.props.label)
		check('it has a switch for each button', labels.join() === 'Hide Apps & Commands,Hide Gift,Hide New Thread,Hide Voice Message', labels)
		check('all four are on by default', switches(view).every(n => n.props.value === true))
		check('the icons are asked for by name', switches(view).every(n => !!n.props.icon))
		check('it has both collapse groups with their choices', text.includes('Send Button Collapse Behavior') && text.includes('Collapse when no text') && text.includes('Action Buttons Collapse Behavior (Legacy)') && text.includes('Collapse while typing'))
		const groups = findNodes(view.tree, n => n.type === 'Design.TableRadioGroup')
		check('the defaults are never-collapse for send and collapse for actions', groups[0].props.defaultValue === 'never' && groups[1].props.defaultValue === 'collapse')
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !hasCredits(text), text.slice(-300))

		switches(view)[0].props.onValueChange(false)
		check('turning a switch off saves just that one', s.storage.cache.hide.app === false && !('gift' in s.storage.cache.hide), s.storage.cache.hide)
		bar.actions.type.render({ isAppLauncherEnabled: true, shouldShowGiftButton: true }, {})
		check('the next time the bar is drawn that button is back and the others are still hidden', bar.drawn.actions.at(-1).isAppLauncherEnabled === true && bar.drawn.actions.at(-1).shouldShowGiftButton === false, bar.drawn.actions.at(-1))

		groups[0].props.onChange('collapse')
		check('choosing a send button behavior saves it', s.storage.cache.collapse.send === true, s.storage.cache.collapse)
		groups[1].props.onChange('never')
		check('choosing an action buttons behavior saves it', s.storage.cache.collapse.actions === false && s.storage.cache.collapse.send === true)

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check finds the three parts', checks.includes('The send button was found') && checks.includes('The legacy action buttons were found') && checks.includes('The redesigned action buttons were found'))

		button(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs names the plugin and credits PalmDevs and the porter', report.includes('marklong.better-chat-buttons 1.0.0') && report.includes('Original plugin by PalmDevs') && report.includes('Ported to Valenced by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report has the settings', /"hide"/.test(report) && /"collapse"/.test(report))
		view.unmount()

		// --- Stopping
		const refs = fakeRefs()
		bar.send.type.render({}, refs.sendRef)
		await sleep(10)
		const wrapped = refs.sendRef.current.setHasText
		s.stop()
		check('after stopping Discord’s own render functions are back', bar.send.type.render === bar.send.original && bar.actions.type.render === bar.actions.original && bar.right.type.render === bar.right.original)
		check('and the functions on the refs are back', refs.sendRef.current.setHasText !== wrapped)
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	done()
})()
