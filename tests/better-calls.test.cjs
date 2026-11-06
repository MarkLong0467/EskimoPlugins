'use strict'

/** Tests for Better Calls. Run with: node tests/better-calls.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, button, hasCredits, findNode, findNodes, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Better Calls')

const MEMO = Symbol.for('react.memo')
const SECRET_DEVICE = 'Mark’s secret earbuds'

/** The audio devices of the fake phone. Tests change the list to unplug one. */
const makeDevices = () => [
	{ deviceName: 'Phone speaker', deviceId: 1, simpleDeviceType: 'SPEAKERPHONE', deviceType: 2 },
	{ deviceName: SECRET_DEVICE, deviceId: 2, simpleDeviceType: 'BLUETOOTH_HEADSET', deviceType: 8 },
	{ deviceName: 'Earpiece', deviceId: 3, simpleDeviceType: 'EARPIECE', deviceType: 1 },
]

/** A fake Discord with calls, the DM header, the voice panel and audio. */
function fake({ withAudio = true } = {}) {
	const rings = []
	const setDevice = []
	const wrongSetDevice = []
	const devices = makeDevices()
	const callModule = { call() {}, ring: id => rings.push(id), stopRinging() {} }
	const originalRing = callModule.ring

	function PrivateChannelButtons(props) {
		// Discord draws a single button, not a row, for the changelog.
		if (props.channelId === 'changelog') return { type: 'ChangelogButton', props: {} }
		return { type: 'View', props: { children: [{ type: 'CallButton', props: {} }, { type: 'VideoButton', props: {} }, { type: 'SearchButton', props: {} }] } }
	}
	const header = { $$typeof: MEMO, type: PrivateChannelButtons }
	const originalHeader = header.type

	function VoicePanelHeaderSpeaker() {
		return { type: 'OwnSpeaker', props: {} }
	}
	const speaker = { $$typeof: MEMO, type: VoicePanelHeaderSpeaker }
	const originalSpeaker = speaker.type

	const stores = {
		ChannelStore: {
			getChannel: id =>
				({
					dm1: { isPrivate: () => true, getRecipientId: () => 'u1' },
					dm2: { isPrivate: () => true, getRecipientId: () => 'u2' },
					group: { isPrivate: () => true, getRecipientId: () => undefined },
					bot: { isPrivate: () => true, getRecipientId: () => 'bot1' },
					server: { isPrivate: () => false },
				})[id],
		},
		UserStore: { getUser: id => (id === 'bot1' ? { bot: true } : { bot: false }) },
		VoiceStateStore: { isInChannel: id => id === 'incall' },
	}
	stores.ChannelStore.getChannel = (original => id => (id === 'incall' || id === 'changelog' ? { isPrivate: () => true, getRecipientId: () => 'u3' } : original(id)))(stores.ChannelStore.getChannel)

	const before = runtime => {
		const { loadModule } = runtime.valenced.modules.finders
		loadModule(callModule)
		loadModule({ default: header })
		loadModule({ default: speaker })
		if (withAudio) {
			// A store with a method of the same name comes first, and must not be taken for the action.
			loadModule({ setAudioOutputDevice: () => wrongSetDevice.push(1), getName: () => 'MediaEngineStore' })
			loadModule({ default: { getAudioDevices: () => devices } })
			loadModule({ setAudioOutputDevice: device => setDevice.push(device) })
			loadModule({
				audioDeviceToIconMap: { EARPIECE: 11, BLUETOOTH_HEADSET: 12, WIRED_HEADSET: 13, SPEAKERPHONE: 14, INVALID: 15 },
				getAudioDeviceToDisplayText: device => `kind ${device.deviceType}`,
			})
		}
	}
	const overrides = { utils: { discord: { lookupGeneratedIconComponent: name => Object.assign(function Icon() { return null }, { iconName: name }) } } }
	return { rings, setDevice, wrongSetDevice, devices, callModule, originalRing, header, originalHeader, speaker, originalSpeaker, stores, before, overrides }
}

const start = (f, options = {}) => startPort('better-calls', { stores: f.stores, overrides: f.overrides, before: f.before, ...options })

/** Draws the DM header like Discord does, inside a component. */
const drawHeader = (s, f, channelId = 'dm1') => s.mountRender(() => f.header.type({ channelId }))
const toggleOf = view => findNode(view.tree, n => n.type === 'Design.IconButton' && n.props.accessibilityLabel === 'Silent call')
const switchOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableSwitchRow' && n.props.label === label)
const rowOf = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)

;(async () => {
	// --- The silent call button
	{
		const f = fake()
		const s = await start(f)
		check('ring and the header are patched', f.callModule.ring !== f.originalRing && f.header.type !== f.originalHeader)

		const view = await drawHeader(s, f)
		const toggle = toggleOf(view)
		check('a DM header gets the silent call button', !!toggle)
		const children = findNodes(view.tree, n => ['CallButton', 'VideoButton', 'SearchButton'].includes(n.type)).map(n => n.type)
		check('the call, video and search buttons are all still there', children.join() === 'CallButton,VideoButton,SearchButton', children)
		const row = findNode(view.tree, n => n.type === 'View')
		check('and the new button comes first', row.props.children[0].type !== 'CallButton' && row.props.children.length === 4)
		check('it starts as "follow the global setting"', toggle.props.variant === 'tertiary' && toggle.props.icon.type.iconName === 'BellIcon', toggle.props)

		toggle.props.onPress()
		await view.settle()
		check('tapping it once makes the call silent', s.storage.cache.silentCall.users.dm1 === true, s.storage.cache.silentCall)
		check('and says so', s.toasts().at(-1) === 'Calling will now silently call this user', s.toasts())
		check('with the bell that has a Z, in the primary colour', toggleOf(view).props.variant === 'primary' && toggleOf(view).props.icon.type.iconName === 'BellZIcon')
		f.callModule.ring('dm1')
		check('a silent call does not ring', f.rings.length === 0, f.rings)

		toggleOf(view).props.onPress()
		await view.settle()
		check('tapping again makes the call ring', s.storage.cache.silentCall.users.dm1 === false)
		check('and says so', s.toasts().at(-1) === 'Calling will now ring this user')
		check('the button looks different', toggleOf(view).props.variant === 'secondary' && toggleOf(view).props.icon.type.iconName === 'PhoneCallIcon')
		f.callModule.ring('dm1')
		check('a call set to ring rings', f.rings.join() === 'dm1', f.rings)

		toggleOf(view).props.onPress()
		await view.settle()
		check('tapping a third time follows the global setting again', !('dm1' in s.storage.cache.silentCall.users), s.storage.cache.silentCall.users)
		check('and says so', s.toasts().at(-1) === 'Following the global setting for this user')
		check('the button is back as it was', toggleOf(view).props.variant === 'tertiary')
		f.callModule.ring('dm1')
		check('a call with no choice rings, because ringing is the default', f.rings.join() === 'dm1,dm1')
		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		view.unmount()
		s.stop()
	}

	// --- The choice is remembered
	{
		const f = fake()
		const s = await start(f, { saved: { silentCall: { users: { dm1: true } } } })
		const view = await drawHeader(s, f, 'dm1')
		check('a DM with a saved choice shows it', toggleOf(view).props.variant === 'primary')
		view.unmount()
		const other = await drawHeader(s, f, 'dm2')
		check('and another DM is not affected', toggleOf(other).props.variant === 'tertiary')
		other.unmount()
		s.stop()
	}

	// --- Where the button belongs
	{
		const f = fake()
		const s = await start(f)
		const group = await drawHeader(s, f, 'group')
		check('a group DM gets the button (you can call a group)', !!toggleOf(group))
		for (const [channel, why] of [['bot', 'a bot DM'], ['server', 'a server channel'], ['incall', 'a DM while you are in the call']]) {
			const view = await drawHeader(s, f, channel)
			check(`${why} does not`, !toggleOf(view))
			check(`and keeps Discord’s own buttons (${why})`, findNodes(view.tree, n => n.type === 'CallButton').length === 1)
			view.unmount()
		}
		const none = await s.mountRender(() => f.header.type({}))
		check('a header with no channel is left alone', !toggleOf(none))
		group.unmount()
		none.unmount()
		s.stop()
	}
	{
		const f = fake()
		const s = await start(f)
		const view = await drawHeader(s, f, 'changelog')
		check('a header that is a single button (the changelog) is left as it is', !toggleOf(view) && findNodes(view.tree, n => n.type === 'ChangelogButton').length === 1)
		view.unmount()
		s.stop()
	}

	// --- The global default
	{
		const f = fake()
		const s = await start(f, { saved: { silentCall: { default: true, users: { dm3: false } } } })
		f.callModule.ring('dm2')
		check('with "Ring by default" off, calls with no choice are silent', f.rings.length === 0, f.rings)
		f.callModule.ring('dm3')
		check('but a call set to ring still rings', f.rings.join() === 'dm3', f.rings)
		check('a call comes back with Discord’s own result', f.callModule.ring('dm9') === undefined)
		s.stop()
	}

	// --- Turning silent calls off and on
	{
		const f = fake()
		const s = await start(f)
		const view = await s.mountSettings()
		switchOf(view, 'Enable Silent Call').props.onValueChange(false)
		check('turning silent calls off takes the patches off', f.callModule.ring === f.originalRing && f.header.type === f.originalHeader, [f.callModule.ring === f.originalRing, f.header.type === f.originalHeader])
		const header = await drawHeader(s, f)
		check('and the header has no button', !toggleOf(header))
		header.unmount()
		switchOf(view, 'Enable Silent Call').props.onValueChange(true)
		await sleep(10)
		check('turning them on puts the patches back', f.callModule.ring !== f.originalRing && f.header.type !== f.originalHeader)
		view.unmount()
		s.stop()
		check('after stopping Discord’s own functions are back', f.callModule.ring === f.originalRing && f.header.type === f.originalHeader && f.speaker.type === f.originalSpeaker)
	}

	// --- Remembering the audio output device
	{
		const f = fake()
		const s = await start(f)
		check('by default remembering the device is off, so the speaker button is not patched', f.speaker.type === f.originalSpeaker)
		const view = await s.mountSettings()
		switchOf(view, 'Remember audio output device').props.onValueChange(true)
		await sleep(10)
		check('turning it on patches the speaker button', f.speaker.type !== f.originalSpeaker)
		check('and picks the first device if none was saved', s.storage.cache.rememberOutputDevice.device.deviceId === 1, s.storage.cache.rememberOutputDevice)

		const out = await s.mountRender(() => f.speaker.type({ isConnectedToVoiceChannel: false }))
		check('outside a call Discord’s own speaker button is drawn', findNodes(out.tree, n => n.type === 'OwnSpeaker').length === 1)
		const call = await s.mountRender(() => f.speaker.type({ isConnectedToVoiceChannel: true }))
		const speaker = findNode(call.tree, n => n.type === 'Design.IconButton')
		check('in a call it is replaced with the device button', !!speaker && speaker.props.variant === 'primary-overlay' && speaker.props.icon === 14, speaker && speaker.props)
		check('and the remembered device is chosen', f.setDevice.length > 0 && f.setDevice.at(-1).deviceId === 1, f.setDevice)
		check('through the action, not through the store with the same method name', f.wrongSetDevice.length === 0)

		speaker.props.onPress()
		await sleep(5)
		const sheet = await s.mountSheet('marklong.better-calls.audio-output-devices')
		const sheetText = textOf(sheet.tree)
		check('tapping it opens the list of devices', sheetText.includes('Select Preferred Audio Output Device'))
		const radios = findNodes(sheet.tree, n => n.type === 'Design.TableRadioRow')
		check('with every device, its kind and its name', radios.length === 3 && radios[1].props.label === 'kind 8' && radios[1].props.subLabel === SECRET_DEVICE, radios.map(r => r.props.label))
		check('and an icon for each', radios.every(r => !!r.props.icon))
		check('and a hint about the dock, since it was opened from a call', sheetText.includes('swipe up the dock'))
		const group = findNode(sheet.tree, n => n.type === 'Design.TableRadioGroup')
		check('the saved device is selected', group.props.defaultValue === '1')
		group.props.onChange('2')
		check('choosing a device saves it', s.storage.cache.rememberOutputDevice.device.deviceId === 2 && s.storage.cache.rememberOutputDevice.enabled === true, s.storage.cache.rememberOutputDevice)
		check('and switches to it now', f.setDevice.at(-1).deviceId === 2)
		const again = await s.mountRender(() => f.speaker.type({ isConnectedToVoiceChannel: true }))
		check('the next draw in a call uses the new device and its icon', f.setDevice.at(-1).deviceId === 2 && findNode(again.tree, n => n.type === 'Design.IconButton').props.icon === 12)

		// Unplugging the device falls back to the first.
		f.devices.splice(1, 1)
		switchOf(view, 'Remember audio output device').props.onValueChange(true)
		check('if the saved device is unplugged the first device is used', s.storage.cache.rememberOutputDevice.device.deviceId === 1, s.storage.cache.rememberOutputDevice.device)

		check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
		out.unmount()
		call.unmount()
		again.unmount()
		sheet.unmount()
		view.unmount()
		s.stop()
		check('after stopping the speaker button is Discord’s own again', f.speaker.type === f.originalSpeaker)
	}
	{
		const f = fake({ withAudio: false })
		const s = await start(f, { saved: { rememberOutputDevice: { enabled: true } } })
		const call = await s.mountRender(() => f.speaker.type({ isConnectedToVoiceChannel: true }))
		check('with no devices known Discord’s own speaker button stays', findNodes(call.tree, n => n.type === 'OwnSpeaker').length === 1 && s.errors.length === 0)
		call.unmount()
		s.stop()
	}

	// --- The settings screen
	{
		const f = fake()
		const s = await start(f, { saved: { silentCall: { users: { dm1: true, dm2: false } }, rememberOutputDevice: { enabled: true, device: makeDevices()[1] } } })
		let view = await s.mountSettings()
		const text = textOf(view.tree)
		check('it has both groups', text.includes('Silent Call') && text.includes('Remember Audio Output Device'))
		check('it has the three silent call rows', !!switchOf(view, 'Enable Silent Call') && !!switchOf(view, 'Ring by default') && !!rowOf(view, 'Reset preferences'))
		check('"Ring by default" is on while calls are not silent by default', switchOf(view, 'Ring by default').props.value === true)
		switchOf(view, 'Ring by default').props.onValueChange(false)
		check('turning it off makes calls silent by default', s.storage.cache.silentCall.default === true)
		check('without losing the saved choices', s.storage.cache.silentCall.users.dm1 === true && s.storage.cache.silentCall.users.dm2 === false, s.storage.cache.silentCall.users)
		check('the reset row says how many choices are saved', textOf(view.tree).includes('2 saved'))
		const device = rowOf(view, 'Current device')
		check('the current device row names the device and its kind', device.props.subLabel === `${SECRET_DEVICE} - kind 8` && device.props.disabled === false, device.props)
		check('it has the debugging section and no credits', text.includes('DEBUGGING') && !!button(view, 'Copy logs') && !hasCredits(text), text.slice(-300))

		rowOf(view, 'Reset preferences').props.onPress()
		check('Reset preferences removes every choice', Object.keys(s.storage.cache.silentCall.users).length === 0, s.storage.cache.silentCall.users)
		check('and says so', s.toasts().at(-1) === 'Silent call preferences have been reset')
		check('the default stays as it was set', s.storage.cache.silentCall.default === true)

		device.props.onPress()
		await sleep(5)
		check('the device row opens the list of devices', s.opened('marklong.better-calls.audio-output-devices').length === 1)
		const sheet = await s.mountSheet('marklong.better-calls.audio-output-devices')
		check('without the call hint when opened from the settings', !textOf(sheet.tree).includes('swipe up the dock'))
		sheet.unmount()
		view = await s.mountSettings()

		button(view, 'Run self-check').props.onPress()
		await view.settle()
		const checks = textOf(view.tree)
		check('the self-check finds the ring, the audio parts and the device list', checks.includes('Discord’s ring was patched') && checks.includes('The phone’s audio device list was found') && checks.includes('The audio output action was found') && checks.includes('The icons and names of devices were found'), checks.slice(-900))

		button(view, 'Copy logs').props.onPress()
		await sleep(5)
		const report = s.copied.at(-1) || ''
		check('Copy logs names the plugin and credits PalmDevs and the porter', report.includes('marklong.better-calls 1.0.0') && report.includes('Original plugin by PalmDevs') && report.includes('Ported to Valenced by MarkLong0467'))
		check('the report does not credit kmmiio99o', !report.includes('kmmiio99o'))
		check('the report has the counts and the kinds of device', /Calls without ringing: \d+, calls that rang: \d+/.test(report) && /Devices on the phone now: SPEAKERPHONE, BLUETOOTH_HEADSET, EARPIECE/.test(report), report.split('\n').slice(6, 24))
		check('the report holds no device names', !report.includes(SECRET_DEVICE) && !report.includes('Phone speaker'))
		view.unmount()
		s.stop()
		check('the plugin reported no errors', s.errors.length === 0, s.errors)
	}

	// --- Pieces that are missing
	{
		const f = fake({ withAudio: false })
		const s = await start(f)
		const view = await s.mountSettings()
		const device = rowOf(view, 'Current device')
		check('without audio parts the device row says there is no device', device.props.subLabel === 'No device' && device.props.disabled === true)
		button(view, 'Run self-check').props.onPress()
		await view.settle()
		check('and the self-check lists what is missing', textOf(view.tree).includes('The phone’s audio device list was found'))
		view.unmount()
		s.stop()
	}

	done()
})()
