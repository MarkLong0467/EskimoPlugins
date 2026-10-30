(function (exports) {
	/*
	 * Rich Presence for Valenced. Shipped as written, there is no build step.
	 * It follows the bundle shape Valenced's own plugins use (`plugin({...})` and `valenced.*` globals).
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var TAG = '[rich-presence]'
	var SOCKET = 'EskimoRichPresence'
	var PID = 1337
	var TOAST = 'ESKIMO_RICH_PRESENCE'
	// Discord turns an image link into a presence image through an application. Any valid
	// application works for this, so it is only the fallback when you set none of your own.
	var IMAGE_APP_ID = '1054951789318909972'

	var TYPES = [
		{ v: 0, l: 'Playing' },
		{ v: 1, l: 'Streaming' },
		{ v: 2, l: 'Listening to' },
		{ v: 3, l: 'Watching' },
		{ v: 5, l: 'Competing in' },
	]
	var TIME_MODES = [
		{ v: 'none', l: 'No timer' },
		{ v: 'elapsed', l: 'Elapsed since applied' },
		{ v: 'clock', l: 'Same as your current time' },
		{ v: 'countdown', l: 'Countdown from applied' },
		{ v: 'custom', l: 'Custom (loops when start and end are set)' },
	]
	var PROFILE_KEYS = [
		'label', 'name', 'type', 'details', 'detailsUrl', 'state', 'stateUrl', 'applicationId', 'streamUrl',
		'largeImage', 'largeUrl', 'largeText', 'smallImage', 'smallUrl', 'smallText',
		'timestampMode', 'customStart', 'customEnd', 'countdownMinutes',
		'partyCurrent', 'partyMax',
		'button1Label', 'button1Url', 'button2Label', 'button2Url',
	]

	function newProfile(id, label) {
		return {
			id: id, label: label, name: '', type: 0, details: '', detailsUrl: '', state: '', stateUrl: '',
			applicationId: '', streamUrl: '',
			largeImage: '', largeUrl: '', largeText: '', smallImage: '', smallUrl: '', smallText: '',
			timestampMode: 'none', customStart: '', customEnd: '', countdownMinutes: '30',
			partyCurrent: '', partyMax: '',
			button1Label: '', button1Url: '', button2Label: '', button2Url: '',
		}
	}

	var defaults = {
		enabled: true,
		applyOnStart: true,
		refreshSeconds: '0',
		activeProfile: 'default',
		profiles: [newProfile('default', 'Default')],
	}

	// ---- State -------------------------------------------------------------------------------
	var active = false
	var storage
	var appliedAt = Date.now()
	var refreshTimer
	var applyTimer
	var applySeq = 0
	var imageStatus = {}
	var statusListeners = []
	var loopAnchor = Date.now()
	var loopTimer
	var assetCache = new Map()

	// ---- Helpers -----------------------------------------------------------------------------
	function toast(text) {
		try {
			valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text })
		} catch (e) {}
	}

	function merge(value) {
		var out = Object.assign({}, defaults, value || {})
		if (!Array.isArray(out.profiles) || !out.profiles.length) out.profiles = defaults.profiles
		out.profiles = out.profiles.map(function (p) {
			return Object.assign(newProfile(p.id, p.label), p)
		})
		return out
	}

	function read() {
		return merge(storage && storage.cache)
	}

	function currentProfile(settings) {
		return (
			settings.profiles.find(function (p) { return p.id === settings.activeProfile }) ||
			settings.profiles[0]
		)
	}

	function pad(n) { return n < 10 ? '0' + n : '' + n }
	var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
	var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

	function uptime() {
		var s = Math.max(0, Math.floor((Date.now() - appliedAt) / 1000))
		var h = Math.floor(s / 3600)
		var m = Math.floor((s % 3600) / 60)
		return h ? h + ':' + pad(m) + ':' + pad(s % 60) : m + ':' + pad(s % 60)
	}

	/** Replaces {time}, {date} and friends. Unknown names are left as typed. */
	function fill(text) {
		if (typeof text !== 'string' || text.indexOf('{') < 0) return text
		var now = new Date()
		var user = valenced.discord.flux.Stores.UserStore?.getCurrentUser?.()
		var h12 = now.getHours() % 12 || 12
		var vars = {
			time: pad(now.getHours()) + ':' + pad(now.getMinutes()),
			time12: h12 + ':' + pad(now.getMinutes()) + (now.getHours() < 12 ? ' AM' : ' PM'),
			seconds: pad(now.getSeconds()),
			date: now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()),
			day: DAYS[now.getDay()],
			month: MONTHS[now.getMonth()],
			year: '' + now.getFullYear(),
			user: user ? user.globalName || user.username || '' : '',
			username: user ? user.username || '' : '',
			uptime: uptime(),
		}
		return text.replace(/\{(\w+)\}/g, function (all, name) {
			return Object.prototype.hasOwnProperty.call(vars, name) ? vars[name] : all
		})
	}

	function parseTime(value) {
		var s = String(value == null ? '' : value).trim()
		if (!s) return undefined
		if (/^\d+$/.test(s)) {
			var n = Number(s)
			return n < 1e12 ? n * 1000 : n
		}
		var t = Date.parse(s)
		return isNaN(t) ? undefined : t
	}

	function num(value) {
		var n = parseInt(String(value == null ? '' : value).trim(), 10)
		return isNaN(n) || n < 0 ? undefined : n
	}

	function text(value) {
		var s = fill(value)
		return typeof s === 'string' && s.trim() ? s : undefined
	}

	function setImageStatus(slot, status) {
		if (imageStatus[slot] === status) return
		imageStatus[slot] = status
		statusListeners.forEach(function (listener) { listener() })
	}

	var IMAGE_TYPES = /\.(png|jpe?g|gif|webp|avif|bmp)(\?|#|$)/i
	var linkCache = new Map()

	function absoluteUrl(found, base) {
		try { return new URL(found.replace(/&amp;/g, '&'), base).href } catch (e) { return undefined }
	}

	/**
	 * Turns any link you could post in chat into a direct image link: image links stay as they are,
	 * Imgur page links become the image, and other pages give the picture Discord would embed.
	 */
	async function findImageUrl(link) {
		if (linkCache.has(link)) return linkCache.get(link)
		var result = link
		try {
			var imgur = /^https?:\/\/(?:www\.|m\.)?imgur\.com\/(?!a\/|gallery\/|t\/)(\w{5,8})\/?$/i.exec(link)
			if (imgur) result = 'https://i.imgur.com/' + imgur[1] + '.png'
			else if (!IMAGE_TYPES.test(link)) {
				var res = await fetch(link, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)', Accept: 'text/html,image/*' } })
				var type = (res.headers && res.headers.get && res.headers.get('content-type')) || ''
				if (res.ok && !/^image\//i.test(type)) {
					var html = (await res.text()).slice(0, 400000)
					var tags = html.match(/<meta[^>]+>|<link[^>]+>/gi) || []
					var wanted = ['og:image:secure_url', 'og:image:url', 'og:image', 'twitter:image', 'twitter:image:src']
					var found
					for (var w = 0; w < wanted.length && !found; w++)
						for (var t = 0; t < tags.length && !found; t++) {
							var tag = tags[t]
							var name = /(?:property|name)=["']([^"']+)["']/i.exec(tag)
							var content = /content=["']([^"']+)["']/i.exec(tag)
							if (name && content && name[1].toLowerCase() === wanted[w]) found = content[1]
						}
					if (!found) {
						var rel = tags.filter(function (x) { return /rel=["']image_src["']/i.test(x) })[0]
						var href = rel && /href=["']([^"']+)["']/i.exec(rel)
						if (href) found = href[1]
					}
					var abs = found && absoluteUrl(found, link)
					if (abs) result = abs
				}
			}
		} catch (e) {}
		linkCache.set(link, result)
		return result
	}

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

	/**
	 * Turns an image link or asset key into a Discord asset ID. mp: IDs pass through unchanged.
	 * Tries your Application ID first, then the fallback one. Reports the result for the preview.
	 */
	async function resolveImage(appId, value, slot) {
		var v = fill(value)
		if (typeof v !== 'string' || !(v = v.trim())) return setImageStatus(slot, undefined)
		if (/^mp:/i.test(v)) return v
		var finders = valenced.modules.finders
		var utils =
			finders.lookupModule(finders.filters.withProps('fetchAssetIds'))[0] ||
			finders.lookupModule(finders.filters.withProps('getAssetIds'))[0]
		var isLink = /^https?:\/\//i.test(v)
		if (isLink) v = await findImageUrl(v)
		async function viaDiscordApi() {
			var key = 'link|' + v
			if (assetCache.has(key)) {
				setImageStatus(slot, 'ok')
				return assetCache.get(key)
			}
			try {
				var id = await externalAsset(v)
				assetCache.set(key, id)
				setImageStatus(slot, 'ok')
				return id
			} catch (e) {
				setImageStatus(slot, String((e && (e.body && e.body.message || e.message)) || e))
			}
		}
		/** Looks an asset key up in the application's public asset list. */
		async function viaAssetList() {
			var apps = appId && appId !== '0' ? [appId, IMAGE_APP_ID] : [IMAGE_APP_ID]
			for (var i = 0; i < apps.length; i++) {
				var key = apps[i] + '|' + v
				if (assetCache.has(key)) {
					setImageStatus(slot, 'ok')
					return assetCache.get(key)
				}
				try {
					var res = await fetch('https://discord.com/api/v9/oauth2/applications/' + apps[i] + '/assets')
					if (!res.ok) continue
					var assets = await res.json()
					var hit = Array.isArray(assets) && assets.filter(function (a) { return a && (a.name === v || a.id === v) })[0]
					if (hit) {
						assetCache.set(key, hit.id)
						setImageStatus(slot, 'ok')
						return hit.id
					}
				} catch (e) {}
			}
			setImageStatus(slot, 'No image called "' + v + '" was found for this Application ID')
		}
		if (!utils) return isLink ? viaDiscordApi() : viaAssetList()
		var candidates = appId && appId !== '0' ? [appId, IMAGE_APP_ID] : [IMAGE_APP_ID]
		var error
		for (var c = 0; c < candidates.length; c++) {
			var app = candidates[c]
			var key = app + '|' + v
			if (assetCache.has(key)) {
				setImageStatus(slot, 'ok')
				return assetCache.get(key)
			}
			try {
				var ids
				try {
					ids = utils.getAssetIds && utils.getAssetIds(app, [v])
				} catch (e) {}
				if (!ids || !ids.length) ids = await utils.fetchAssetIds(app, [v])
				var id = ids && ids[0]
				if (id) {
					assetCache.set(key, id)
					setImageStatus(slot, 'ok')
					return id
				}
				error = 'Discord returned no image for this link'
			} catch (e) {
				error = String((e && (e.body && e.body.message || e.message)) || e)
				console.warn(TAG + ' could not resolve image:', error)
			}
		}
		if (isLink) return viaDiscordApi()
		if (appId && appId !== '0') return viaAssetList()
		setImageStatus(slot, error || 'Could not load this image')
	}

	async function buildActivity(p) {
		var name = text(p.name)
		if (!name) return null
		var appId = String(p.applicationId || '').trim() || '0'
		var activity = { application_id: appId, name: name, type: Number(p.type) || 0, flags: 1 }
		var details = text(p.details)
		var state = text(p.state)
		if (details) activity.details = details
		if (state) activity.state = state
		var detailsUrl = text(p.detailsUrl)
		var stateUrl = text(p.stateUrl)
		if (detailsUrl && /^https?:\/\//i.test(detailsUrl)) activity.details_url = detailsUrl
		if (stateUrl && /^https?:\/\//i.test(stateUrl)) activity.state_url = stateUrl
		if (activity.type === 1) {
			var url = text(p.streamUrl)
			if (url) activity.url = url
		}

		if (p.timestampMode === 'elapsed') activity.timestamps = { start: appliedAt }
		else if (p.timestampMode === 'clock') {
			var now = new Date()
			activity.timestamps = {
				start: Date.now() - (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) * 1000,
			}
		}
		else if (p.timestampMode === 'countdown') {
			var minutes = num(p.countdownMinutes) || 0
			activity.timestamps = { end: appliedAt + minutes * 60000 }
		} else if (p.timestampMode === 'custom') {
			var start = parseTime(p.customStart)
			var end = parseTime(p.customEnd)
			if (start !== undefined && end !== undefined && end > start) {
				// Both set: the timer repeats from a moving anchor, like a looping countdown.
				activity.timestamps = { start: loopAnchor, end: loopAnchor + (end - start) }
			} else if (start !== undefined || end !== undefined) {
				activity.timestamps = {}
				if (start !== undefined) activity.timestamps.start = start
				if (end !== undefined) activity.timestamps.end = end
			}
		}

		var cur = num(p.partyCurrent)
		var max = num(p.partyMax)
		if (cur !== undefined && max !== undefined && max > 0)
			activity.party = { size: [Math.min(cur, max), max] }

		var assets = {}
		var li = await resolveImage(appId, p.largeImage, 'large')
		var si = await resolveImage(appId, p.smallImage, 'small')
		if (li) assets.large_image = li
		if (si) assets.small_image = si
		var lt = text(p.largeText)
		var st = text(p.smallText)
		var lu = text(p.largeUrl)
		var su = text(p.smallUrl)
		if (lt && li) assets.large_text = lt
		if (st && si) assets.small_text = st
		if (lu && li && /^https?:\/\//i.test(lu)) assets.large_url = lu
		if (su && si && /^https?:\/\//i.test(su)) assets.small_url = su
		if (Object.keys(assets).length) activity.assets = assets

		var labels = []
		var urls = []
		;[[p.button1Label, p.button1Url], [p.button2Label, p.button2Url]].forEach(function (b) {
			var label = text(b[0])
			var link = text(b[1])
			if (label && link && /^https?:\/\//i.test(link)) {
				labels.push(label.slice(0, 32))
				urls.push(link)
			}
		})
		if (labels.length) {
			activity.buttons = labels
			activity.metadata = { button_urls: urls }
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

	/** Re-anchors a looping custom timer each time it runs out. */
	function ensureLoop() {
		clearInterval(loopTimer)
		loopTimer = undefined
		var p = currentProfile(read())
		var start = parseTime(p.customStart)
		var end = parseTime(p.customEnd)
		if (!read().enabled || p.timestampMode !== 'custom' || start === undefined || end === undefined || end <= start)
			return
		var duration = end - start
		loopTimer = setInterval(function () {
			if (Date.now() >= loopAnchor + duration) {
				loopAnchor = Date.now()
				apply(false)
			}
		}, 1000)
	}

	async function apply(resetTimer) {
		if (!active) return
		if (resetTimer) {
			appliedAt = Date.now()
			loopAnchor = appliedAt
		}
		ensureLoop()
		var seq = ++applySeq
		var settings = read()
		try {
			if (!settings.enabled) return dispatchActivity(null)
			var activity = await buildActivity(currentProfile(settings))
			if (seq !== applySeq || !active) return
			dispatchActivity(activity)
		} catch (error) {
			console.warn(TAG + ' apply failed:', String(error))
		}
	}

	function scheduleApply(resetTimer) {
		clearTimeout(applyTimer)
		applyTimer = setTimeout(function () { apply(resetTimer) }, 200)
	}

	function restartRefresh() {
		clearInterval(refreshTimer)
		refreshTimer = undefined
		var seconds = num(read().refreshSeconds) || 0
		if (seconds > 0)
			refreshTimer = setInterval(function () { apply(false) }, Math.max(15, seconds) * 1000)
	}

	// ---- Live preview ------------------------------------------------------------------------
	var previewStyles

	function typeLabel(type) {
		var t = TYPES.filter(function (x) { return x.v === Number(type) })[0]
		return t ? t.l : 'Playing'
	}

	/** What the presence will say, from a profile that may include text still being typed. */
	function describe(p) {
		var name = text(p.name)
		var lines = []
		var state = text(p.state)
		var cur = num(p.partyCurrent)
		var max = num(p.partyMax)
		if (state && cur !== undefined && max !== undefined && max > 0) state += ' (' + Math.min(cur, max) + ' of ' + max + ')'
		var timer
		var now = new Date()
		if (p.timestampMode === 'elapsed') timer = '0:00 elapsed'
		else if (p.timestampMode === 'clock') timer = pad(now.getHours()) + ':' + pad(now.getMinutes()) + ' elapsed'
		else if (p.timestampMode === 'countdown') timer = (num(p.countdownMinutes) || 0) + ':00 left'
		else if (p.timestampMode === 'custom') {
			var a = parseTime(p.customStart)
			var b = parseTime(p.customEnd)
			timer = a !== undefined && b !== undefined && b > a ? 'looping timer' : a !== undefined || b !== undefined ? 'custom timer' : undefined
		}
		var buttons = []
		;[[p.button1Label, p.button1Url], [p.button2Label, p.button2Url]].forEach(function (b) {
			var label = text(b[0])
			var link = text(b[1])
			if (label && link && /^https?:\/\//i.test(link)) buttons.push(label)
		})
		var image = text(p.largeImage)
		return {
			name: name,
			title: name ? typeLabel(p.type) + ' ' + name : undefined,
			details: text(p.details),
			state: state,
			timer: timer,
			buttons: buttons,
			image: image && /^https?:\/\//i.test(image) ? image : undefined,
			hasImage: !!image,
			smallImage: text(p.smallImage) && /^https?:\/\//i.test(text(p.smallImage)) ? text(p.smallImage) : undefined,
		}
	}

	function PreviewCard(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var Tokens = valenced.discord.common.tokens.Tokens
		if (!previewStyles)
			previewStyles = Design.createStyles({
				band: { backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH, paddingHorizontal: 16, paddingVertical: 12 },
				row: { flexDirection: 'row', alignItems: 'center' },
				art: { width: 64, height: 64, borderRadius: 8, marginRight: 12, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGHEST },
				artImage: { width: 64, height: 64 },
				badge: { position: 'absolute', right: 6, bottom: 0, width: 24, height: 24, borderRadius: 12, overflow: 'hidden' },
				text: { flex: 1 },
				buttons: { flexDirection: 'row', marginTop: 8 },
				button: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, marginRight: 8, backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGHEST },
			})
		var st = previewStyles()
		var React = valenced.react.React
		var tick = React.useState(0)
		React.useEffect(function () {
			var listener = function () { tick[1](function (n) { return n + 1 }) }
			statusListeners.push(listener)
			return function () { statusListeners = statusListeners.filter(function (l) { return l !== listener }) }
		}, [])
		var d = props.info
		var problems = ['large', 'small']
			.filter(function (slot) { return imageStatus[slot] && imageStatus[slot] !== 'ok' })
			.map(function (slot) { return (slot === 'large' ? 'Large' : 'Small') + ' image not sent: ' + imageStatus[slot] })
		function line(content, variant, color) {
			return content ? h(Design.Text, { variant: variant, color: color }, content) : null
		}
		return h(
			RN.View,
			{ style: st.band },
			h(Design.Text, { variant: 'text-xs/semibold', color: 'text-muted' }, 'LIVE PREVIEW'),
			d.name
				? h(
						RN.View,
						{ style: [st.row, { marginTop: 8 }] },
						h(
							RN.View,
							null,
							h(
								RN.View,
								{ style: st.art },
								d.image
									? h(RN.Image, { source: { uri: d.image }, style: st.artImage })
									: h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted' }, d.hasImage ? 'image' : ''),
							),
							d.smallImage ? h(RN.View, { style: st.badge }, h(RN.Image, { source: { uri: d.smallImage }, style: { width: 24, height: 24 } })) : null,
						),
						h(
							RN.View,
							{ style: st.text },
							line(d.title, 'text-md/semibold'),
							line(d.details, 'text-sm/medium'),
							line(d.state, 'text-sm/medium'),
							line(d.timer, 'text-sm/medium', 'text-muted'),
						),
				  )
				: h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Nothing is shown yet. Enter an Activity name to turn your presence on.'),
			d.name && problems.length
				? h(Design.Text, { variant: 'text-xs/medium', color: 'text-feedback-critical', style: { marginTop: 8 } }, problems.join('\n'))
				: null,
			d.name && d.buttons.length
				? h(
						RN.View,
						{ style: st.buttons },
						d.buttons.map(function (label, i) {
							return h(RN.View, { key: 'b' + i, style: st.button }, h(Design.Text, { variant: 'text-sm/semibold' }, label))
						}),
				  )
				: null,
		)
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
			onChange: function (v) {
				setValue(v)
				if (props.onDraft) props.onDraft(v)
			},
		})
	}

	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var Clipboard = valenced.externals.ReactNativeClipboard.Clipboard
		var store = props.api.jsonStorage
		storage = store
		var settings = merge(store.use())
		var profile = currentProfile(settings)
		var draftState = valenced.react.React.useState({ id: null, values: {} })
		var draft = draftState[0]
		var setDraft = draftState[1]
		var live = Object.assign({}, profile, draft.id === profile.id ? draft.values : {})
		function onDraft(key, value) {
			setDraft(function (prev) {
				var next = Object.assign({}, prev.id === profile.id ? prev.values : {})
				next[key] = value
				return { id: profile.id, values: next }
			})
		}

		function save(patch, reset) {
			return Promise.resolve(store.set(Object.assign({}, read(), patch), true)).then(function () {
				scheduleApply(!!reset)
				restartRefresh()
			})
		}
		function update(patch, reset) {
			var latest = read()
			var id = currentProfile(latest).id
			return save({
				profiles: latest.profiles.map(function (p) {
					return p.id === id ? Object.assign({}, p, patch) : p
				}),
			}, reset)
		}
		function field(key, label, placeholder, description, maxLength) {
			return h(Field, {
				key: profile.id + ':' + key,
				label: label,
				placeholder: placeholder,
				description: description,
				maxLength: maxLength,
				value: profile[key],
				onDraft: function (value) { onDraft(key, value) },
				onCommit: function (value) { update(defineOne(key, value), key === 'timestampMode') },
			})
		}
		function defineOne(key, value) {
			var o = {}
			o[key] = value
			return o
		}
		function row(label, subLabel, onPress) {
			return h(Design.TableRow, { label: label, subLabel: subLabel, onPress: onPress })
		}
		function radio(title, value, items, onChange) {
			return h(
				Design.TableRadioGroup,
				{ title: title, value: value, onChange: onChange },
				items.map(function (item) {
					return h(Design.TableRadioRow, { key: String(item.v), label: item.l, value: item.v })
				}),
			)
		}
		function section(title) {
			var kids = Array.prototype.slice.call(arguments, 1).filter(Boolean)
			return h(Design.TableRowGroup, { title: title }, kids)
		}

		var children = [
			section(
				'General',
				h(Design.TableSwitchRow, {
					label: 'Show presence',
					subLabel: 'Turn your custom presence on or off',
					value: settings.enabled,
					onValueChange: function (enabled) { save({ enabled: enabled }, true) },
				}),
				h(Design.TableSwitchRow, {
					label: 'Apply on start',
					subLabel: 'Set the presence when Discord launches',
					value: settings.applyOnStart,
					onValueChange: function (applyOnStart) { save({ applyOnStart: applyOnStart }) },
				}),
				!text(profile.name)
					? row('Nothing is shown yet', 'Enter an Activity name below to turn your presence on.')
					: null,
			),
			h(Field, {
				key: 'refresh',
				label: 'Refresh every (seconds)',
				description: 'Updates {time}, {uptime} and other variables. 0 turns it off, minimum 15.',
				placeholder: '0',
				maxLength: 5,
				value: settings.refreshSeconds,
				onCommit: function (refreshSeconds) { save({ refreshSeconds: refreshSeconds }) },
			}),
			radio(
				'Profile',
				profile.id,
				settings.profiles.map(function (p) { return { v: p.id, l: p.label || p.name || p.id } }),
				function (activeProfile) { save({ activeProfile: activeProfile }, true) },
			),
			section(
				'Manage profiles',
				row('New profile', 'Start from a blank profile', function () {
					var id = Date.now().toString(36)
					var latest = read()
					save({
						profiles: latest.profiles.concat(newProfile(id, 'Profile ' + (latest.profiles.length + 1))),
						activeProfile: id,
					}, true)
				}),
				row('Duplicate profile', 'Copy the selected profile', function () {
					var latest = read()
					var source = currentProfile(latest)
					var id = Date.now().toString(36)
					save({
						profiles: latest.profiles.concat(Object.assign({}, source, { id: id, label: (source.label || 'Profile') + ' copy' })),
						activeProfile: id,
					}, true)
				}),
				row('Delete profile', 'Remove the selected profile', function () {
					var latest = read()
					if (latest.profiles.length < 2) return toast('Keep at least one profile')
					var id = currentProfile(latest).id
					var rest = latest.profiles.filter(function (p) { return p.id !== id })
					save({ profiles: rest, activeProfile: rest[0].id }, true)
				}),
				row('Copy profile', 'Copy the selected profile as JSON', function () {
					var out = {}
					PROFILE_KEYS.forEach(function (k) { out[k] = profile[k] })
					Clipboard.setString(JSON.stringify(out))
					toast('Profile copied')
				}),
				row('Paste profile', 'Add a profile from the clipboard', function () {
					Promise.resolve(Clipboard.getString()).then(function (raw) {
						try {
							var data = JSON.parse(raw)
							if (!data || typeof data !== 'object' || Array.isArray(data)) throw new TypeError()
							var id = Date.now().toString(36)
							var imported = newProfile(id, data.label || 'Imported')
							PROFILE_KEYS.forEach(function (k) {
								if (k in data && typeof data[k] !== 'object') imported[k] = data[k]
							})
							var latest = read()
							save({ profiles: latest.profiles.concat(imported), activeProfile: id }, true)
							toast('Profile added')
						} catch (e) {
							toast('Clipboard has no copied profile')
						}
					})
				}),
			),
			field('label', 'Profile name', 'Default', 'Only shown in this list.', 40),
			field('applicationId', 'Application ID', '', 'Create an application at discord.com/developers and paste its ID. Needed for images and asset keys. Leave empty to use none.', 24),
			field('name', 'Activity name', 'e.g. My game', 'Required. Nothing is shown until you set it. Supports variables.', 128),
			radio('Activity type', profile.type, TYPES, function (type) { update({ type: type }) }),
			profile.type === 1
				? field('streamUrl', 'Stream URL', 'https://twitch.tv/name', 'A Twitch or YouTube link.', 300)
				: null,
			field('details', 'Details', '', 'First line. Supports variables.', 128),
			field('detailsUrl', 'Details link', 'https://', 'Optional. Makes the details line clickable.', 300),
			field('state', 'State', '', 'Second line. Supports variables.', 128),
			field('stateUrl', 'State link', 'https://', 'Optional. Makes the state line clickable.', 300),
			radio('Timer', profile.timestampMode, TIME_MODES, function (timestampMode) { update({ timestampMode: timestampMode }, true) }),
			profile.timestampMode === 'countdown'
				? field('countdownMinutes', 'Countdown minutes', '30', 'The timer counts down to zero.', 6)
				: null,
			profile.timestampMode === 'custom'
				? [
						field('customStart', 'Start time', '2026-01-01 12:00', 'A date, or a Unix time in seconds or milliseconds.', 40),
						field('customEnd', 'End time', '', 'Set both to loop a countdown of the same length forever.', 40),
				  ]
				: null,
			field('largeImage', 'Large image', 'https://… or asset key', 'An image link or an asset key from your application. Needs the Application ID for asset keys.', 300),
			field('largeUrl', 'Large image link', 'https://', 'Optional. Opens when the image is tapped.', 300),
			field('largeText', 'Large image text', '', 'Shown when hovering the large image.', 128),
			field('smallImage', 'Small image', 'https://… or asset key', 'Shown in the corner of the large image. Small images work most reliably.', 300),
			field('smallUrl', 'Small image link', 'https://', 'Optional.', 300),
			field('smallText', 'Small image text', '', '', 128),
			field('button1Label', 'Button 1 label', '', 'A button needs a label and a link.', 32),
			field('button1Url', 'Button 1 link', 'https://', '', 300),
			field('button2Label', 'Button 2 label', '', '', 32),
			field('button2Url', 'Button 2 link', 'https://', '', 300),
			field('partyCurrent', 'Party size', '1', 'Current players. Set the maximum below as well.', 4),
			field('partyMax', 'Party maximum', '4', '', 4),
			section(
				'Good to know',
				row('Your own buttons', "Discord doesn't show buttons on your own profile. Other people can see them on desktop, not always on mobile."),
				row('Share activity', 'Your presence only shows if Discord is allowed to share your activity in your privacy settings.'),
				row('Fancy text', 'Unusual unicode text can stop a presence from showing. Try normal letters.'),
				row('Image links', 'Paste any link you could post in chat: a direct image link, an Imgur link, or a page with a picture. The plugin finds the picture Discord would show. If one fails, try a smaller image.'),
				row('Photos from your phone', 'Upload the photo to catbox.moe or imgur.com, copy the link, and paste it into Large image. Discord attachment links stop working after about a day.'),
				row('Asset keys', 'Or upload art in your application on discord.com/developers under Rich Presence, then type its key (the asset name) into Large image and set the Application ID.'),
			),
			section(
				'Variables',
				row(
					'{time} {time12} {seconds} {date} {day} {month} {year} {user} {username} {uptime}',
					'Use these in any text field. They update on the refresh interval.',
				),
			),
			section(
				'Actions',
				row('Apply now', 'Send the selected profile and restart its timer', function () {
					apply(true)
					toast('Presence applied')
				}),
				row('Clear presence', 'Remove your custom presence', function () {
					dispatchActivity(null)
					toast('Presence cleared')
				}),
			),
		]
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, stickyHeaderIndices: [0], keyboardShouldPersistTaps: 'handled' },
			h(PreviewCard, { info: describe(live) }),
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				children.reduce(function (all, item) { return all.concat(item) }, []),
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
			appliedAt = Date.now()
			cleanup(function () {
				active = false
				clearTimeout(applyTimer)
				clearInterval(refreshTimer)
				clearInterval(loopTimer)
				try { dispatchActivity(null) } catch (e) {}
			})
			Promise.resolve(storage.cache || storage.get()).then(function () {
				if (!active) return
				restartRefresh()
				if (read().applyOnStart) apply(true)
			})
			// Discord drops local activities on reconnect.
			cleanup(
				valenced.discord.flux.onFluxEventDispatched('CONNECTION_OPEN', function (payload) {
					setTimeout(function () { apply(false) }, 3000)
					return payload
				}),
			)
		},
	})
	return exports
})({})
