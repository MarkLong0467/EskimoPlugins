(function (exports) {
	/* Avatar Lab (native test): shows what the native part found inside Discord's Android code. Changes nothing. */
	const VERSION = '0.2.0'
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
	async function ask() {
		const call = nativeCall()
		if (!call) { text = 'The JavaScript side cannot reach the native bridge (no callNativeMethod found).'; redraw(); return }
		try { text = String(await call('marklong.avatar-lab.report', [])) } catch (e) { text = `Could not ask the native part: ${(e && e.message) || e}` }
		redraw()
	}
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
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Tap "Ask the native part", wait a few seconds, then "Copy report" and paste it in the chat.'),
				h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Ask the native part', variant: 'primary', size: 'sm', onPress: ask })),
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: () => { try { valenced.externals.ReactNativeClipboard.Clipboard.setString(`Avatar Lab ${VERSION}\n${text}`); toast('Copied') } catch (e) { toast('Could not copy') } } }))),
				h(Design.Text, { variant: 'text-xs/normal', selectable: true }, text.slice(0, 2500))))
	}
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({ SettingsComponent: Screen, start(api) { api.cleanup(() => { listeners = [] }); ask() } })
	return exports
})({})
