(function (exports) {
	/*
	 * SoundCloud Presence for Valenced. Shipped as written, there is no build step.
	 * It follows the bundle shape Valenced's own plugins use (`plugin({...})` and `valenced.*` globals)
	 * and sets your status the same way the Rich Presence plugin does (LOCAL_ACTIVITY_UPDATE).
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * Discord cannot see what another app is playing, so the track comes from one of two places:
	 *  - a SoundCloud link you paste, pick from Recent, or copy in SoundCloud (Share > Copy link), or
	 *  - Last.fm "now playing", filled in by a scrobbler app such as Pano Scrobbler, which can read the
	 *    SoundCloud app's media notification. That is the automatic mode.
	 *
	 * The status can be shown by this plugin itself, or handed to the Rich Presence plugin as the variables
	 * {sc_title} {sc_artist} {sc_url} {sc_art} {sc_button} so your own presence profile can display it.
	 */
	var TAG = '[soundcloud-presence]'
	var SOCKET = 'EskimoSoundCloudPresence'
	var PID = 1338
	var TOAST = 'ESKIMO_SOUNDCLOUD_PRESENCE'
	var ORANGE = '#FF5500'
	var MAX_RECENTS = 8
	var LINK_RE = /https?:\/\/(?:www\.|m\.|on\.)?soundcloud\.com\/[^\s<>"')]+/i
	var LASTFM_BLANK = '2a96cbd8b46e442fc41c2b86b821562f'
	var RICH_VARS = ['sc_title', 'sc_artist', 'sc_url', 'sc_art', 'sc_button']
	// Discord allows a client 5 presence updates per 20 seconds, so updates are spaced out and repeats are dropped.
	var MIN_GAP_MS = 4500
	// Between two songs Last.fm can briefly report nothing. One quick second look stops the status flickering off.
	var MISS_RECHECK_MS = 8000
	// Shown as the cover when no real one can be found. It lives in the plugin's own repository.
	var FALLBACK_COVER = 'https://raw.githubusercontent.com/MarkLong0467/EskimoPlugins/main/plugins/soundcloud-presence/cover.png'

	var TIMER_MODES = [
		{ v: 'progress', l: 'Progress bar', s: 'Counts up to the length of the track, then the status clears.' },
		{ v: 'elapsed', l: 'Time elapsed', s: 'Counts up from when the track started.' },
		{ v: 'none', l: 'No timer', s: 'Shows only the title and artist.' },
	]
	var STATUS_TEXTS = [
		{ v: 0, l: 'SoundCloud', s: 'Listening to SoundCloud' },
		{ v: 1, l: 'Artist name', s: 'Listening to the artist' },
		{ v: 2, l: 'Track title', s: 'Listening to the song' },
	]
	var POLLS = [
		{ v: '15', l: 'Every 15 seconds', s: 'Quickest to notice a new song. Uses the most battery.' },
		{ v: '30', l: 'Every 30 seconds', s: 'A good balance.' },
		{ v: '60', l: 'Every minute', s: 'Lightest on battery.' },
	]
	var OUTPUTS = [
		{ v: 'own', l: 'This plugin', s: 'SoundCloud Presence sets your status itself.' },
		{ v: 'rich', l: 'My Rich Presence plugin', s: 'Hands the track to Rich Presence 1.3 or newer. In its settings tap "Use for SoundCloud".' },
	]

	var defaults = {
		enabled: true,
		applyOnStart: true,
		clipboardOnOpen: false,
		clearAtEnd: true,
		showArtwork: true,
		showArtist: true,
		showButton: true,
		hideWithSpotify: true,
		coverLookup: true,
		fallbackCover: true,
		smallIcon: '',
		buttonLabel: 'Listen on SoundCloud',
		timerMode: 'progress',
		statusText: 0,
		output: 'own',
		autoEnabled: false,
		lfmUser: '',
		lfmKey: '',
		pollSeconds: '30',
		current: null,
		recents: [],
	}

	// ---- State -------------------------------------------------------------------------------
	var active = false
	var storage
	var applySeq = 0
	var endTimer
	var pollTimer
	var polling = false
	var lastClip = ''
	var auto = null
	var richWarned = false
	var missPending = false
	var missTimer
	var lastSentJson = ''
	var lastSentAt = 0
	var sendTimer
	var pendingSend
	var gapMs = MIN_GAP_MS
	var recheckMs = MISS_RECHECK_MS
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

	function searchLink(artist, title) {
		return 'https://soundcloud.com/search/sounds?q=' + encodeURIComponent((artist ? artist + ' ' : '') + title)
	}

	// ---- SoundCloud lookup (pasted links) ----------------------------------------------------
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

	// ---- Last.fm (automatic mode) ------------------------------------------------------------
	async function lastfm(method, params) {
		var s = read()
		var user = String(s.lfmUser || '').trim()
		var key = String(s.lfmKey || '').trim()
		if (!user || !key) throw new Error('Enter your Last.fm name and API key first')
		var qs = Object.keys(params).map(function (k) { return k + '=' + encodeURIComponent(params[k]) }).join('&')
		var res = await fetch('https://ws.audioscrobbler.com/2.0/?method=' + method + '&api_key=' + encodeURIComponent(key) + '&format=json&' + qs)
		var data
		try { data = await res.json() } catch (e) {}
		if (!res.ok || (data && data.error)) throw new Error(data && data.message ? 'Last.fm: ' + data.message : 'Last.fm said no (' + res.status + ')')
		return data
	}

	function normalize(s) {
		return String(s == null ? '' : s)
			.toLowerCase()
			.replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
			.replace(/[\s\-_.,:;!?'"|\/\\&+]+/g, ' ')
			.trim()
	}

	/**
	 * Looks a song up in Apple Music's public search for its cover. A result only counts when both the title and the
	 * artist match, so a wrong cover is never shown. Songs that exist only on SoundCloud are usually not there.
	 */
	async function findCover(artist, title) {
		try {
			var res = await fetch('https://itunes.apple.com/search?media=music&entity=song&limit=5&term=' + encodeURIComponent(artist + ' ' + title))
			if (!res.ok) return ''
			var data = await res.json()
			var wantTitle = normalize(title)
			var wantArtist = normalize(artist)
			if (!wantTitle || !wantArtist) return ''
			var list = (data && data.results) || []
			for (var i = 0; i < list.length; i++) {
				var t = normalize(list[i].trackName)
				var a = normalize(list[i].artistName)
				var titleOk = t && (t === wantTitle || t.indexOf(wantTitle) === 0 || wantTitle.indexOf(t) === 0)
				var artistOk = a && (a.indexOf(wantArtist) >= 0 || wantArtist.indexOf(a) >= 0)
				if (titleOk && artistOk && list[i].artworkUrl100) return String(list[i].artworkUrl100).replace('100x100bb', '600x600bb')
			}
		} catch (e) {}
		return ''
	}

	/** The cover to show: the real one, else the plugin's default cover, else none. */
	function coverOf(settings, track) {
		return track.artwork || (settings.fallbackCover ? FALLBACK_COVER : '')
	}

	function pickImage(images) {
		if (!Array.isArray(images)) return ''
		for (var i = images.length - 1; i >= 0; i--) {
			var url = images[i] && images[i]['#text']
			if (url && url.indexOf(LASTFM_BLANK) < 0) return url
		}
		return ''
	}

	/** The song Last.fm says you are playing right now, or null. */
	async function fetchNowPlaying() {
		var data = await lastfm('user.getrecenttracks', { user: String(read().lfmUser).trim(), limit: '1' })
		var list = data && data.recenttracks && data.recenttracks.track
		var t = Array.isArray(list) ? list[0] : list
		if (!t || !t['@attr'] || String(t['@attr'].nowplaying) !== 'true') return null
		var artist = (t.artist && (t.artist['#text'] || t.artist.name)) || ''
		var title = t.name || ''
		if (!title) return null
		return { artist: artist, title: title, album: (t.album && t.album['#text']) || '', artwork: pickImage(t.image) }
	}

	/** Checks Last.fm once and keeps `auto` in step with what is playing. */
	async function poll() {
		var s = read()
		if (polling || !active || !s.autoEnabled || !String(s.lfmUser).trim() || !String(s.lfmKey).trim()) return
		polling = true
		try {
			var np = await fetchNowPlaying()
			if (!active) return
			if (!np) {
				if (auto) {
					// The first time Last.fm reports nothing, look again shortly before clearing.
					if (!missPending) {
						missPending = true
						clearTimeout(missTimer)
						missTimer = setTimeout(poll, recheckMs)
						return
					}
					missPending = false
					auto = null
					await apply()
				}
				return
			}
			missPending = false
			clearTimeout(missTimer)
			var key = np.artist + '\u0001' + np.title
			if (auto && auto.key === key) return
			var duration = 0
			var artwork = np.artwork
			var album = np.album
			try {
				var info = await lastfm('track.getinfo', { artist: np.artist, track: np.title, autocorrect: '1' })
				var found = info && info.track
				duration = Number(found && found.duration) || 0
				// The track's own album art fills in when the recent tracks list has none.
				if (!artwork && found && found.album) artwork = pickImage(found.album.image)
				if (!album && found && found.album) album = found.album.title || ''
			} catch (e) {}
			if (!artwork && s.coverLookup) artwork = await findCover(np.artist, np.title)
			auto = {
				key: key,
				url: '',
				searchUrl: searchLink(np.artist, np.title),
				title: np.title,
				artist: np.artist,
				artistUrl: '',
				album: album || '',
				artwork: artwork || '',
				duration: duration,
				startedAt: Date.now(),
			}
			await apply()
		} catch (error) {
			setStatus({ state: 'error', text: String((error && error.message) || error) })
		} finally {
			polling = false
		}
	}

	function restartPolling() {
		clearInterval(pollTimer)
		pollTimer = undefined
		var s = read()
		if (!active || !s.autoEnabled) {
			if (auto) {
				auto = null
				if (active) apply()
			}
			return
		}
		var seconds = Math.max(15, parseInt(String(s.pollSeconds), 10) || 30)
		pollTimer = setInterval(poll, seconds * 1000)
		poll()
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
	/** The track to show: what Last.fm says is playing, else the link you chose. */
	function effective(settings) {
		return settings.autoEnabled && auto ? auto : settings.current
	}

	function progressEnd(settings, track) {
		return settings.timerMode === 'progress' && track.duration > 0 ? track.startedAt + track.duration : 0
	}

	function buttonOf(settings, track) {
		var label = track.url ? String(settings.buttonLabel || '').trim() || 'Listen on SoundCloud' : 'Find on SoundCloud'
		return { label: label.slice(0, 32), url: track.url || track.searchUrl }
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

		var cover = settings.showArtwork ? coverOf(settings, track) : ''
		if (cover) {
			var image = await artworkAsset(cover)
			if (image) {
				// The hover text is the album when Last.fm knows it, else the title.
				activity.assets = { large_image: image, large_text: (track.album || track.title).slice(0, 128) }
				if (/^https?:\/\//i.test(track.url)) activity.assets.large_url = track.url
			}
		}
		// An optional small icon, such as a SoundCloud logo you pick, in the corner of the cover.
		var icon = String(settings.smallIcon || '').trim()
		if (activity.assets && /^https?:\/\//i.test(icon)) {
			var smallImage = await artworkAsset(icon)
			if (smallImage) {
				activity.assets.small_image = smallImage
				activity.assets.small_text = 'SoundCloud'
			}
		}
		if (settings.showButton) {
			var button = buttonOf(settings, track)
			if (/^https?:\/\//i.test(button.url)) {
				activity.buttons = [button.label]
				activity.metadata = { button_urls: [button.url] }
			}
		}
		return activity
	}

	function sendActivity(activity) {
		valenced.discord.common.flux.Dispatcher.dispatch({
			type: 'LOCAL_ACTIVITY_UPDATE',
			activity: activity,
			pid: PID,
			socketId: SOCKET,
		})
	}

	function flushSend() {
		if (!pendingSend) return
		var wait = lastSentAt + gapMs - Date.now()
		if (wait > 0) {
			// Too soon after the last update. Only the newest one waits, so a burst becomes two updates.
			if (!sendTimer) sendTimer = setTimeout(function () { sendTimer = undefined; flushSend() }, wait)
			return
		}
		var next = pendingSend
		pendingSend = undefined
		lastSentJson = next.json
		lastSentAt = Date.now()
		sendActivity(next.activity)
	}

	/** Sends a status update, unless it is identical to the last one, and never faster than Discord allows. */
	function dispatchActivity(activity) {
		var json = JSON.stringify(activity == null ? null : activity)
		if (!pendingSend && json === lastSentJson) return
		pendingSend = { activity: activity, json: json }
		flushSend()
	}

	/** Sends right away, for shutting down and for Discord reconnecting. */
	function dispatchNow(activity) {
		clearTimeout(sendTimer)
		sendTimer = undefined
		pendingSend = undefined
		lastSentJson = JSON.stringify(activity == null ? null : activity)
		lastSentAt = Date.now()
		sendActivity(activity)
	}

	/** True while another app, such as Spotify, is already showing a "Listening to" card. */
	function otherListening() {
		try {
			var store = valenced.discord.flux.Stores.LocalActivityStore
			var list = (store && store.getActivities && store.getActivities()) || []
			return list.some(function (a) {
				return a && a.type === 2 && a.name !== 'SoundCloud' && String(a.application_id || '') !== '0'
			})
		} catch (e) {
			return false
		}
	}

	// ---- Handing the track to the Rich Presence plugin ---------------------------------------
	function nudgeRich() {
		var rp = globalThis.eskimoRichPresence
		if (rp && typeof rp.apply === 'function') {
			rp.apply()
			return true
		}
		return false
	}

	function pushRich(settings, track) {
		var end = progressEnd(settings, track)
		var button = buttonOf(settings, track)
		globalThis.eskimoVars = Object.assign(globalThis.eskimoVars || {}, {
			sc_title: track.title,
			sc_artist: settings.showArtist ? track.artist : '',
			sc_url: button.url,
			sc_art: settings.showArtwork ? coverOf(settings, track) : '',
			sc_button: button.label,
		})
		globalThis.eskimoTimestamps = settings.timerMode === 'none' ? undefined : end ? { start: track.startedAt, end: end } : { start: track.startedAt }
		if (!nudgeRich() && !richWarned) {
			richWarned = true
			toast('Rich Presence 1.3 or newer is not running, so nothing is shown')
		}
	}

	function clearRich() {
		var vars = globalThis.eskimoVars
		if (!vars || !vars.sc_title) return
		RICH_VARS.forEach(function (k) { vars[k] = '' })
		globalThis.eskimoTimestamps = undefined
		nudgeRich()
	}

	async function apply() {
		clearTimeout(endTimer)
		if (!active) return
		var seq = ++applySeq
		var settings = read()
		var track = effective(settings)
		try {
			if (!settings.enabled || !track) {
				clearRich()
				return dispatchActivity(null)
			}
			if (settings.hideWithSpotify && otherListening()) {
				setStatus({ state: 'hidden', text: 'Hidden while another app is showing what it plays, such as Spotify.' })
				clearRich()
				return dispatchActivity(null)
			}
			var end = progressEnd(settings, track)
			if (settings.clearAtEnd && end && Date.now() >= end) {
				setStatus({ state: 'ended', text: 'That track has finished.' })
				clearRich()
				return dispatchActivity(null)
			}
			if (settings.output === 'rich') {
				dispatchActivity(null)
				pushRich(settings, track)
			} else {
				clearRich()
				var activity = await buildActivity(settings, track)
				if (seq !== applySeq || !active) return
				dispatchActivity(activity)
			}
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
			else if (settings.autoEnabled && auto) toast('Saved. Automatic mode is showing what Last.fm reports while a song plays.')
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
		auto = null
		await save({ current: null })
		setStatus({ state: 'idle', text: '' })
		clearRich()
		dispatchNow(null)
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
		var t = effective(s)
		var fromAuto = !!(s.autoEnabled && auto)
		function line(content, variant, color) {
			return content ? h(Design.Text, { variant: variant, color: color }, content) : null
		}
		var body
		if (!t) {
			body = h(
				Design.Text,
				{ variant: 'text-sm/medium', color: 'text-muted', style: { marginTop: 8 } },
				s.autoEnabled
					? 'Nothing is playing. Last.fm is checked ' + (s.pollSeconds || 30) + ' seconds apart.'
					: 'Nothing is shown yet. Paste a SoundCloud link below to put a track on your profile.',
			)
		} else {
			var side = s.statusText === 1 && s.showArtist && t.artist ? t.artist : s.statusText === 2 ? t.title : 'SoundCloud'
			body = h(
				RN.View,
				{ style: st.row },
				h(RN.View, { style: st.accent }),
				s.showArtwork
					? h(RN.View, { style: st.art }, coverOf(s, t) ? h(RN.Image, { source: { uri: coverOf(s, t) }, style: st.artImage }) : null)
					: null,
				h(
					RN.View,
					{ style: st.text },
					line('Listening to ' + side + (fromAuto ? ' · automatic' : ''), 'text-xs/semibold', 'text-muted'),
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
			h(Design.Text, { variant: 'text-xs/semibold', color: 'text-muted' }, 'LIVE PREVIEW' + (s.output === 'rich' ? ' · SHOWN BY RICH PRESENCE' : '')),
			body,
			t && s.showButton && s.output !== 'rich'
				? h(RN.View, { style: st.button }, h(Design.Text, { variant: 'text-sm/semibold' }, buttonOf(s, t).label))
				: null,
			status.state === 'loading' ? h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted', style: { marginTop: 8 } }, status.text) : null,
			status.state === 'error' || status.state === 'ended' || status.state === 'hidden'
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
			return save(o).then(function () {
				restartPolling()
				return apply()
			})
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
		function testLastfm() {
			fetchNowPlaying().then(
				function (np) { toast(np ? 'Connected. Now playing: ' + np.title + (np.artist ? ' by ' + np.artist : '') : 'Connected. Nothing is playing right now.') },
				function (e) { toast(String((e && e.message) || e)) },
			)
		}

		var children = [
			section(
				'Automatic (Last.fm)',
				toggle('Detect what I am playing', 'Follows your Last.fm now playing, so the status changes by itself with each song', 'autoEnabled'),
				row('How to set it up', '1. Install Pano Scrobbler and let it scrobble the SoundCloud app. 2. Make a free key at last.fm/api/account/create. 3. Enter your Last.fm name and the key below.'),
			),
			h(Field, {
				key: 'lfmUser',
				label: 'Last.fm username',
				placeholder: 'your-name',
				maxLength: 40,
				value: settings.lfmUser,
				onCommit: function (value) { set('lfmUser', value) },
			}),
			h(Field, {
				key: 'lfmKey',
				label: 'Last.fm API key',
				description: 'The API key, not the shared secret. It only reads your public scrobbles.',
				placeholder: '32 letters and numbers',
				maxLength: 64,
				value: settings.lfmKey,
				onCommit: function (value) { set('lfmKey', value) },
			}),
			section('Check', row('Test Last.fm', 'Check the name and key, and what is playing now', testLastfm)),
			settings.autoEnabled ? radio('Check how often', 'pollSeconds', POLLS) : null,
			section(
				'Or show a track by link',
				h(Design.TextInput, {
					label: 'SoundCloud link',
					description: 'A track or playlist link. The text SoundCloud copies when you share also works. Automatic mode wins while a song is playing.',
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
				toggle('Hide while Spotify is playing', 'Steps aside so you do not show two "Listening to" cards at once', 'hideWithSpotify'),
				toggle('Check the clipboard when Discord opens', 'In SoundCloud tap Share, then Copy link. Opening Discord shows it. Android may notify you that Discord read the clipboard.', 'clipboardOnOpen'),
			),
			radio('Show it with', 'output', OUTPUTS),
			section(
				'Appearance',
				toggle('Artwork', 'Show the track cover as the large image', 'showArtwork'),
				toggle('Find missing covers', "When Last.fm has no cover, look the song up in Apple Music's public search. Only an exact title and artist match is used. This sends the artist and title to Apple.", 'coverLookup'),
				toggle('Use a SoundCloud cover when none is found', 'Shows an orange SoundCloud cover instead of an empty box', 'fallbackCover'),
				toggle('Artist', 'Show the artist under the title', 'showArtist'),
				toggle('Listen button', 'A button on your profile. Automatic tracks open a SoundCloud search for the song.', 'showButton'),
			),
			settings.showButton
				? h(Field, {
						key: 'buttonLabel',
						label: 'Button text',
						description: 'Up to 32 characters. Used for tracks with a link.',
						placeholder: 'Listen on SoundCloud',
						maxLength: 32,
						value: settings.buttonLabel,
						onCommit: function (value) { set('buttonLabel', value) },
				  })
				: null,
			h(Field, {
				key: 'smallIcon',
				label: 'Small icon link',
				description: 'Optional. A link to a small SoundCloud logo, or any image. It shows in the corner of the cover.',
				placeholder: 'https://',
				maxLength: 300,
				value: settings.smallIcon,
				onCommit: function (value) { set('smallIcon', value) },
			}),
			radio('Timer', 'timerMode', TIMER_MODES),
			radio('Status text', 'statusText', STATUS_TEXTS),
			section(
				'Actions',
				row('Restart the timer', 'Start counting from now', function () {
					var t = effective(read())
					if (!t) return toast('Show a track first')
					if (auto && read().autoEnabled) auto.startedAt = Date.now()
					else save({ current: Object.assign({}, t, { startedAt: Date.now() }) })
					apply()
				}),
				row('Stop showing', 'Remove SoundCloud from your profile', function () {
					stopShowing()
					toast('Status cleared')
				}),
			),
			section(
				'How it works',
				row('Why Last.fm?', 'Discord cannot see what other apps are playing. A scrobbler app can, because it reads the media notification. It reports to Last.fm, and this plugin reads Last.fm.'),
				row('What shows', 'Title, artist and cover come from Last.fm. The button opens a SoundCloud search, because Last.fm does not know the SoundCloud link. Paste a link to get the exact one.'),
				row('Pausing', 'Last.fm does not always notice a pause. With a known length the status ends on its own when the song does.'),
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
			auto = null
			cleanup(function () {
				active = false
				clearTimeout(endTimer)
				clearInterval(pollTimer)
				clearTimeout(missTimer)
				missPending = false
				try { clearRich() } catch (e) {}
				try { dispatchNow(null) } catch (e) {}
			})
			Promise.resolve(storage.cache || storage.get()).then(function () {
				if (!active) return
				if (read().applyOnStart) apply()
				restartPolling()
				if (read().clipboardOnOpen) setTimeout(function () { checkClipboard(true) }, 2000)
			})
			// Opening Discord again checks the clipboard (if you asked for that) and Last.fm.
			try {
				var AppState = valenced.react.ReactNative.AppState
				var sub = AppState.addEventListener('change', function (state) {
					if (state !== 'active') return
					if (read().clipboardOnOpen) setTimeout(function () { checkClipboard(true) }, 800)
					if (read().autoEnabled) poll()
				})
				cleanup(function () { try { sub.remove() } catch (e) {} })
			} catch (e) {}
			// Discord drops local activities on reconnect, so the last one has to be sent again.
			cleanup(
				valenced.discord.flux.onFluxEventDispatched('CONNECTION_OPEN', function (payload) {
					lastSentJson = ''
					setTimeout(function () { apply() }, 3000)
					return payload
				}),
			)
			// Spotify starting or stopping decides whether this status steps aside.
			;['SPOTIFY_PLAYER_STATE', 'SPOTIFY_PLAYER_PLAY'].forEach(function (name) {
				try {
					cleanup(
						valenced.discord.flux.onFluxEventDispatched(name, function (payload) {
							if (read().hideWithSpotify) setTimeout(function () { apply() }, 1500)
							return payload
						}),
					)
				} catch (e) {}
			})
		},
	})
	return exports
})({})
