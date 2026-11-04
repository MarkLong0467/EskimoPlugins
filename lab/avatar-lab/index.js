(function (exports) {
	/* Avatar Fix test (native). One button. Keeps the animated pictures in the chat playing. */
	const VERSION = '0.5.2'
	let text = 'Tap the button, then open a chat with animated avatars.'
	let listeners = []
	const redraw = () => listeners.forEach((fn) => { try { fn() } catch (e) {} })
	const toast = (t) => { try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_AVATAR_LAB', { text: String(t) }) } catch (e) {} }
	function nativeCall() {
		const n = valenced.modules && valenced.modules.native
		if (n && typeof n.callNativeMethod === 'function') return n.callNativeMethod
		if (valenced.native && typeof valenced.native.callNativeMethod === 'function') return valenced.native.callNativeMethod
		return null
	}
	async function call(name) {
		const fn = nativeCall()
		if (!fn) throw new Error('no native bridge')
		return String(await fn(`marklong.avatar-lab.${name}`, []))
	}
	async function go() {
		try { await call('go'); toast('Running. Open a chat and scroll it.'); await refresh() } catch (e) { text = `Could not start: ${(e && e.message) || e}`; redraw() }
	}
	async function refresh() {
		try { text = await call('report') } catch (e) { text = `Could not read the report: ${(e && e.message) || e}` }
		redraw()
	}
	async function stop() { try { await call('stop'); toast('Stopped'); await refresh() } catch (e) {} }
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
				h(Design.Text, { variant: 'heading-lg/bold' }, `Avatar Fix test ${VERSION}`),
				h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, '1. Tap "Start". 2. Open a chat with animated avatars and scroll it for 10 seconds. 3. Tap "Refresh and copy report" and paste it here.'),
				h(Design.Button, { text: 'Start', variant: 'primary', size: 'md', onPress: go }),
				h(Design.Button, { text: 'Refresh and copy report', variant: 'secondary', size: 'md', onPress: async () => { await refresh(); try { valenced.externals.ReactNativeClipboard.Clipboard.setString(`Avatar Fix test ${VERSION}\n${text}`); toast('Copied') } catch (e) { toast('Could not copy') } } }),
				h(Design.Button, { text: 'Stop', variant: 'tertiary', size: 'sm', onPress: stop }),
				h(Design.Text, { variant: 'text-xs/normal', selectable: true }, text.slice(0, 1800))))
	}
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({ SettingsComponent: Screen, start(api) { api.cleanup(() => { listeners = [] }) } })
	return exports
})({})
