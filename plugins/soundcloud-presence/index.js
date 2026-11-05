(function (exports) {
	/*
	 * SoundCloud Presence for Valenced. Shipped as written, there is no build step.
	 * It follows the bundle shape Valenced's own plugins use (`plugin({...})` and `valenced.*` globals)
	 * and sets your status the same way the Rich Presence plugin does (LOCAL_ACTIVITY_UPDATE).
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * Discord cannot see what another app is playing, so the track comes from a SoundCloud link:
	 * paste it, pick it from Recent, or copy it in SoundCloud (Share > Copy link) and let the plugin
	 * pick it up from the clipboard.
	 */
	var TAG = '[soundcloud-presence]'
	var SOCKET = 'EskimoSoundCloudPresence'
	var PID = 1338
	var TOAST = 'ESKIMO_SOUNDCLOUD_PRESENCE'
	var ORANGE = '#FF5500'
	var MAX_RECENTS = 8
	var LINK_RE = /https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s<>"')]+/i

	var TIMER_MODES = [
		{ v: 'progress', l: 'Progress bar', s: 'Counts up to the length of the track, then the status clears.' },
		{ v: 'elapsed', l: 'Time elapsed', s: 'Counts up from when you showed the track.' },
		{ v: 'none', l: 'No timer', s: 'Shows only the title and artist.' },
	]
	var STATUS_TEXTS = [
		{ v: 0, l: 'SoundCloud', s: 'Listening to SoundCloud' },
		{ v: 1, l: 'Artist name', s: 'Listening to the artist' },
		{ v: 2, l: 'Track title', s: 'Listening to the song' },
	]

	var defaults = {
		enabled: true,
		applyOnStart: true,
		clipboardOnOpen: false,
		clearAtEnd: true,
		showArtwork: true,
		showArtist: true,
		showButton: true,
		buttonLabel: 'Listen on SoundCloud',
		timerMode: 'progress',
		statusText: 0,
		current: null,
		recents: [],
	}

	// ---- State -------------------------------------------------------------------------------
	var active = false
	var storage
	var applySeq = 0
	var endTimer
	var lastClip = ''
	var status = { state: 'idle', text: '' }
	var statusListeners = []
	var assetCache = new Map()

	// ---- Helpers -----------------------------------------------------------------------------
	function toast(text) {
		try {
			valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text })
		} catch (e) {}
	}

	function merge(value) {
		var out = Object.assign({}, defaults, value || {})
		if (!Array.isArray(out.recents)) out.recents = []
		return out
	}

	function read() {
		return merge(storage && storage.cache)
	}

	function save(patch) {
		return Promise.resolve(storage.set(Object.assign({}, read(), patch), true))
	}

	function setStatus(next) {
		status = next
		statusListeners.forEach(function (listener) { listener() })
	}

	function pad(n) { return n < 10 ? '0' + n : '' + n }

	function fmt(ms) {
		var s = Math.max(0, Math.round(ms / 1000))
		var h = Math.floor(s / 3600)
		var m = Math.floor((s % 3600) / 60)
		return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60)
	}

	function decode(s) {
		return String(s == null ? '' : s)
			.replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
			.replace(/&amp;/g, '&')
	}

	/** Finds the first SoundCloud link in any text, including the text SoundCloud's Share button copies. */
	function parseLink(text) {
		var m = LINK_RE.exec(typeof text === 'string' ? text : '')
		return m ? m[0].replace(/[.,;!?]+$/, '') : null
	}

	function isoDuration(value) {
		var m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/i.exec(String(value || ''))
		if (!m) return 0
		return ((Number(m[1] || 0) * 60 + Number(m[2] || 0)) * 60 + Number(m[3] || 0)) * 1000
	}

	function meta(html, prop) {
		var re = new RegExp('<meta[^>]+(?:property|name)="' + prop + '"[^>]+content="([^"]*)"', 'i')
		var m = re.exec(html)
		return m ? decode(m[1]) : ''
	}

	// ---- SoundCloud lookup -------------------------------------------------------------------
	/**
	 * Reads a track or playlist link. The page gives the real link (short links redirect) and the length,
	 * SoundCloud's public oEmbed gives title, artist and artwork. Either one alone is enough to show it.
	 */
	async function lookup(link) {
		var html = ''
		var canonical = link
		try {
			var page = await fetch(link, { headers: { Accept: 'text/html' } })
			if (page.ok) {
				html = await page.text()
				if (page.url && /(^|\.)soundcloud\.com\//i.test(page.url)) canonical = page.url.split('?')[0]
				var c = /<link rel="canonical" href="([^"]+)"/i.exec(html)
				if (c) canonical = decode(c[1])
			}
		} catch (e) {}
		var data
		try {
			var res = await fetch('https://soundcloud.com/oembed?format=json&url=' + encodeURIComponent(canonical))
			if (res.ok) data = await res.json()
		} catch (e) {}

		var artist = (data && data.author_name) || ''
		var title = data && data.title ? String(data.title) : decode(meta(html, 'og:title'))
		if (artist && title.slice(-(artist.length + 4)) === ' by ' + artist) title = title.slice(0, -(artist.length + 4))
		if (!title) throw new Error('Could not read this SoundCloud link. Is the track public?')

		var kind = /\/sets\//.test(canonical) ? 'playlist' : 'track'
		var duration = 0
		if (kind === 'track') {
			var iso = /itemprop="duration"[^>]*content="([^"]+)"/i.exec(html)
			var full = /"full_duration":(\d+)/.exec(html)
			duration = full ? Number(full[1]) : iso ? isoDuration(iso[1]) : 0
		}
		return {
			url: canonical,
			kind: kind,
			title: title,
			artist: artist,
			artistUrl: (data && data.author_url) || '',
			artwork: (data && data.thumbnail_url) || meta(html, 'og:image'),
			duration: duration,
		}
	}

	// ---- Images ------------------------------------------------------------------------------
	/** Asks Discord to host an image link for use in a presence. Resolves to an mp: asset ID. */
	async function externalAsset(url) {
		var f = valenced.modules.finders
		var path = '/applications/0/external-assets'
		var body = { urls: [url] }
		var list
		var http = f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0] || f.lookupModule(f.filters.withProps('get', 'post', 'patch'))[0]
		if (http && typeof http.post === 'function') {
			try {
				var answer = await http.post({ url: path, body: body })
				list = answer && answer.body
			} catch (e) {
				if (e && (e.status != null || e.body != null)) throw e
			}
		}
		if (!list) {
			var auth = f.lookupModule(f.filters.withProps('getToken'))[0]
			var token = auth && auth.getToken && auth.getToken()
			if (!token) throw new Error('Could not find a way to reach Discord')
			var res = await fetch('https://discord.com/api/v9' + path, {
				method: 'POST',
				headers: { Authorization: token, 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			})
			if (!res.ok) throw new Error('Discord said no (' + res.status + ')')
			list = await res.json()
		}
		var link = list && list[0] && list[0].external_asset_path
		if (!link) throw new Error('Discord returned no image for this link')
		if (/^https:\/\/media\.discordapp\.net/.test(link)) link = link.split('/').slice(3).join('/')
		return 'mp:' + link
	}

	async function artworkAsset(url) {
		if (!url) return undefined
		var big = url.replace('-large.', '-t500x500.')
		if (assetCache.has(big)) return assetCache.get(big)
		try {
			var id = await externalAsset(big)
			assetCache.set(big, id)
			return id
		} catch (e) {
			console.warn(TAG + ' artwork not sent:', String((e && (e.body && e.body.message || e.message)) || e))
		}
	}

	// ---- The presence ------------------------------------------------------------------------
	function progressEnd(settings, track) {
		return settings.timerMode === 'progress' && track.duration > 0 ? track.startedAt + track.duration : 0
	}

	async function buildActivity(settings, track) {
		var activity = { application_id: '0', name: 'SoundCloud', type: 2, flags: 1, details: track.title.slice(0, 128) }
		var hasArtist = settings.showArtist && !!track.artist
		if (hasArtist) activity.state = track.artist.slice(0, 128)
		if (/^https?:\/\//i.test(track.url)) activity.details_url = track.url
		if (hasArtist && /^https?:\/\//i.test(track.artistUrl)) activity.state_url = track.artistUrl
		// 0 = the app name, 1 = the state line, 2 = the details line. Fall back to the name when the line is missing.
		var display = Number(settings.statusText) || 0
		if (display === 1 && !hasArtist) display = 0
		activity.status_display_type = display

		if (settings.timerMode === 'progress') {
			var end = progressEnd(settings, track)
			activity.timestamps = end ? { start: track.startedAt, end: end } : { start: track.startedAt }
		} else if (settings.timerMode === 'elapsed') {
			activity.timestamps = { start: track.startedAt }
		}

		if (settings.showArtwork && track.artwork) {
			var image = await artworkAsset(track.artwork)
			if (image) {
				activity.assets = { large_image: image, large_text: track.title.slice(0, 128) }
				if (/^https?:\/\//i.test(track.url)) activity.assets.large_url = track.url
			}
		}
		if (settings.showButton && /^https?:\/\//i.test(track.url)) {
			var label = String(settings.buttonLabel || '').trim() || 'Listen on SoundCloud'
			activity.buttons = [label.slice(0, 32)]
			activity.metadata = { button_urls: [track.url] }
		}
		return activity
	}

	function dispatchActivity(activity) {
		valenced.discord.common.flux.Dispatcher.dispatch({
			type: 'LOCAL_ACTIVITY_UPDATE',
			activity: activity,
			pid: PID,
			socketId: SOCKET,
		})
	}

	async function apply() {
		clearTimeout(endTimer)
		if (!active) return
		var seq = ++applySeq
		var settings = read()
		var track = settings.current
		try {
			if (!settings.enabled || !track) return dispatchActivity(null)
			var end = progressEnd(settings, track)
			if (settings.clearAtEnd && end && Date.now() >= end) {
				setStatus({ state: 'ended', text: 'That track has finished.' })
				return dispatchActivity(null)
			}
			var activity = await buildActivity(settings, track)
			if (seq !== applySeq || !active) return
			dispatchActivity(activity)
			setStatus({ state: 'ok', text: '' })
			if (settings.clearAtEnd && end) endTimer = setTimeout(function () { apply() }, Math.max(1000, end - Date.now() + 1500))
		} catch (error) {
			console.warn(TAG + ' apply failed:', String(error))
		}
	}

	/** Looks a link up, makes it the current track and puts it on your profile. */
	async function showTrack(link) {
		setStatus({ state: 'loading', text: 'Looking up the track…' })
		try {
			var track = await lookup(link)
			track.startedAt = Date.now()
			var settings = read()
			var seen = Object.assign({}, track, { startedAt: undefined })
			var recents = [seen].concat(settings.recents.filter(function (r) { return r.url !== track.url })).slice(0, MAX_RECENTS)
			await save({ current: track, recents: recents })
			await apply()
			if (!settings.enabled) toast('Saved. Turn on Show status to put it on your profile.')
			else toast('Now showing ' + track.title)
			return true
		} catch (error) {
			var message = String((error && error.message) || error)
			setStatus({ state: 'error', text: message })
			toast(message)
			return false
		}
	}

	async function stopShowing() {
		clearTimeout(endTimer)
		await save({ current: null })
		setStatus({ state: 'idle', text: '' })
		dispatchActivity(null)
	}

	async function checkClipboard(quiet) {
		try {
			var Clipboard = valenced.externals.ReactNativeClipboard.Clipboard
			var link = parseLink(await Clipboard.getString())
			if (!link) {
				if (!quiet) toast('There is no SoundCloud link in your clipboard')
				return false
			}
			if (quiet && (link === lastClip || (read().current && read().current.url === link))) return false
			lastClip = link
			return await showTrack(link)
		} catch (e) {
			console.warn(TAG + ' clipboard check failed:', String(e))
			return false
		}
	}

	// ---- Settings screen ---------------------------------------------------------------------
	function h(type, props) {
		var children = Array.prototype.slice.call(arguments, 2)
		var rt = valenced.react.ReactJSXRuntime
		var p = Object.assign({}, props)
		var key = p.key
		delete p.key
		if (children.length === 1) p.children = children[0]
		else if (children.length > 1) p.children = children
		return (children.length > 1 ? rt.jsxs : rt.jsx)(type, p, key)
	}

	function Field(props) {
		var React = valenced.react.React
		var state = React.useState(props.value == null ? '' : String(props.value))
		var value = state[0]
		var setValue = state[1]
		React.useEffect(
			function () {
				if (value === (props.value == null ? '' : String(props.value))) return
				var timer = setTimeout(function () { props.onCommit(value) }, 300)
				return function () { clearTimeout(timer) }
			},
			[value],
		)
		return h(valenced.discord.design.Design.TextInput, {
			label: props.label,
			description: props.description,
			placeholder: props.placeholder,
			size: 'md',
			maxLength: props.maxLength,
			value: value,
			onChange: setValue,
		})
	}

	var previewStyles

	function PreviewCard(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var Tokens = valenced.discord.common.tokens.Tokens
		var React = valenced.react.React
		if (!previewStyles)
			previewStyles = Design.createStyles({
				band: { backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH, paddingHorizontal: 16, paddingVertical: 12 },
				row: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
				accent: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginRight: 12, backgroundColor: ORANGE },
				art: { width: 64, height: 64, borderRadius: 8, marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGHEST },
				artImage: { width: 64, height: 64 },
				text: { flex: 1 },
				bar: { height: 4, borderRadius: 2, marginTop: 6, backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGHEST, overflow: 'hidden' },
				barFill: { width: '35%', height: 4, backgroundColor: ORANGE },
				button: { alignSelf: 'flex-start', marginTop: 10, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGHEST },
			})
		var st = previewStyles()
		var tick = React.useState(0)
		React.useEffect(function () {
			var listener = function () { tick[1](function (n) { return n + 1 }) }
			statusListeners.push(listener)
			return function () { statusListeners = statusListeners.filter(function (l) { return l !== listener }) }
		}, [])
		var s = props.settings
		var t = s.current
		function line(content, variant, color) {
			return content ? h(Design.Text, { variant: variant, color: color }, content) : null
		}
		var body
		if (!t) {
			body = h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted', style: { marginTop: 8 } }, 'Nothing is shown yet. Paste a SoundCloud link below to put a track on your profile.')
		} else {
			var side = s.statusText === 1 && s.showArtist && t.artist ? t.artist : s.statusText === 2 ? t.title : 'SoundCloud'
			body = h(
				RN.View,
				{ style: st.row },
				h(RN.View, { style: st.accent }),
				s.showArtwork
					? h(RN.View, { style: st.art }, t.artwork ? h(RN.Image, { source: { uri: t.artwork }, style: st.artImage }) : null)
					: null,
				h(
					RN.View,
					{ style: st.text },
					line('Listening to ' + side, 'text-xs/semibold', 'text-muted'),
					line(t.title, 'text-md/semibold'),
					s.showArtist ? line(t.artist, 'text-sm/medium') : null,
					s.timerMode === 'progress' && t.duration > 0
						? h(RN.View, null, h(RN.View, { style: st.bar }, h(RN.View, { style: st.barFill })), line('0:00 / ' + fmt(t.duration), 'text-xs/medium', 'text-muted'))
						: s.timerMode === 'none' ? null : line(s.timerMode === 'progress' ? 'Length unknown, showing time elapsed' : '0:00 elapsed', 'text-xs/medium', 'text-muted'),
				),
			)
		}
		return h(
			RN.View,
			{ style: st.band },
			h(Design.Text, { variant: 'text-xs/semibold', color: 'text-muted' }, 'LIVE PREVIEW'),
			body,
			t && s.showButton
				? h(RN.View, { style: st.button }, h(Design.Text, { variant: 'text-sm/semibold' }, String(s.buttonLabel || '').trim() || 'Listen on SoundCloud'))
				: null,
			status.state === 'loading' ? h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted', style: { marginTop: 8 } }, status.text) : null,
			status.state === 'error' || status.state === 'ended'
				? h(Design.Text, { variant: 'text-xs/medium', color: status.state === 'error' ? 'text-feedback-critical' : 'text-muted', style: { marginTop: 8 } }, status.text)
				: null,
			t && !s.enabled ? h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted', style: { marginTop: 8 } }, 'Show status is off, so nothing is on your profile.') : null,
		)
	}

	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var React = valenced.react.React
		var store = props.api.jsonStorage
		storage = store
		var settings = merge(store.use())
		var linkState = React.useState('')
		var link = linkState[0]

		function set(key, value) {
			var o = {}
			o[key] = value
			return save(o).then(function () { return apply() })
		}
		function row(label, subLabel, onPress) {
			return h(Design.TableRow, { label: label, subLabel: subLabel, onPress: onPress })
		}
		function toggle(label, subLabel, key) {
			return h(Design.TableSwitchRow, {
				label: label,
				subLabel: subLabel,
				value: !!settings[key],
				onValueChange: function (value) { set(key, value) },
			})
		}
		function radio(title, key, items) {
			return h(
				Design.TableRadioGroup,
				{ title: title, value: settings[key], onChange: function (value) { set(key, value) } },
				items.map(function (item) {
					return h(Design.TableRadioRow, { key: String(item.v), label: item.l, subLabel: item.s, value: item.v })
				}),
			)
		}
		function section(title) {
			var kids = Array.prototype.slice.call(arguments, 1).filter(Boolean)
			return h(Design.TableRowGroup, { title: title }, kids)
		}
		function submit() {
			var found = parseLink(link)
			if (!found) return toast('That does not look like a SoundCloud link')
			showTrack(found).then(function (ok) { if (ok) linkState[1]('') })
		}

		var children = [
			section(
				'Show a track',
				h(Design.TextInput, {
					label: 'SoundCloud link',
					description: 'A track or playlist link. The text SoundCloud copies when you share also works.',
					placeholder: 'https://soundcloud.com/artist/track',
					size: 'md',
					value: link,
					onChange: linkState[1],
				}),
				row('Show this track', 'Look it up and put it on your profile', submit),
				row('Paste from clipboard', 'Use the SoundCloud link you copied', function () { checkClipboard(false) }),
			),
			settings.recents.length
				? section(
						'Recent',
						settings.recents.map(function (r, i) {
							return h(Design.TableRow, {
								key: r.url + i,
								label: r.title,
								subLabel: r.artist || 'SoundCloud',
								onPress: function () { showTrack(r.url) },
							})
						}),
						row('Clear recent tracks', 'Forget the list above', function () { save({ recents: [] }) }),
				  )
				: null,
			section(
				'General',
				toggle('Show status', 'Put the current track on your Discord profile', 'enabled'),
				toggle('Show again when Discord opens', 'Brings the last track back if it has not finished', 'applyOnStart'),
				toggle('Clear when the track ends', 'Removes your status after the last second (progress bar only)', 'clearAtEnd'),
				toggle('Check the clipboard when Discord opens', 'In SoundCloud tap Share, then Copy link. Opening Discord shows it. Android may notify you that Discord read the clipboard.', 'clipboardOnOpen'),
			),
			section(
				'Appearance',
				toggle('Artwork', 'Show the track cover as the large image', 'showArtwork'),
				toggle('Artist', 'Show the artist under the title', 'showArtist'),
				toggle('Listen button', 'A button on your profile that opens the track', 'showButton'),
			),
			settings.showButton
				? h(Field, {
						key: 'buttonLabel',
						label: 'Button text',
						description: 'Up to 32 characters.',
						placeholder: 'Listen on SoundCloud',
						maxLength: 32,
						value: settings.buttonLabel,
						onCommit: function (value) { set('buttonLabel', value) },
				  })
				: null,
			radio('Timer', 'timerMode', TIMER_MODES),
			radio('Status text', 'statusText', STATUS_TEXTS),
			section(
				'Actions',
				row('Restart the timer', 'Start counting from now', function () {
					var t = read().current
					if (!t) return toast('Show a track first')
					save({ current: Object.assign({}, t, { startedAt: Date.now() }) }).then(function () { apply() })
				}),
				row('Stop showing', 'Remove SoundCloud from your profile', function () {
					stopShowing()
					toast('Status cleared')
				}),
			),
			section(
				'How it works',
				row('Why a link?', 'Discord cannot see what other apps are playing, so this plugin reads a SoundCloud link instead. It looks up the title, artist, artwork and length for you.'),
				row('Private tracks', 'Only public tracks can be read.'),
			),
		]
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, stickyHeaderIndices: [0], keyboardShouldPersistTaps: 'handled' },
			h(PreviewCard, { settings: settings }),
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				children.reduce(function (all, item) { return item ? all.concat(item) : all }, []),
			),
		)
	}

	// ---- Plugin ------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			storage = api.jsonStorage
			active = true
			cleanup(function () {
				active = false
				clearTimeout(endTimer)
				try { dispatchActivity(null) } catch (e) {}
			})
			Promise.resolve(storage.cache || storage.get()).then(function () {
				if (!active) return
				if (read().applyOnStart) apply()
				if (read().clipboardOnOpen) setTimeout(function () { checkClipboard(true) }, 2000)
			})
			// Opening Discord again checks the clipboard, if you asked for that.
			try {
				var AppState = valenced.react.ReactNative.AppState
				var sub = AppState.addEventListener('change', function (state) {
					if (state === 'active' && read().clipboardOnOpen) setTimeout(function () { checkClipboard(true) }, 800)
				})
				cleanup(function () { try { sub.remove() } catch (e) {} })
			} catch (e) {}
			// Discord drops local activities on reconnect.
			cleanup(
				valenced.discord.flux.onFluxEventDispatched('CONNECTION_OPEN', function (payload) {
					setTimeout(function () { apply() }, 3000)
					return payload
				}),
			)
		},
	})
	return exports
})({})
