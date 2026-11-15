'use strict'

/** Tests for Webhook Builder. Run with: node tests/webhook-builder.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Webhook Builder')

const ID = '111111111111111111'
const TOKEN = 'abcdefghijklmnopqrstuvwxyz0123456789ABCD'
const URL = `https://discord.com/api/webhooks/${ID}/${TOKEN}`
const API = 'https://discord.com/api/v10'
const COMMIT = 420

;(async () => {
	// Discord's API, as far as webhooks go.
	const requests = []
	const messages = new Map()
	let nextMessage = 900000000000000000n
	globalThis.fetch = async (url, options = {}) => {
		const method = options.method ?? 'GET'
		const body = options.body ? JSON.parse(options.body) : undefined
		requests.push({ url, method, body })
		const reply = (status, json) => ({ status, ok: status < 300, json: async () => json, blob: async () => ({}) })
		const path = url.replace(API, '').split('?')[0]
		if (path === `/webhooks/${ID}/${TOKEN}` && method === 'GET')
			return reply(200, { id: ID, type: 1, name: 'Announcer', avatar: null, channel_id: '222222222222222222', guild_id: '333333333333333333' })
		if (path === `/webhooks/${ID}/${TOKEN}` && method === 'POST') {
			const id = String(nextMessage++)
			const message = { id, channel_id: '222222222222222222', webhook_id: ID, author: { id: ID, username: body.username ?? 'Announcer' }, ...body }
			messages.set(id, message)
			return reply(200, message)
		}
		const m = path.match(/^\/webhooks\/\d+\/[\w-]+\/messages\/(\d+)$/)
		if (m && method === 'GET') return messages.has(m[1]) ? reply(200, messages.get(m[1])) : reply(404, { message: 'Unknown Message', code: 10008 })
		if (m && method === 'PATCH') {
			messages.set(m[1], { ...messages.get(m[1]), ...body })
			return reply(200, messages.get(m[1]))
		}
		if (m && method === 'DELETE') {
			messages.delete(m[1])
			return reply(204)
		}
		return reply(404, { message: 'Unknown Webhook', code: 10015 })
	}

	// Discord's own connection, for what needs your login.
	const http = []
	const discordHttp = {
		HTTPResponseError: class {},
		async get({ url }) {
			http.push(url)
			if (url === '/guilds/333333333333333333/webhooks')
				return {
					body: [
						{ id: '444444444444444444', type: 1, token: 'secondtokensecondtokensecond', name: 'Logs', channel_id: '222222222222222222', guild_id: '333333333333333333' },
						{ id: '555555555555555555', type: 2, name: 'Followed news' },
					],
				}
			if (url.startsWith('/channels/222222222222222222/messages'))
				return { body: [{ id: '777777777777777777', content: 'From chat', embeds: [{ type: 'rich', title: 'Chat embed', color: 0xff0000 }, { type: 'article', title: 'A link preview' }] }] }
			throw { status: 403, body: { message: 'Missing Permissions', code: 50013 } }
		},
		async post({ url, body }) {
			http.push(url)
			return { body: { id: '666666666666666666', type: 1, token: 'newtokennewtokennewtokennew', name: body.name, channel_id: '222222222222222222', guild_id: '333333333333333333' } }
		},
		del() {},
		patch() {},
	}

	const alerts = []
	let clipboard = ''
	const s = await startPort('webhook-builder', {
		reactExtras: true,
		stores: {
			SelectedGuildStore: { getGuildId: () => '333333333333333333' },
			SelectedChannelStore: { getChannelId: () => '222222222222222222' },
			ChannelStore: { getChannel: id => (id === '222222222222222222' ? { id, name: 'general', guild_id: '333333333333333333', type: 0 } : undefined) },
			GuildStore: { getGuild: () => ({ name: 'Test Server' }) },
		},
		overrides: {
			react: { ReactNative: { Alert: { alert: (title, body, buttons) => alerts.push({ title, body, buttons }) } } },
			externals: { ReactNativeClipboard: { Clipboard: { getString: async () => clipboard, setString: text => { clipboard = text } } } },
		},
		before: runtime => runtime.finders.loadModule(discordHttp),
	})
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
	const { React } = s.runtime
	const sheets = s.runtime.valenced.discord.actions.ActionSheetActionCreators
	const saved = () => s.storage.cache
	const press = (view, text) => button(view, text)?.props.onPress()
	const row = (view, label) => findNode(view.tree, n => typeof n.props?.label === 'string' && n.props.label === label)
	const input = (view, label) => findNode(view.tree, n => (n.type === 'Design.TextInput' || n.type === 'Design.TextArea') && n.props.label === label)
	const type = async (view, label, text) => {
		const box = input(view, label)
		if (!box) throw new Error(`no box ${label}`)
		box.props.onChange(text)
		await view.settle()
		await sleep(COMMIT)
		await view.settle()
	}
	const sheet = async key => {
		await sleep(5)
		return s.mountSheet(key)
	}
	const lastAlert = () => alerts.at(-1)
	const pressAlert = (text) => lastAlert()?.buttons?.find(b => b.text === text)?.onPress?.()

	/** The harness shows one thing at a time, so the screen is opened again after a sheet, on the tab it was on. */
	let view
	const openTab = async index => {
		view = await s.mountSettings()
		findNode(view.tree, n => n.type === 'Design.SegmentedControl')?.props.state.setActiveIndex(index)
		await view.settle()
		return view
	}
	await openTab(0)
	check('the screen opens on Compose and says what the plugin does', textOf(view.tree).includes('like Discohook') && !!row(view, 'No webhooks yet'))

	// Adding a webhook from its address, which is on the clipboard.
	await openTab(1)
	clipboard = URL
	row(view, 'Paste a webhook address').props.onPress()
	await sleep(5)
	let prompt = await sheet('WebhookBuilderPrompt')
	check('adding a webhook takes the address from the clipboard', input(prompt, 'Webhook address')?.props.value === URL)
	press(prompt, 'Add')
	await sleep(10)
	check('the webhook is checked with Discord and saved with its name', saved().webhooks.length === 1 && saved().webhooks[0].label === 'Announcer' && saved().webhooks[0].channelId === '222222222222222222', saved().webhooks)
	check('and picked to send with', saved().target.webhookIds[0] === ID)
	await openTab(1)
	check('the list shows it with where it posts', textOf(view.tree).includes('#general · Test Server'))

	// A wrong address is refused in the sheet.
	clipboard = ''
	row(view, 'Paste a webhook address').props.onPress()
	prompt = await sheet('WebhookBuilderPrompt')
	input(prompt, 'Webhook address').props.onChange('https://example.com/nope')
	await prompt.settle()
	press(prompt, 'Add')
	await sleep(10)
	await prompt.settle()
	check('an address that is not a webhook is refused with a reason', JSON.stringify(prompt.tree).includes('not a webhook address'))
	await openTab(1)

	// Finding the webhooks of the server: bot-owned and followed ones are left out.
	row(view, 'Find the webhooks of this server').props.onPress()
	await sleep(10)
	check('finding the server\'s webhooks adds the ones with a key', saved().webhooks.length === 2 && saved().webhooks[1].label === 'Logs' && http.includes('/guilds/333333333333333333/webhooks'), saved().webhooks.map(w => w.label))

	// Making a webhook in the open channel.
	await openTab(1)
	row(view, 'Make a webhook in this channel').props.onPress()
	prompt = await sheet('WebhookBuilderPrompt')
	press(prompt, 'Make it')
	await sleep(10)
	check('a webhook can be made in the open channel', saved().webhooks.length === 3 && http.includes('/channels/222222222222222222/webhooks'))

	// Compose a message.
	await openTab(0)
	await type(view, 'Text', 'Hello')
	await type(view, 'Name', 'News Bot')
	check('what is typed is saved a moment later', saved().draft.content === 'Hello' && saved().draft.username === 'News Bot')
	row(view, 'Add an embed').props.onPress()
	await view.settle()
	check('adding an embed opens its editor', !!input(view, 'Title') && !!input(view, 'Description'))
	await type(view, 'Title', 'Big news')
	await type(view, 'Title link', 'https://example.com')
	await type(view, 'Picture', 'https://example.com/1.png')
	findNode(view.tree, n => n.type === 'Pressable' && n.props.accessibilityLabel === 'Blurple').props.onPress()
	press(view, 'Add field')
	await view.settle()
	await type(view, 'Field 1 name', 'Where')
	await type(view, 'Field 1 value', 'Here')
	press(view, 'Add a gallery picture')
	await view.settle()
	await type(view, 'Gallery picture 2', 'https://example.com/2.png')
	const embed = saved().draft.embeds[0]
	check('the embed keeps its title, link, colour, field and gallery', embed.title === 'Big news' && embed.color === '#5865f2' && embed.fields[0].name === 'Where' && embed.gallery[0] === 'https://example.com/2.png', embed)
	check('the editor shows a preview of the embed', textOf(view.tree).includes('Big news') || JSON.stringify(view.tree).includes('Big news'))
	// Typing and going back at once keeps what was typed.
	input(view, 'Description').props.onChange('Typed just before going back')
	press(view, '← Back to the message')
	await view.settle()
	check('what was typed just before going back is kept', saved().draft.embeds[0].description === 'Typed just before going back', saved().draft.embeds[0].description)

	// A link button.
	press(view, 'Add a row of buttons')
	await view.settle()
	await type(view, 'Row 1, button 1: label', 'Open')
	await type(view, 'Link', 'https://example.com/open')

	// Only the first webhook sends.
	for (const id of ['444444444444444444', '666666666666666666']) {
		const toggle = findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === saved().webhooks.find(w => w.id === id).label)
		toggle?.props.onValueChange(false)
	}
	await view.settle()

	// Typing and sending at once sends what was typed.
	input(view, 'Text').props.onChange('Hello {random:there} on {date}')
	press(view, 'Send')
	check('it asks before sending', lastAlert()?.title === 'Send this message?')
	requests.length = 0
	pressAlert('Send')
	await sleep(20)
	await view.settle()
	const post = requests.find(r => r.method === 'POST')
	check('sending posts to the webhook and waits for the message', !!post && post.url.includes(`/webhooks/${ID}/${TOKEN}?wait=true`) && post.url.includes('with_components=true'), post?.url)
	check('the words in braces are filled in', /^Hello there on \d{4}-\d{2}-\d{2}$/.test(post?.body.content), post?.body.content)
	check('the name and the embed go as Discord takes them', post?.body.username === 'News Bot' && post.body.embeds[0].title === 'Big news' && post.body.embeds[0].color === 0x5865f2 && post.body.embeds[0].fields[0].inline === false, post?.body)
	check('the gallery picture is a second embed with the same link', post?.body.embeds.length === 2 && post.body.embeds[1].url === 'https://example.com' && post.body.embeds[1].image.url === 'https://example.com/2.png')
	check('the button is a link button', post?.body.components[0].components[0].style === 5 && post.body.components[0].components[0].url === 'https://example.com/open')
	check('the sent message is remembered', saved().sent.length === 1 && saved().sent[0].preview.startsWith('Hello'))
	check('and a toast says it was sent', s.toasts().includes('Sent with Announcer'), s.toasts())

	// A message Discord would refuse is stopped with the reasons.
	await type(view, 'Name', 'Discord Staff')
	press(view, 'Send')
	check('a name with "discord" in it is stopped before sending', lastAlert()?.title === 'Discord would refuse this message' && lastAlert().body.includes('discord'), lastAlert())
	await type(view, 'Name', 'News Bot')

	// Save, paste, copy.
	await openTab(0)
	press(view, 'Save')
	prompt = await sheet('WebhookBuilderPrompt')
	input(prompt, 'Name').props.onChange('Weekly news')
	await prompt.settle()
	press(prompt, 'Save')
	await sleep(5)
	check('a message can be saved under a name', saved().saved.length === 1 && saved().saved[0].name === 'Weekly news')
	await openTab(0)
	press(view, 'Copy JSON')
	const json = JSON.parse(clipboard)
	check('its JSON is in the shape Discohook shares messages in', json.messages[0].data.embeds[0].title === 'Big news')

	clipboard = JSON.stringify({ messages: [{ data: { content: 'From Discohook', embeds: [{ title: 'DH', color: 16711680, fields: [{ name: 'a', value: 'b', inline: true }] }] } }] })
	press(view, 'Paste JSON')
	prompt = await sheet('WebhookBuilderPrompt')
	press(prompt, 'Use it')
	await sleep(5)
	check('a message from Discohook can be pasted in', saved().draft.content === 'From Discohook' && saved().draft.embeds[0].color === '#ff0000' && saved().draft.embeds[0].fields[0].inline === true, saved().draft)

	await openTab(0)
	clipboard = JSON.stringify({ backups: [{ name: 'One', messages: [{ data: { content: '1' } }] }, { name: 'Two', messages: [{ data: { content: '2' } }] }] })
	press(view, 'Paste JSON')
	prompt = await sheet('WebhookBuilderPrompt')
	press(prompt, 'Use it')
	await sleep(5)
	check('a Discohook backup with several messages goes into Saved', saved().saved.length === 3 && saved().saved.some(x => x.name === 'Two'))

	// Change the sent message from the Library.
	await openTab(2)
	check('the library lists scheduled, saved and sent messages', textOf(view.tree).includes('Saved (3)') && textOf(view.tree).includes('Sent (1)'))
	findNode(view.tree, n => n.props?.label?.startsWith?.('Hello there')).props.onPress()
	let actions = await sheet('WebhookBuilderActions')
	row(actions, 'Change it').props.onPress()
	await sleep(20)
	await openTab(0)
	check('changing a sent message loads it as it is now and goes to Compose', saved().target.editing === saved().sent[0].id && saved().draft.content.startsWith('Hello there') && !!button(view, 'Save changes'))
	await type(view, 'Text', 'Changed text')
	requests.length = 0
	press(view, 'Save changes')
	await sleep(20)
	const patch = requests.find(r => r.method === 'PATCH')
	check('saving changes edits the message, without a name or a poll', patch?.body.content === 'Changed text' && !('username' in patch.body) && !('poll' in patch.body) && Array.isArray(patch.body.embeds), patch?.body)
	press(view, 'Make a new message instead')
	await view.settle()
	check('editing can be stopped', saved().target.editing === '' && !!button(view, 'Send'))

	// Schedule.
	press(view, 'Send later')
	prompt = await sheet('WebhookBuilderPrompt')
	input(prompt, 'When').props.onChange('in 2h')
	await prompt.settle()
	press(prompt, 'Next: how often')
	await sleep(400)
	actions = await s.mountSheet('WebhookBuilderActions')
	row(actions, 'Every day').props.onPress()
	await sleep(5)
	const item = saved().scheduled[0]
	check('a message can be scheduled to repeat', saved().scheduled.length === 1 && item.repeat === 'daily' && Math.abs(item.at - (Date.now() + 2 * 3600_000)) < 60_000, item)

	// A message due in a second is sent by the next look, which comes every 15 seconds.
	await openTab(0)
	press(view, 'Send later')
	prompt = await sheet('WebhookBuilderPrompt')
	input(prompt, 'When').props.onChange('in 1s')
	await prompt.settle()
	press(prompt, 'Next: how often')
	await sleep(400)
	actions = await s.mountSheet('WebhookBuilderActions')
	row(actions, 'Once').props.onPress()
	await sleep(5)
	requests.length = 0
	const deadline = Date.now() + 17_000
	while (saved().scheduled.length > 1 && Date.now() < deadline) await sleep(250)
	await sleep(50)
	check('a scheduled message is sent when it is due, then taken off the schedule', saved().scheduled.length === 1 && requests.some(r => r.method === 'POST'), saved().scheduled)
	check('a toast says a scheduled message was sent', s.toasts().includes('Sent a scheduled message'), s.toasts())

	// Hold a message in chat.
	function MessageMenu() {
		return React.createElement('Design.ActionSheet', {}, [
			React.createElement('ActionSheetRow.Group', { hasIcons: true, key: 0 }, [React.createElement('ActionSheetRow', { label: 'Reply', onPress() {}, key: 'r' })]),
		])
	}
	const record = { id: '777777777777777777', channel_id: '222222222222222222', content: 'From chat', embeds: [] }
	sheets.openLazy(Promise.resolve({ default: MessageMenu }), 'MessageLongPressActionSheet', { message: record, channel: { id: '222222222222222222', guild_id: '333333333333333333' } })
	const call = s.opened('MessageLongPressActionSheet').at(-1)
	const Menu = (await call.args[0]).default
	const menu = await s.mountRender(() => React.createElement(Menu, { message: record, channel: { id: '222222222222222222', guild_id: '333333333333333333' } }))
	const menuRow = findNode(menu.tree, n => n.props?.label === 'Webhook Builder')
	check('holding a message gives "Webhook Builder" in its menu', !!menuRow)
	menuRow.props.onPress()
	actions = await sheet('WebhookBuilderActions')
	check('a message someone else sent cannot be changed or deleted from there', !row(actions, 'Delete it with the webhook') && !!row(actions, 'Copy into the editor'))
	row(actions, 'Copy into the editor').props.onPress()
	await sleep(20)
	check('copying it reads it from Discord and keeps only the embeds that were sent', saved().draft.content === 'From chat' && saved().draft.embeds.length === 1 && saved().draft.embeds[0].title === 'Chat embed', saved().draft)

	const ownRecord = { id: [...messages.keys()][0], channel_id: '222222222222222222', webhookId: ID, content: 'Changed text' }
	const own = await s.mountRender(() => React.createElement(Menu, { message: ownRecord, channel: { id: '222222222222222222', guild_id: '333333333333333333' } }))
	findNode(own.tree, n => n.props?.label === 'Webhook Builder').props.onPress()
	actions = await sheet('WebhookBuilderActions')
	check('a message your webhook sent can be changed or deleted from there', !!row(actions, 'Change it (sent by Announcer)') && !!row(actions, 'Delete it with the webhook'))
	row(actions, 'Delete it with the webhook').props.onPress()
	await sleep(5)
	requests.length = 0
	pressAlert('Delete')
	await sleep(20)
	check('deleting it asks the webhook to delete the message', requests.some(r => r.method === 'DELETE' && r.url.includes(`/messages/${ownRecord.id}`)))

	// The webhook's own screen.
	await openTab(1)
	row(view, 'Announcer').props.onPress()
	await view.settle()
	row(view, 'Copy its address').props.onPress()
	check('a webhook\'s address can be copied', clipboard === URL)
	row(view, 'Forget it').props.onPress()
	pressAlert('Forget')
	await view.settle()
	check('a webhook can be forgotten, which also takes it off the schedule', !saved().webhooks.some(w => w.id === ID) && saved().scheduled.length === 0 && !!row(view, 'Paste a webhook address'))

	// The report never holds a webhook's key.
	await openTab(3)
	check('the options are there', !!findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === 'Ask before sending'))
	press(view, 'Copy logs')
	check('the copied logs hold no webhook key', clipboard.includes('Webhook Builder') && !clipboard.includes('secondtoken') && !clipboard.includes(TOKEN), clipboard.slice(0, 300))

	s.stop()
	const plain = Promise.resolve({ default: MessageMenu })
	sheets.openLazy(plain, 'MessageLongPressActionSheet', { message: record })
	check('after stopping, the message menu is Discord\'s', s.opened('MessageLongPressActionSheet').at(-1).args[0] === plain)

	done()
})()
