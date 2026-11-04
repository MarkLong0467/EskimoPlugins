(function (exports) {
	/* Avatar Lab (native test): shows what the native part found inside Discord's Android code. Changes nothing. */
	const VERSION = '0.4.0'
	let text = 'Not asked yet.'
	let listeners = []
	const redraw = () => listeners.forEach((fn) => { try { fn() } catch (e) {} })
	const toast = (t) => { try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_AVATAR_LAB', { text: String(t) }) } catch (e) {} }
	function nativeCall() {
		const n = valenced.modules && valenced.modules.native
		if (n && typeof n.callNativeMethod === 'function') return n.callNativeMethod
		if (valenced.native && typeof valenced.native.callNativeMethod === 'function') return valenced.native.callNativeMethod
		return null
	}
	async function run(name, note) {
		const call = nativeCall()
		if (!call) { text = 'The JavaScript side cannot reach the native bridge (no callNativeMethod found).'; redraw(); return }
		try {
			if (name) { text = `${note}...`; redraw(); text = String(await call(`marklong.avatar-lab.${name}`, [])) + '\n\n' }
			text += String(await call('marklong.avatar-lab.report', []))
		} catch (e) { text = `Could not ask the native part: ${(e && e.message) || e}` }
		redraw()
	}
	const ask = () => run(null)
	function h(type, props, ...children) {
		const rt = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? rt.jsxs : rt.jsx)(type, rest, key)
	}
	function Screen() {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [, tick] = React.useState(0)
		React.useEffect(() => { const fn = () => tick((n) => n + 1); listeners.push(fn); return () => { listeners = listeners.filter((l) => l !== fn) } }, [])
		return h(RN.ScrollView, { style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(RN.View, { style: { padding: 14, gap: 10 } },
				h(Design.Text, { variant: 'heading-lg/bold' }, `Avatar Lab ${VERSION} (native test)`),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Nothing runs until you tap a button. Do A first, then B, scroll a chat with animated avatars, then Show report. Then C and look at the chat again. 1, 2 and 3 are the older scans. After each, tap "Copy report" and paste it in the chat.'),
				h(Design.Button, { text: '1. Scan class names (light)', variant: 'primary', size: 'sm', onPress: () => run('names', 'Scanning names') }),
				h(Design.Button, { text: '2. Scan row fields (heavy, may freeze for a while)', variant: 'secondary', size: 'sm', onPress: () => run('rows', 'Scanning row fields') }),
				h(Design.Button, { text: 'D. Find who reads the avatar fields (heavy)', variant: 'primary', size: 'sm', onPress: () => run('readers', 'Searching readers') }),
				h(Design.Button, { text: 'A. Inspect the chat avatar classes (light)', variant: 'primary', size: 'sm', onPress: () => run('inspect', 'Inspecting') }),
				h(Design.Button, { text: 'B. Watch animation start/stop calls', variant: 'primary', size: 'sm', onPress: () => run('watch', 'Starting to watch') }),
				h(Design.Button, { text: 'C. Block/unblock animation stops (toggle)', variant: 'secondary', size: 'sm', onPress: () => run('block', 'Toggling') }),
				h(Design.Button, { text: '3. Turn animation hooks on (until restart)', variant: 'secondary', size: 'sm', onPress: () => run('hooks', 'Turning hooks on') }),
				h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Show report', variant: 'secondary', size: 'sm', onPress: ask })),
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: () => { try { valenced.externals.ReactNativeClipboard.Clipboard.setString(`Avatar Lab ${VERSION}\n${text}`); toast('Copied') } catch (e) { toast('Could not copy') } } }))),
				h(Design.Text, { variant: 'text-xs/normal', selectable: true }, text.slice(0, 2500))))
	}
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({ SettingsComponent: Screen, start(api) { api.cleanup(() => { listeners = [] }) } })
	return exports
})({})
