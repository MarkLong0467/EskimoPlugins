'use strict'

/** Tests for Timestamp Maker. Run with: node tests/timestamp-maker.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Timestamp Maker')

const SHEET = 'MARKLONG_TIMESTAMP_MAKER'
const COMMAND_ID = '-731001'

/** Seconds since 1970 for a clock reading in UTC. */
const utc = (y, mo, d, h = 0, mi = 0) => Math.floor(Date.UTC(y, mo - 1, d, h, mi) / 1000)

/** Discord's module with the built-in commands. The list is the same array every time, like Discord's. */
function fakeBuiltIns() {
	const dice = { id: '-18', untranslatedName: 'roll-dice', displayName: 'roll-dice', type: 1, inputType: 0, applicationId: '-1' }
	const shrug = { id: '-1', untranslatedName: 'shrug', displayName: 'shrug', type: 1, inputType: 1, applicationId: '-1' }
	const items = [shrug, dice]
	const filtered = [shrug]
	return {
		items,
		filtered,
		getBuiltInCommands: (types, all, textOnly) => (all ? items : textOnly ? filtered : types.includes(1) ? filtered : []),
	}
}

/** Discord's message module, which remembers what it was asked to send. */
function fakeMessages() {
	const sent = []
	return { sent, sendMessage: (channelId, message, clear, options) => (sent.push({ channelId, message, clear, options }), Promise.resolve()), receiveMessage() {}, revealMessage() {} }
}

/** Discord's module that changes drafts. */
function fakeDrafts() {
	const calls = []
	return { calls, changeDraft: (channel, text, type) => calls.push({ channel, text, type }), clearDraft() {} }
}

const start = async (saved = {}, extra = {}) => {
	const builtIns = extra.builtIns ?? fakeBuiltIns()
	const messages = extra.messages ?? fakeMessages()
	const drafts = extra.drafts ?? fakeDrafts()
	const s = await startPort('timestamp-maker', {
		saved,
		reactExtras: true,
		stores: {
			SelectedChannelStore: { getChannelId: () => (extra.noChannel ? undefined : 'chan1') },
			DraftStore: { getDraft: () => extra.draft ?? '' },
		},
		before: runtime => {
			runtime.valenced.modules.finders.loadModule(builtIns)
			runtime.valenced.modules.finders.loadModule(messages)
			runtime.valenced.modules.finders.loadModule(drafts)
		},
	})
	// The test renderer keeps hook state by position, so a new popup would inherit the last one's state: unmount the old view first.
	let last
	const mountSheet = s.mountSheet
	const mountSettings = s.mountSettings
	const fresh = make => async (...args) => {
		last?.unmount()
		last = await make(...args)
		return last
	}
	return Object.assign(s, { builtIns, messages, drafts, mountSheet: fresh(mountSheet), mountSettings: fresh(mountSettings) })
}

const timestampOf = list => list.find(item => item.id === COMMAND_ID)
const row = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
const switchRow = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)

/** Sends a message through Discord's own sendMessage, which the plugin has patched, and returns what Discord got. */
async function say(s, content) {
	const before = s.messages.sent.length
	s.messages.sendMessage('chan1', { content, nonce: 'n' }, false, {})
	return s.messages.sent.slice(before)[0]?.message.content
}

;(async () => {
	// --- The command is added to Discord's built-in commands
	{
		const s = await start()
		const all = s.builtIns.getBuiltInCommands([1], true, false)
		const cmd = timestampOf(all)
		check('/timestamp is added to the full list', !!cmd && all.length === 3, all.map(c => c.id))
		check('it is a built-in command like Discord’s', cmd.applicationId === '-1' && cmd.untranslatedName === 'timestamp' && cmd.displayName === 'timestamp' && cmd.type === 1, cmd)
		check('its kind of input is copied from /roll-dice (a command that sends nothing)', cmd.inputType === 0)
		check('it has a description', /timestamp/i.test(cmd.displayDescription) && cmd.displayDescription === cmd.untranslatedDescription)
		check('it has the options when and style, as strings', cmd.options.map(o => o.name).join() === 'when,style' && cmd.options.every(o => o.type === 3 && o.displayName === o.name && o.description))
		check('style offers all seven styles', cmd.options[1].choices.map(c => c.value).join() === 'f,F,R,t,T,d,D' && cmd.options[1].choices.every(c => c.name && c.displayName === c.name))
		check('its id is far from Discord’s own', Number(cmd.id) < -100000)
		check('asking again gives the same list and the same command, so nothing draws again for no reason', s.builtIns.getBuiltInCommands([1], true, false) === all && timestampOf(s.builtIns.getBuiltInCommands([1], true, false)) === cmd)
		check('Discord’s own list is not changed', s.builtIns.items.length === 2)
		const forChat = s.builtIns.getBuiltInCommands([1], false, false)
		check('the list for a chat has it too', !!timestampOf(forChat) && forChat.length === 2)
		check('a text-only list does not (it is not a text command)', !timestampOf(s.builtIns.getBuiltInCommands([1], false, true)))
		check('a list for other kinds of commands does not', !timestampOf(s.builtIns.getBuiltInCommands([2], false, false)))
		check('every wrapper returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
		check('turning the plugin off takes it out again', !timestampOf(s.builtIns.getBuiltInCommands([1], true, false)))
		check('no errors', s.errors.length === 0, s.errors)
	}
	{
		const s = await start({ command: false })
		check('with the command switched off it is not in the list', !timestampOf(s.builtIns.getBuiltInCommands([1], true, false)))
		const view = await s.mountSettings()
		switchRow(view, '/timestamp command').props.onValueChange(true)
		await sleep(5)
		check('switching it on shows it at the next ask', !!timestampOf(s.builtIns.getBuiltInCommands([1], true, false)))
		s.stop()
	}
	{
		// A Discord whose /roll-dice is not there: the plugin still works, with the default kind
		const bare = { getBuiltInCommands: () => [] }
		const s = await start({}, { builtIns: bare })
		const list = bare.getBuiltInCommands([1], true, false)
		check('without /roll-dice to copy from it still adds the command, with kind 0', timestampOf(list)?.inputType === 0)
		s.stop()
	}

	// --- Running the command opens the popup
	{
		const s = await start()
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		const result = cmd.execute([], { channel: { id: 'chan9' } })
		await sleep(5)
		check('running it sends nothing to the chat', result === undefined && s.messages.sent.length === 0)
		check('it opens the popup', s.opened(SHEET).length === 1)
		const popup = await s.mountSheet(SHEET)
		const text = textOf(popup.tree)
		check('the popup has a title, the preview and what gets sent', text.includes('Timestamp') && /<t:\d+:f>/.test(text), text.slice(0, 300))
		check('it has the main button and the two others', ['Send', 'Add to message', 'Copy', 'Cancel'].every(t => !!button(popup, t)))
		check('the quick picks are there', ['Now', 'In 1 hour', 'Tomorrow 9 AM'].every(t => !!button(popup, t)))
		check('all seven styles are listed with previews', findNodes(popup.tree, n => n.type === 'Design.TableRow' && /<t:\d+:[tTdDfFR]>/.test(n.props.subLabel ?? '')).length === 7)
		check('the steppers are there', ['Year', 'Month', 'Day', 'Hour', 'Minute', 'Zone'].every(t => text.includes(t)))
		check('there is a When box and a Message box', findNodes(popup.tree, n => n.type === 'Design.TextInput').map(n => n.props.label).join() === 'When,Message')
		s.stop()
	}
	{
		const s = await start({ zone: 0 })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }, { name: 'style', value: 'F' }], { channel: { id: 'chan9' } })
		await sleep(5)
		const popup = await s.mountSheet(SHEET)
		check('a time given to the command is filled in, in the style given', textOf(popup.tree).includes(`<t:${utc(2026, 12, 25, 18)}:F>`), textOf(popup.tree).slice(0, 400))
		check('and shown in the When box', findNode(popup.tree, n => n.type === 'Design.TextInput' && n.props.label === 'When').props.value === '2026-12-25 18:00')
		button(popup, 'Send').props.onPress()
		await sleep(5)
		const sent = s.messages.sent.at(-1)
		check('Send posts it in the chat the command was run in', sent?.channelId === 'chan9' && sent.message.content === `<t:${utc(2026, 12, 25, 18)}:F>`, s.messages.sent)
		check('the message has what Discord needs', sent.message.tts === false && Array.isArray(sent.message.invalidEmojis) && Array.isArray(sent.message.validNonShortcutEmojis) && sent.clear === false)
		check('the popup closes and a toast says so', s.runtime.log.actions.some(a => a.label === 'actionSheet' && a.name === 'hideActionSheet' && a.args[0] === SHEET) && s.toasts().includes('Timestamp sent'), s.toasts())
		check('it is kept in the recent list', s.storage.cache.recents?.length === 1 && s.storage.cache.recents[0].style === 'F' && s.storage.cache.recents[0].at === utc(2026, 12, 25, 18) * 1000)
		check('and the style is remembered', s.storage.cache.style === 'F')
		s.stop()
	}

	// --- Using the popup
	{
		const s = await start({ zone: 0 })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'c' } })
		await sleep(5)
		let popup = await s.mountSheet(SHEET)
		const whenBox = () => findNode(popup.tree, n => n.type === 'Design.TextInput' && n.props.label === 'When')
		const stepper = (label, sign) => findNodes(popup.tree, n => n.type === 'Design.Button' && n.props.text === (sign > 0 ? '+' : '−'))[['Year', 'Month', 'Day', 'Hour', 'Minute', 'Zone'].indexOf(label)]
		const redraw = async () => (await popup.settle(), popup)

		stepper('Day', 1).props.onPress()
		await redraw()
		check('the Day button moves a day', textOf(popup.tree).includes(`<t:${utc(2026, 12, 26, 18)}:f>`), textOf(popup.tree).slice(0, 300))
		check('and clears the words, which no longer describe the time', whenBox().props.value === '')
		stepper('Month', 1).props.onPress()
		await redraw()
		check('the Month button moves a month (Dec 26 to Jan 26)', textOf(popup.tree).includes(`<t:${utc(2027, 1, 26, 18)}:f>`))
		stepper('Year', -1).props.onPress()
		await redraw()
		check('the Year button moves a year', textOf(popup.tree).includes(`<t:${utc(2026, 1, 26, 18)}:f>`))
		stepper('Hour', 1).props.onPress()
		stepper('Minute', 1).props.onPress()
		await redraw()
		check('Hour moves an hour and Minute moves by the step in the settings (5)', textOf(popup.tree).includes(`<t:${utc(2026, 1, 26, 19, 5)}:f>`))

		whenBox().props.onChange('2027-02-28 09:30')
		await redraw()
		check('typing a time sets it', textOf(popup.tree).includes(`<t:${utc(2027, 2, 28, 9, 30)}:f>`))
		stepper('Month', 1).props.onPress()
		await redraw()
		check('a month step from the 28th of February stays on the 28th', textOf(popup.tree).includes(`<t:${utc(2027, 3, 28, 9, 30)}:f>`))
		whenBox().props.onChange('2027-01-31 10:00')
		await redraw()
		stepper('Month', 1).props.onPress()
		await redraw()
		check('a month step from the 31st of January lands on the last day of February, not in March', textOf(popup.tree).includes(`<t:${utc(2027, 2, 28, 10)}:f>`))

		whenBox().props.onChange('hello there')
		await redraw()
		check('words that cannot be read say so, in red', /could not read that/i.test(textOf(popup.tree)) && findNode(popup.tree, n => n.type === 'Design.Text' && n.props.color === 'text-danger') !== null)
		check('and the buttons do nothing until they can be', button(popup, 'Send').props.disabled === true)
		button(popup, 'Send').props.onPress()
		await sleep(5)
		check('nothing was sent', s.messages.sent.length === 0)
		whenBox().props.onChange('2027-06-01 12:00')
		await redraw()
		check('fixing the words brings the buttons back', button(popup, 'Send').props.disabled === false)

		// styles
		const styleRow = id => findNodes(popup.tree, n => n.type === 'Design.TableRow' && (n.props.subLabel ?? '').includes(`<t:${utc(2027, 6, 1, 12)}:${id}>`))[0]
		styleRow('R').props.onPress()
		await redraw()
		check('picking a style puts it in the tag and a check mark on its row', textOf(popup.tree).includes(`<t:${utc(2027, 6, 1, 12)}:R>`) && !!styleRow('R').props.trailing && !styleRow('f').props.trailing)
		check('relative previews count from now', /in \d+ (days|months)|in a (month|year)|in \d+ months/.test(textOf(popup.tree)), textOf(popup.tree).slice(0, 300))
		styleRow('t').props.onPress()
		await redraw()

		// extras
		switchRow(popup, 'Also show how long from now').props.onValueChange(true)
		await redraw()
		check('“also show how long from now” adds the relative tag', textOf(popup.tree).includes(`<t:${utc(2027, 6, 1, 12)}:t> (<t:${utc(2027, 6, 1, 12)}:R>)`))
		switchRow(popup, 'Show the raw tag').props.onValueChange(true)
		await redraw()
		check('“show the raw tag” wraps it in backticks', textOf(popup.tree).includes(`\`<t:${utc(2027, 6, 1, 12)}:t> (<t:${utc(2027, 6, 1, 12)}:R>)\``))
		findNode(popup.tree, n => n.type === 'Design.TextInput' && n.props.label === 'Message').props.onChange('Meeting starts {time} sharp')
		await redraw()
		check('a message with {time} puts the tag where {time} is', textOf(popup.tree).includes('Meeting starts `<t:') && textOf(popup.tree).includes(' sharp'))
		findNode(popup.tree, n => n.type === 'Design.TextInput' && n.props.label === 'Message').props.onChange('Meeting')
		await redraw()
		check('a message without {time} gets the tag on the end', textOf(popup.tree).includes('Meeting `<t:'))
		switchRow(popup, 'Show the raw tag').props.onValueChange(false)
		switchRow(popup, 'Also show how long from now').props.onValueChange(false)
		await redraw()

		// quick pick
		button(popup, 'In 1 hour').props.onPress()
		await redraw()
		const nowSeconds = Math.floor(Date.now() / 1000)
		const shown = Number((textOf(popup.tree).match(/<t:(\d+):t>/) ?? [])[1])
		check('a quick pick sets the time from now', Math.abs(shown - (nowSeconds + 3600)) <= 5, shown - nowSeconds)

		// time zone
		stepper('Zone', 1).props.onPress()
		await redraw()
		check('the Zone button moves the clock the steppers use, and is saved', s.storage.cache.zone === 30 && /UTC\+00:30/.test(textOf(popup.tree)), s.storage.cache.zone)

		// copy
		button(popup, 'Copy').props.onPress()
		await sleep(5)
		check('Copy copies the finished text', /^Meeting <t:\d+:t>$/.test(s.copied.at(-1) ?? ''), s.copied)
		check('and sends nothing', s.messages.sent.length === 0)
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}

	// --- Add to message
	{
		const s = await start({ zone: 0, action: 'insert' })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		// Discord draws its chat input: the plugin learns the chat box from its props
		const ChatInputAppCommandManager = function ChatInputAppCommandManager() { return null }
		const inserted = []
		const ref = { current: { insertText: t => inserted.push(t), focus() { inserted.push('focus') } } }
		s.runtime.valenced.react.ReactJSXRuntime.jsx(ChatInputAppCommandManager, { chatInputRef: ref })
		s.runtime.valenced.react.ReactJSXRuntime.jsx(ChatInputAppCommandManager, { chatInputRef: ref })
		await sleep(5)
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'c' } })
		await sleep(5)
		let popup = await s.mountSheet(SHEET)
		check('the main button is what the settings say', !!button(popup, 'Add to message') && button(popup, 'Add to message').props.variant === 'primary' && button(popup, 'Send').props.variant === 'secondary')
		button(popup, 'Add to message').props.onPress()
		await sleep(5)
		check('Add to message puts the text in the chat box and focuses it', inserted.join('|') === `<t:${utc(2026, 12, 25, 18)}:f>|focus`, inserted)
		check('and does not send', s.messages.sent.length === 0)
		check('with a toast', s.toasts().includes('Added to your message'))

		// Without the chat box: the saved draft
		ref.current = null
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'c' } })
		await sleep(5)
		popup = await s.mountSheet(SHEET)
		button(popup, 'Add to message').props.onPress()
		await sleep(5)
		check('without the chat box it changes the saved draft of the open chat', s.drafts.calls.at(-1)?.channel === 'c' && s.drafts.calls.at(-1)?.text === `<t:${utc(2026, 12, 25, 18)}:f>` && s.drafts.calls.at(-1)?.type === 0, s.drafts.calls)
		s.stop()
	}
	{
		const s = await start({ zone: 0, action: 'insert' }, { draft: 'see you' })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'c' } })
		await sleep(5)
		button(await s.mountSheet(SHEET), 'Add to message').props.onPress()
		await sleep(5)
		check('the draft keeps what was already written, with a space', s.drafts.calls.at(-1)?.text === `see you <t:${utc(2026, 12, 25, 18)}:f>`, s.drafts.calls)
		s.stop()
	}
	{
		const s = await start({ zone: 0, action: 'insert' }, { drafts: { changeDraft: 1 } })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'c' } })
		await sleep(5)
		button(await s.mountSheet(SHEET), 'Add to message').props.onPress()
		await sleep(5)
		check('and when even that fails it copies, and says to paste', /^<t:\d+:f>$/.test(s.copied.at(-1) ?? '') && s.toasts().includes('Copied. Paste it into your message'), [s.copied, s.toasts()])
		s.stop()
	}
	{
		const s = await start({}, { noChannel: true })
		s.runtime.valenced.react.ReactJSXRuntime.jsx(function ChatInputAppCommandManager() { return null }, {})
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([], {})
		await sleep(5)
		const popup = await s.mountSheet(SHEET)
		check('with no chat, Send and Add to message are off but Copy works', button(popup, 'Send').props.disabled === true && button(popup, 'Add to message').props.disabled === true && button(popup, 'Copy').props.disabled === false)
		s.stop()
	}

	// --- Skipping the popup
	{
		const s = await start({ zone: 0, skipPopup: true, action: 'send' })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: 'dec 25 2026 6pm' }, { name: 'style', value: 'R' }], { channel: { id: 'c' } })
		await sleep(5)
		check('with “skip the popup” a given time is sent at once, in the style given', s.opened(SHEET).length === 0 && s.messages.sent.at(-1)?.message.content === `<t:${utc(2026, 12, 25, 18)}:R>`, s.messages.sent)
		cmd.execute([{ name: 'when', value: 'gibberish words' }], { channel: { id: 'c' } })
		await sleep(5)
		check('a time that cannot be read opens the popup instead', s.opened(SHEET).length === 1)
		cmd.execute([], { channel: { id: 'c' } })
		await sleep(5)
		check('and with no time given it opens the popup', s.opened(SHEET).length === 2)
		s.stop()
	}

	// --- @time in sent messages
	{
		const s = await start({ zone: 0, atTimeStyle: 'f' })
		const near = async (text, expectSeconds, style = 'f', slack = 5) => {
			const out = await say(s, text)
			const m = out.match(/<t:(\d+):(\w)>/)
			return !!m && m[2] === style && Math.abs(Number(m[1]) - expectSeconds) <= slack
		}
		const now = Math.floor(Date.now() / 1000)
		check('@time alone is the moment of sending, in the style from the settings', await near('@time', now))
		check('@time(...) with words is a time', (await say(s, '@time(2026-12-25 18:00)')) === `<t:${utc(2026, 12, 25, 18)}:f>`)
		check('a style can follow', (await say(s, '@time:R')).endsWith(':R>') && (await say(s, '@time(2026-12-25 18:00):D')) === `<t:${utc(2026, 12, 25, 18)}:D>`)
		check('it works inside a sentence, more than once', (await say(s, 'from @time(2026-12-25 9am) to @time(2026-12-25 5:30pm):t!')) === `from <t:${utc(2026, 12, 25, 9)}:f> to <t:${utc(2026, 12, 25, 17, 30)}:t>!`)
		check('plain messages are sent as they were', (await say(s, 'hello there')) === 'hello there')
		check('the rest of the message is passed on', s.messages.sent.at(-1).channelId === 'chan1' && s.messages.sent.at(-1).message.nonce === 'n')
		check('words stuck to a word are not @time', (await say(s, 'mail@time.com and @times and a@time')) === 'mail@time.com and @times and a@time')
		check('code is left alone', (await say(s, '`@time` and ```\n@time\n``` and @time(2026-12-25 18:00)')) === `\`@time\` and \`\`\`\n@time\n\`\`\` and <t:${utc(2026, 12, 25, 18)}:f>`)
		check('words that cannot be read are sent as typed', (await say(s, '@time(blah blah) ok')) === '@time(blah blah) ok')
		check('an empty () is the moment of sending', await near('@time()', now))

		// Many ways to write a time
		const day = (y, mo, d, h, mi = 0) => utc(y, mo, d, h, mi)
		const reads = async (words, expect, style = 'f') => {
			const out = await say(s, `@time(${words})`)
			return out === `<t:${expect}:${style}>` || (typeof expect === 'function' && expect(out))
		}
		check('ISO date and 24-hour time', await reads('2026-12-25 18:00', day(2026, 12, 25, 18)))
		check('ISO date alone is noon', await reads('2026-12-25', day(2026, 12, 25, 12)))
		check('month name and day', await reads('dec 25 2026 6pm', day(2026, 12, 25, 18)))
		check('day and month name', await reads('25 december 2026 6:30pm', day(2026, 12, 25, 18, 30)))
		check('ordinals', await reads('25th dec 2026 9am', day(2026, 12, 25, 9)))
		check('slashes, month first', await reads('12/25/2026 6pm', day(2026, 12, 25, 18)))
		check('a first number over 12 is a day even when month comes first', await reads('25/12/2026 6pm', day(2026, 12, 25, 18)))
		check('noon and midnight', await reads('2026-12-25 noon', day(2026, 12, 25, 12)) && await reads('2026-12-25 midnight', day(2026, 12, 25, 0)))
		check('12am and 12pm', await reads('2026-12-25 12am', day(2026, 12, 25, 0)) && await reads('2026-12-25 12pm', day(2026, 12, 25, 12)))
		check('a Unix time', await reads('1794000000', 1794000000))
		check('“in 2 hours”', await near('@time(in 2 hours)', now + 7200))
		check('“+30m”, “1d12h” and “in 1 day 3 hours”', (await near('@time(+30m)', now + 1800)) && (await near('@time(1d12h)', now + 129600)) && (await near('@time(in 1 day 3 hours)', now + 97200)))
		check('“3 days ago” and “-2w”', (await near('@time(3 days ago)', now - 259200)) && (await near('@time(-2w)', now - 1209600)))
		check('“in 90 seconds” and “2 weeks”', (await near('@time(in 90 seconds)', now + 90)) && (await near('@time(2 weeks)', now + 1209600)))
		const tomorrowNine = (() => { const d = new Date(); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1, 9) / 1000) })()
		check('“tomorrow 9am”', await near('@time(tomorrow 9am)', tomorrowNine, 'f', 1))
		const yesterdayTime = (() => { const d = new Date(); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - 1, d.getUTCHours(), d.getUTCMinutes()) / 1000) })()
		check('“yesterday” keeps the time of day', await near('@time(yesterday)', yesterdayTime, 'f', 61))
		const tonight = (() => { const d = new Date(); return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20) / 1000) })()
		check('“tonight” is 8 PM today', await near('@time(tonight)', tonight, 'f', 1))
		const fri = await say(s, '@time(friday 8pm)')
		const friDate = new Date(Number(fri.match(/<t:(\d+)/)[1]) * 1000)
		check('“friday 8pm” is a Friday at 20:00 within a week', friDate.getUTCDay() === 5 && friDate.getUTCHours() === 20 && friDate.getTime() > Date.now() - 1000 && friDate.getTime() < Date.now() + 7 * 86400000 + 1000, fri)
		const nextMon = new Date(Number((await say(s, '@time(next monday 9am)')).match(/<t:(\d+)/)[1]) * 1000)
		check('“next monday 9am” is a Monday at 09:00 in the future', nextMon.getUTCDay() === 1 && nextMon.getUTCHours() === 9 && nextMon.getTime() > Date.now())
		check('“next week”', await near('@time(next week)', now + 7 * 86400, 'f', 61))
		const nextMonth = new Date(); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1)
		const nm = new Date(Number((await say(s, '@time(next month)')).match(/<t:(\d+)/)[1]) * 1000)
		check('“next month” is a month on', Math.abs(nm.getTime() - nextMonth.getTime()) < 3 * 86400000)
		check('“at 5pm on 2026-12-25” ignores filler words', await reads('at 5pm on 2026-12-25', day(2026, 12, 25, 17)))
		check('capitals are fine', await reads('2026-12-25 6PM', day(2026, 12, 25, 18)))
		check('13pm and 25:00 are not times', (await say(s, '@time(13pm)')) === '@time(13pm)' && (await say(s, '@time(2026-12-25 25:00)')) === '@time(2026-12-25 25:00)')
		check('the 32nd is not a day', (await say(s, '@time(2026-12-32)')) === '@time(2026-12-32)')
		check('every wrapper returned what Valenced needs', s.violations.length === 0, s.violations)
		s.stop()
	}
	{
		const s = await start({ zone: 330 })
		check('a fixed zone is the clock the words are read in (UTC+05:30)', (await say(s, '@time(2026-12-25 18:00)')) === `<t:${utc(2026, 12, 25, 12, 30)}:f>`)
		s.stop()
	}
	{
		const s = await start({ zone: 0, order: 'dmy' })
		check('with day first, 3/4 is the 3rd of April', (await say(s, '@time(3/4/2026 noon)')) === `<t:${utc(2026, 4, 3, 12)}:f>`)
		s.stop()
		const t = await start({ zone: 0, order: 'mdy' })
		check('with month first, 3/4 is March 4th', (await say(t, '@time(3/4/2026 noon)')) === `<t:${utc(2026, 3, 4, 12)}:f>`)
		t.stop()
	}
	{
		const s = await start({ zone: 0, atTimeStyle: 'R' })
		check('the style for @time comes from the settings', /^<t:\d+:R>$/.test(await say(s, '@time')))
		s.stop()
	}
	{
		const s = await start({ zone: 0, rollForward: true })
		const out = await say(s, `@time(${(() => { const d = new Date(Date.now() - 3600000); return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, '0')}` })()})`)
		const at = Number(out.match(/<t:(\d+)/)[1]) * 1000
		check('with “a time that has passed means tomorrow”, a time an hour ago is tomorrow', at > Date.now() + 22 * 3600000 && at < Date.now() + 24 * 3600000, out)
		s.stop()
	}

	// --- @time can be switched off
	{
		const s = await start({ atTime: false })
		check('with @time switched off it is sent as plain text', (await say(s, 'see you @time(tomorrow 9am) ok @time')) === 'see you @time(tomorrow 9am) ok @time')
		const view = await s.mountSettings()
		check('the settings have the switch, and it shows off', switchRow(view, '@time in messages')?.props.value === false)
		switchRow(view, '@time in messages').props.onValueChange(true)
		await sleep(5)
		check('switching it on works at once', /<t:\d+:f>/.test(await say(s, '@time')))
		check('a toast says so', s.toasts().includes('@time is on'), s.toasts())
		const again = await s.mountSettings()
		switchRow(again, '@time in messages').props.onValueChange(false)
		await sleep(5)
		check('and off again at once, no restart', (await say(s, '@time')) === '@time' && s.toasts().includes('@time is off'))
		check('what is saved', s.storage.cache.atTime === false)
		s.stop()
		s.messages.sendMessage('chan1', { content: '@time' }, false, {})
		check('with the plugin off, nothing is converted', s.messages.sent.at(-1).message.content === '@time')
	}

	// --- Settings
	{
		const s = await start({ zone: 0 })
		let view = await s.mountSettings()
		const text = textOf(view.tree)
		check('the settings explain it and show the status', /Working|Ready/.test(text) && text.includes('/timestamp') && text.includes('@time'))
		check('there are no credits on the screen', !hasCredits(text))
		check('it has the debugging section', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !!button(view, 'Run self-check'))
		check('there is a button that opens the popup', !!row(view, 'Open the popup'))
		row(view, 'Open the popup').props.onPress()
		await sleep(5)
		check('and it does', s.opened(SHEET).length === 1)

		// radio groups
		const group = title => findNode(view.tree, n => n.type === 'Design.TableRowGroup' && n.props.title === title)
		const radioOf = title => findNode(group(title), n => n.type === 'Design.TableRadioGroup')
		check('@time style lists all seven styles', findNodes(radioOf('Style for @time'), n => n.type === 'Design.TableRadioRow').length === 7)
		radioOf('Style for @time').props.onChange('R')
		radioOf('Main button').props.onChange('copy')
		radioOf('Reading what you type').props.onChange('dmy')
		radioOf('Minute buttons').props.onChange('15')
		radioOf('Recent').props.onChange('3')
		await sleep(5)
		check('every choice is saved', s.storage.cache.atTimeStyle === 'R' && s.storage.cache.action === 'copy' && s.storage.cache.order === 'dmy' && s.storage.cache.minuteStep === 15 && s.storage.cache.recentsMax === 3, s.storage.cache)
		for (const [label, key] of [['Quick picks', 'quickPicks'], ['Remember my last choices', 'remember'], ['Skip the popup when a time is typed', 'skipPopup'], ['24-hour clock', 'h24'], ['A time that has passed means tomorrow', 'rollForward']]) {
			view = await s.mountSettings()
			const before = switchRow(view, label).props.value
			switchRow(view, label).props.onValueChange(!before)
			await sleep(5)
			check(`the “${label}” switch is saved`, s.storage.cache[key] === !before, s.storage.cache[key])
		}
		view = await s.mountSettings()
		row(view, 'Later by 30 minutes').props.onPress()
		await sleep(5)
		check('the time zone can be moved by half hours', s.storage.cache.zone === 30)
		view = await s.mountSettings()
		row(view, 'Earlier by 30 minutes').props.onPress()
		row(view, 'Earlier by 30 minutes').props.onPress()
		await sleep(5)
		check('and back', s.storage.cache.zone === -30 || s.storage.cache.zone === 0)
		view = await s.mountSettings()
		row(view, 'Back to this phone', true)
		const back = findNode(view.tree, n => n.type === 'Design.TableRow' && /^Back to this phone/.test(n.props.label ?? ''))
		back.props.onPress()
		await sleep(5)
		check('one tap goes back to the phone’s zone', s.storage.cache.zone === 'device')

		view = await s.mountSettings()
		const reset = row(view, 'Reset all settings')
		reset.props.onPress()
		await view.settle()
		check('resetting asks twice', !!row(view, 'Tap again to reset'))
		row(view, 'Tap again to reset').props.onPress()
		await sleep(5)
		check('and puts every setting back', s.storage.cache.atTimeStyle === 'f' && s.storage.cache.action === 'send' && s.storage.cache.order === 'mdy' && s.storage.cache.h24 === false && s.storage.cache.command === true)
		s.stop()
		check('no errors', s.errors.length === 0, s.errors)
	}
	{
		// Old or damaged saves do not break anything
		const s = await start({ atTimeStyle: 'Z', zone: 'mars', recents: 'no', minuteStep: 7, style: 3 })
		check('a bad @time style falls back to the default', /^<t:\d+:f>$/.test(await say(s, '@time')))
		const view = await s.mountSettings()
		check('and the screen still draws', textOf(view.tree).includes('/timestamp'))
		s.stop()
	}
	{
		// The recent list
		const s = await start({ zone: 0, recentsMax: 2 })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		for (const when of ['2026-01-01 10:00', '2026-01-02 10:00', '2026-01-03 10:00', '2026-01-03 10:00']) {
			cmd.execute([{ name: 'when', value: when }], { channel: { id: 'c' } })
			await sleep(5)
			button(await s.mountSheet(SHEET), 'Copy').props.onPress()
			await sleep(5)
		}
		check('only as many recents as the settings say, newest first, no repeats', s.storage.cache.recents.length === 2 && s.storage.cache.recents[0].at === utc(2026, 1, 3, 10) * 1000 && s.storage.cache.recents[1].at === utc(2026, 1, 2, 10) * 1000, s.storage.cache.recents)
		cmd.execute([], { channel: { id: 'c' } })
		await sleep(5)
		const popup = await s.mountSheet(SHEET)
		const recentRows = findNodes(popup.tree, n => n.type === 'Design.TableRow' && /^.* · <t:\d+:f>$/.test(n.props.subLabel ?? '') && (n.props.subLabel ?? '').includes(String(utc(2026, 1, 3, 10))))
		check('they are listed in the popup', recentRows.length >= 1)
		recentRows[0].props.onPress()
		await popup.settle()
		check('picking one fills it in', textOf(popup.tree).includes(`<t:${utc(2026, 1, 3, 10)}:f>`))
		button(popup, 'Clear recent').props.onPress()
		await sleep(5)
		check('clearing empties the list', s.storage.cache.recents.length === 0)
		s.stop()
	}

	// --- The report
	{
		const s = await start({ zone: 0, message: 'secret plans {time}' })
		const cmd = timestampOf(s.builtIns.getBuiltInCommands([1], true, false))
		cmd.execute([{ name: 'when', value: '2026-12-25 18:00' }], { channel: { id: 'chan-private-123' } })
		await sleep(5)
		button(await s.mountSheet(SHEET), 'Send').props.onPress()
		await say(s, '@time(2026-12-25 18:00) and @time(zzz)')
		const view = await s.mountSettings()
		button(view, 'Copy logs').props.onPress()
		const report = s.copied.at(-1) ?? ''
		check('the report starts with the plugin and Discord versions', /Timestamp Maker debug report/.test(report) && /Discord: 354\.5/.test(report), report.slice(0, 300))
		check('it says the command was found and patched', /Module with getBuiltInCommands: found; patch patched/.test(report), report)
		check('it says where the command kind came from', /copied from Discord's own \(roll-dice\): yes/.test(report))
		check('it counts how often the list was asked and /timestamp was in it', /asked for its built-in commands [1-9]\d* time\(s\); \/timestamp was in the answer [1-9]/.test(report))
		check('it counts runs, popups and sends', /was run 1 time\(s\)/.test(report) && /Popups opened: 1; sent: 1/.test(report), report)
		check('it says what the options of the run were, not their words', /last options: when/.test(report))
		check('it counts @time conversions and unreadable ones', /converted 1; left as typed because the time was not understood 1/.test(report), report)
		check('it says whether the chat box is known', /chat box ref known: (yes|no)/.test(report))
		check('it has the settings', /"atTime": true/.test(report) && /"action": "send"/.test(report))
		check('it holds no message text, time or channel', !/secret plans|chan-private-123|2026-12-25|zzz/.test(report) && !/<t:\d/.test(report), report)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = findNodes(view.tree, n => n.type === 'Design.TableRow' && /^[✓✗]/.test(n.props.label ?? '')).map(n => n.props.label)
		check('the self-check lists its steps', checks.length >= 6 && checks.some(c => /built-in command list/.test(c)) && checks.some(c => /@time/.test(c)), checks)
		check('and the steps that can pass here pass', checks.filter(c => /^✓/.test(c)).length >= 4, checks)
		s.stop()
	}
	{
		// Nothing found: the report and the status say what is missing
		const s = await startPort('timestamp-maker', { reactExtras: true })
		const view = await s.mountSettings()
		check('when Discord’s module has not been found the status says to open the / menu', /Open the \/ menu in a chat once/.test(textOf(view.tree)))
		button(view, 'Copy logs').props.onPress()
		check('and the report says not found yet', /getBuiltInCommands: not found yet/.test(s.copied.at(-1) ?? ''))
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
