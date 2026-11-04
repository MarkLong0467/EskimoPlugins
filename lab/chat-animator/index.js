(function (exports) {
	/*
	 * Chat Animator for Valenced
	 *
	 * The work is done by the native part (a Kotlin plugin inside Discord): it keeps the animated profile pictures and
	 * decorations in the chat playing. This file is only the settings screen. Keep `(function` as the first thing in this file.
	 */
	const VERSION = '1.1.0'
	let info = {}
	let listeners = []
	const redraw = () => listeners.forEach((fn) => { try { fn() } catch (e) {} })
	const toast = (t) => { try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_CHAT_ANIMATOR', { text: String(t) }) } catch (e) {} }
	function nativeCall() {
		const n = valenced.modules && valenced.modules.native
		if (n && typeof n.callNativeMethod === 'function') return n.callNativeMethod
		if (valenced.native && typeof valenced.native.callNativeMethod === 'function') return valenced.native.callNativeMethod
		return null
	}
	const parse = (text) => { const out = {}; String(text).split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i)] = p.slice(i + 1) }); return out }
	async function call(name, args) {
		const fn = nativeCall()
		if (!fn) throw new Error('The native part is not reachable. Restart Discord.')
		return parse(await fn(`marklong.chat-animator.${name}`, args || []))
	}
	async function refresh() {
		try { info = await call('state'); info.error_ui = '' } catch (e) { info = { error_ui: String((e && e.message) || e) } }
		redraw()
	}
	async function set(key, value) {
		try { info = await call('set', [key, String(value)]) } catch (e) { toast(`Could not change: ${(e && e.message) || e}`) }
		redraw()
	}
	function reportText() {
		const lines = [`Chat Animator report ${VERSION}`]
		Object.keys(info).forEach((k) => lines.push(`${k}: ${info[k]}`))
		return lines.join('\n')
	}

	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}

	function Screen() {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [, tick] = React.useState(0)
		React.useEffect(() => {
			const fn = () => tick((n) => n + 1)
			listeners.push(fn)
			refresh()
			const timer = setInterval(refresh, 2500)
			return () => { clearInterval(timer); listeners = listeners.filter((l) => l !== fn) }
		}, [])
		const enabled = info.enabled !== 'false'
		const saver = Number(info.intervalMs || 400) >= 1000
		const running = info.running === 'true'
		const status = info.error_ui ? info.error_ui : !enabled ? 'Off' : running ? `On. Keeping ${info.animated || 0} animated pictures playing (restarted ${info.restarts || 0}x)` : 'Waiting to start (a few seconds after Discord opens)'
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(Design.Stack, { style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 20 },
				h(RN.View, { key: 'card', style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } },
					h(Design.Text, { variant: 'heading-lg/bold' }, `Chat Animator ${VERSION}`),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Keeps animated profile pictures and decorations (ears) playing in the chat. Open a chat and they should move.'),
					h(Design.Text, { variant: 'text-sm/semibold' }, status)),
				info.guardTripped === 'true' && h(RN.View, { key: 'guard', style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#3a2b1d' } },
					h(Design.Text, { variant: 'text-sm/semibold' }, 'It did not start by itself this time'),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'The last start did not finish before Discord closed, so it waited. Tap the button to start it now.'),
					h(Design.Button, { text: 'Start now', variant: 'primary', size: 'sm', onPress: () => set('start', true) })),
				h(Design.TableRowGroup, { title: 'Settings' },
					h(Design.TableSwitchRow, { key: 'enabled', label: 'Keep chat pictures animated', subLabel: 'Starts a few seconds after Discord opens', value: enabled, onValueChange: (v) => set('enabled', !!v) }),
					h(Design.TableSwitchRow, { key: 'saver', label: 'Battery saver', subLabel: 'Checks once a second instead of about twice a second. A picture may take a moment to start after you scroll', value: saver, onValueChange: (v) => set('intervalMs', v ? 1000 : 400) })),
				h(RN.View, { key: 'ears', style: { borderRadius: 14, padding: 14, gap: 8, backgroundColor: '#2b2d31' } },
					h(Design.Text, { variant: 'text-sm/semibold' }, 'Ears (avatar decorations) - experiment'),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'The chat asks for the still version of ears. Try the modes below one at a time. After picking one, leave the chat and open it again (or switch channels), then look at the ears. Tell me which mode makes them move.'),
					...[['0', 'Mode 0: off'], ['1', 'Mode 1: ask for the animated file'], ['2', 'Mode 2: animated file as webp'], ['3', 'Mode 3: .webp with animated=true']].map(([m, label]) =>
						h(Design.Button, { key: m, text: `${String(info.earMode || '0') === m ? '(selected) ' : ''}${label}`, variant: String(info.earMode || '0') === m ? 'primary' : 'secondary', size: 'sm', onPress: () => { set('earMode', m); toast('Open the chat again') } }))),
				h(Design.TableRowGroup, { title: 'Details' },
					info.earsSeen ? h(Design.TableRow, { key: 'e1', label: 'Ear addresses the chat gets', subLabel: info.earsSeen }) : null,
					info.earsOut ? h(Design.TableRow, { key: 'e2', label: 'Ear addresses after the mode', subLabel: info.earsOut }) : null,
					h(Design.TableRow, { key: 'a', label: 'Chat messages seen', subLabel: String(info.binds || 0) }),
					h(Design.TableRow, { key: 'b', label: 'Messages on screen now', subLabel: String(info.attached || 0) }),
					h(Design.TableRow, { key: 'c', label: 'Hook', subLabel: info.hook || 'not started' }),
					info.error ? h(Design.TableRow, { key: 'd', label: 'Last problem', subLabel: info.error }) : null),
				h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: () => { try { valenced.externals.ReactNativeClipboard.Clipboard.setString(reportText()); toast('Report copied') } catch (e) { toast('Could not copy') } } }),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({ SettingsComponent: Screen, start(api) { api.cleanup(() => { listeners = [] }) } })
	return exports
})({})
