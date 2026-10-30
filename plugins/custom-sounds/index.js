(function (exports) {
	/*
	 * Custom Sounds for Valenced.
	 * Replaces Discord's own sounds with links you choose, per sound, with seasonal packs, a soundboard
	 * browser and shareable packs. The list of Discord's sounds and its seasonal sound files comes from
	 * ScattrdBlade's Vencord CustomSounds plugin; the code is written from scratch for Valenced.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * How it works: Discord plays every sound by name through the native DCDSoundManager. This plugin
	 * watches those calls. For a sound you changed, it plays your file (downloaded once to the app
	 * cache) in its place, and passes stop/pause for that name on to your file.
	 */
	var defaults = { enabled: true, activePack: 'none', autoPacks: false, sounds: {}, userPacks: {} }
	var CDN_SOUNDBOARD = 'https://cdn.discordapp.com/soundboard-sounds/'
	var MAX_BYTES = 12 * 1024 * 1024
	var VOLUMES = [25, 50, 75, 100, 150, 200, 300, 500]

	var SOUNDS = [
	{
		"id": "message1",
		"name": "Message 1 (All Message Notifications)",
		"cat": "Messages & pings",
		"seasonal": {
			"halloween_message1": "https://discord.com/assets/c269de500ca3cb7b.mp3"
		}
	},
	{
		"id": "message2",
		"name": "Message 2 (Friend Started Playing)",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "message3",
		"name": "Message 3 (Current Channel, if enabled in Discord)",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "mention1",
		"name": "Mention 1 (Unused by Discord)",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "mention2",
		"name": "Mention 2 (Unused by Discord)",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "mention3",
		"name": "Mention 3 (Audio Device Changed)",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "ducky_message1",
		"name": "Ducky Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "asmr_message1",
		"name": "ASMR Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "bit_message1",
		"name": "Bit Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "bop_message1",
		"name": "Bop Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "lofi_message1",
		"name": "LoFi Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "poggermode_message_send",
		"name": "Poggermode Message",
		"cat": "Messages & pings",
		"seasonal": {}
	},
	{
		"id": "call_calling",
		"name": "Call Calling",
		"cat": "Calls",
		"seasonal": {
			"halloween_call_calling": "https://discord.com/assets/ef24e229a3413c8a.mp3",
			"winter_call_calling": "https://discord.com/assets/a07935fe464c324c.mp3"
		}
	},
	{
		"id": "call_ringing",
		"name": "Call Ringing",
		"cat": "Calls",
		"seasonal": {
			"halloween_call_ringing": "https://discord.com/assets/7a287e2f88531f25.mp3",
			"winter_call_ringing": "https://discord.com/assets/daf6c21d9f92979a.mp3",
			"call_ringing_beat": "https://discord.com/assets/574220f72e718dad.mp3",
			"call_ringing_snow_halation": "https://discord.com/assets/82954088613583bc.mp3",
			"call_ringing_snowsgiving": "https://discord.com/assets/4261355196740dab.mp3"
		}
	},
	{
		"id": "disconnect",
		"name": "Disconnect",
		"cat": "Calls",
		"seasonal": {
			"halloween_disconnect": "https://discord.com/assets/9b8ef0a59d731dd6.mp3",
			"winter_disconnect": "https://discord.com/assets/600991ad4560f288.mp3"
		}
	},
	{
		"id": "reconnect",
		"name": "Reconnect",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "user_join",
		"name": "User Join",
		"cat": "Calls",
		"seasonal": {
			"halloween_user_join": "https://discord.com/assets/00b48ea9fc787786.mp3",
			"winter_user_join": "https://discord.com/assets/b766ee70384a56ce.mp3"
		}
	},
	{
		"id": "user_leave",
		"name": "User Leave",
		"cat": "Calls",
		"seasonal": {
			"halloween_user_leave": "https://discord.com/assets/c9b6b9d1ef992f1b.mp3",
			"winter_user_leave": "https://discord.com/assets/cf2c36fde50eb05d.mp3"
		}
	},
	{
		"id": "user_moved",
		"name": "User Moved",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "stage_waiting",
		"name": "Stage Waiting",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "hang_status_select",
		"name": "Hang Status Select",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "ptt_start",
		"name": "PTT Start",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "ptt_stop",
		"name": "PTT Stop",
		"cat": "Calls",
		"seasonal": {}
	},
	{
		"id": "mute",
		"name": "Mute",
		"cat": "Voice controls",
		"seasonal": {
			"halloween_mute": "https://discord.com/assets/d5e69d2c2aac0a27.mp3",
			"winter_mute": "https://discord.com/assets/81034fa14558e50f.mp3"
		}
	},
	{
		"id": "unmute",
		"name": "Unmute",
		"cat": "Voice controls",
		"seasonal": {
			"halloween_unmute": "https://discord.com/assets/6f0d538ed066a1a6.mp3",
			"winter_unmute": "https://discord.com/assets/b2c49178b1a4e3d9.mp3"
		}
	},
	{
		"id": "deafen",
		"name": "Deafen",
		"cat": "Voice controls",
		"seasonal": {
			"halloween_deafen": "https://discord.com/assets/514663b657bc4c7d.mp3",
			"winter_deafen": "https://discord.com/assets/70fe5e248588bb13.mp3"
		}
	},
	{
		"id": "undeafen",
		"name": "Undeafen",
		"cat": "Voice controls",
		"seasonal": {
			"halloween_undeafen": "https://discord.com/assets/4dfa756a71484219.mp3",
			"winter_undeafen": "https://discord.com/assets/5b518eba0a73ec4a.mp3"
		}
	},
	{
		"id": "camera_on",
		"name": "Camera On",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "camera_off",
		"name": "Camera Off",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "stream_started",
		"name": "Stream Started",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "stream_ended",
		"name": "Stream Ended",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "stream_user_joined",
		"name": "Stream User Joined",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "stream_user_left",
		"name": "Stream User Left",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "clip_save",
		"name": "Clip Save",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "clip_error",
		"name": "Clip Error",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "voice_message_recording_stopped",
		"name": "Voice Message Recording Stopped",
		"cat": "Camera & streams",
		"seasonal": {}
	},
	{
		"id": "activity_end",
		"name": "Activity End",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "activity_launch",
		"name": "Activity Launch",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "activity_user_join",
		"name": "Activity User Join",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "activity_user_left",
		"name": "Activity User Left",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "ddr-down",
		"name": "DDR Down",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "ddr-left",
		"name": "DDR Left",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "ddr-right",
		"name": "DDR Right",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "ddr-up",
		"name": "DDR Up",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "discodo",
		"name": "Discodo",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_bark",
		"name": "Doggo Game: Bark (Game Start)",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_cat",
		"name": "Doggo Game: Cat Death",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_cat_hurt",
		"name": "Doggo Game: Cat Hurt",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_dog_death",
		"name": "Doggo Game: Dog Death",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_dog_hurt",
		"name": "Doggo Game: Dog Hurt",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_slash",
		"name": "Doggo Game: Knife Slash",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_music",
		"name": "Doggo Game: Music",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_death",
		"name": "Doggo Game: Player Death",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_human_hit",
		"name": "Doggo Game: Player Hit",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_rat",
		"name": "Doggo Game: Rat Attack",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_rat_hit",
		"name": "Doggo Game: Rat Hit",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_skeleton",
		"name": "Doggo Game: Skeleton Attack",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_skeleton_die",
		"name": "Doggo Game: Skeleton Death",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_skeleton_hit",
		"name": "Doggo Game: Skeleton Hit",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_zombie",
		"name": "Doggo Game: Zombie Attack",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "doggo_zombie_hit",
		"name": "Doggo Game: Zombie Hit",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "human_man",
		"name": "Human Man",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "overlayunlock",
		"name": "Overlay Unlock",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "poggermode_achievement_unlock",
		"name": "Poggermode Achievement",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "poggermode_applause",
		"name": "Poggermode Applause",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "poggermode_enabled",
		"name": "Poggermode Enabled",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "robot_man",
		"name": "Robot Man",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "vibing_wumpus",
		"name": "Vibing Wumpus",
		"cat": "Activities & games",
		"seasonal": {}
	},
	{
		"id": "success",
		"name": "Success",
		"cat": "Other",
		"seasonal": {}
	}
]

	// Seasonal files Discord itself ships. A pack is every sound that has a file for that season.
	var SEASONS = {
		halloween: { name: 'Halloween', blurb: 'Spooky versions of calls, mute, join and leave', from: 'Oct 15', to: 'Nov 2', test: function (m, d) { return (m === 10 && d >= 15) || (m === 11 && d <= 2) } },
		winter: { name: 'Winter', blurb: 'Snowy versions of calls, mute, join and leave', from: 'Dec 1', to: 'Jan 5', test: function (m, d) { return m === 12 || (m === 1 && d <= 5) } },
	}
	var VARIANT_NAMES = { halloween: 'Halloween', winter: 'Winter', beat: 'Beat', snow_halation: 'Snow Halation', snowsgiving: 'Snowsgiving' }

	var storage
	var sm // DCDSoundManager
	var orig = {} // its methods before they were patched
	var ready = {} // url -> { key, path }
	var loading = {} // url -> promise
	var failed = {} // url -> message
	var learned = { variant: -1, path: -1, writer: '' }
	var heard = [] // { raw, at, count, replaced }
	var diag = []
	var listeners = []

	function setting(key) {
		var s = storage && storage.cache
		return s && s[key] !== undefined ? s[key] : defaults[key]
	}
	function changed() {
		listeners.slice().forEach(function (l) { try { l() } catch (e) {} })
	}
	function note(line) {
		diag.push(new Date().toTimeString().slice(0, 8) + ' ' + line)
		if (diag.length > 40) diag.shift()
		changed()
	}
	function errorText(e) { return String((e && e.message) || e) }
	function native(name) {
		var RN = valenced.react.ReactNative
		return RN.NativeModules && RN.NativeModules[name]
	}
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_CUSTOM_SOUNDS', { text: String(text) }) } catch (e) {}
	}
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
	function keyOf(name) { return String(name || '').toLowerCase().replace(/\.[a-z0-9]{2,4}$/, '').replace(/[^a-z0-9]/g, '') }
	function hash(text) {
		var n = 5381
		for (var i = 0; i < text.length; i++) n = ((n << 5) + n + text.charCodeAt(i)) | 0
		return (n >>> 0).toString(36)
	}
	function soundInfo(key) {
		for (var i = 0; i < SOUNDS.length; i++) if (keyOf(SOUNDS[i].id) === key) return SOUNDS[i]
	}
	function variantsOf(sound) {
		var out = []
		Object.keys(sound.seasonal || {}).forEach(function (k) {
			var name = k.replace(sound.id, '').replace(/^_+|_+$/g, '').replace(/^(call_ringing|call_calling)_?/, '') || k
			var label = VARIANT_NAMES[k.replace('_' + sound.id, '').replace(sound.id + '_', '')] || VARIANT_NAMES[name] || name.replace(/_/g, ' ')
			out.push({ id: k, label: label, url: sound.seasonal[k] })
		})
		return out
	}

	// ---- What each sound should do -------------------------------------------------------------
	function packs() {
		var list = [{ id: 'none', name: 'No pack', blurb: 'Every sound stays as Discord plays it unless you changed it', builtin: true }]
		Object.keys(SEASONS).forEach(function (id) { list.push({ id: id, name: SEASONS[id].name, blurb: SEASONS[id].blurb, builtin: true, season: SEASONS[id] }) })
		var mine = setting('userPacks') || {}
		Object.keys(mine).forEach(function (id) { if (mine[id] && !mine[id].deleted) list.push({ id: id, name: mine[id].name || 'Pack', blurb: Object.keys(mine[id].sounds || {}).length + ' sounds', builtin: false }) })
		return list
	}

	function packSounds(id) {
		if (SEASONS[id]) {
			var out = {}
			SOUNDS.forEach(function (s) {
				var hit = Object.keys(s.seasonal || {}).filter(function (k) { return k.indexOf(id + '_') === 0 })[0]
				if (hit) out[keyOf(s.id)] = s.seasonal[hit]
			})
			return out
		}
		var mine = (setting('userPacks') || {})[id]
		var map = {}
		if (mine && !mine.deleted) Object.keys(mine.sounds || {}).forEach(function (k) { if (mine.sounds[k]) map[keyOf(k)] = mine.sounds[k] })
		return map
	}

	function activePackId() {
		if (setting('autoPacks')) {
			var now = new Date()
			var ids = Object.keys(SEASONS)
			for (var i = 0; i < ids.length; i++) if (SEASONS[ids[i]].test(now.getMonth() + 1, now.getDate())) return ids[i]
		}
		var chosen = setting('activePack') || 'none'
		if (chosen === 'none' || SEASONS[chosen]) return chosen
		var mine = (setting('userPacks') || {})[chosen]
		return mine && !mine.deleted ? chosen : 'none'
	}

	function entryOf(key) {
		var all = setting('sounds') || {}
		return Object.assign({ mode: 'pack', url: '', label: '', volume: 100 }, all[key] || {})
	}

	/** What happens to this sound: null (Discord's own), { off }, or { url, label, volume, from }. */
	function resolve(key) {
		if (!setting('enabled') || !key) return null
		var e = entryOf(key)
		if (e.mode === 'off') return { off: true }
		if (e.mode === 'custom' && e.url) return { url: e.url, label: e.label || 'Custom link', volume: e.volume, from: 'custom' }
		if (e.mode === 'discord') return null
		var pack = activePackId()
		var map = pack !== 'none' ? packSounds(pack) : {}
		if (map[key]) return { url: map[key], label: 'Pack', volume: e.volume, from: 'pack:' + pack }
		return null
	}

	function describe(key) {
		var e = entryOf(key)
		if (!setting('enabled')) return 'Custom sounds are off'
		var r = resolve(key)
		var tail = r && !r.off && failed[r.url] ? ' · could not load' : ''
		if (e.mode === 'off') return 'Silent'
		if (e.mode === 'custom') return (e.url ? 'Custom: ' + (e.label || e.url.replace(/^https?:\/\//, '').slice(0, 40)) : 'Custom (no link yet)') + tail
		if (e.mode === 'discord') return 'Discord default'
		if (r) return 'From the ' + (SEASONS[activePackId()] ? SEASONS[activePackId()].name : packs().filter(function (p) { return p.id === activePackId() })[0].name) + ' pack' + tail
		return 'Discord default'
	}

	// ---- Getting a sound ready -----------------------------------------------------------------
	function toBase64(buffer) {
		var bytes = new Uint8Array(buffer)
		var out = ''
		for (var i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000))
		return btoa(out)
	}
	function extensionOf(url, type) {
		var m = /\.(mp3|ogg|oga|wav|m4a|aac|opus|flac)(\?|#|$)/i.exec(url)
		if (m) return m[1].toLowerCase()
		if (/ogg/.test(type || '')) return 'ogg'
		if (/wav/.test(type || '')) return 'wav'
		if (/mp4|m4a|aac/.test(type || '')) return 'm4a'
		return 'mp3'
	}

	/** Downloads the sound and writes it to the app cache. Resolves to the paths to try. */
	async function download(url) {
		var files = native('DCDFileManager')
		if (!files || typeof files.writeFile !== 'function') throw new Error('The file module (DCDFileManager) was not found')
		var res = await fetch(url)
		if (!res.ok) throw new Error('Could not download it (' + res.status + ')')
		var buffer = await res.arrayBuffer()
		if (buffer.byteLength > MAX_BYTES) throw new Error('That file is bigger than 12 MB')
		var name = 'cs-' + hash(url) + '.' + extensionOf(url, res.headers && res.headers.get && res.headers.get('content-type'))
		var written
		var dirs = ['cache', 'documents']
		var base = toBase64(buffer)
		var lastError
		for (var i = 0; i < dirs.length; i++) {
			try {
				written = await files.writeFile(dirs[i], name, base, 'base64')
				learned.writer = dirs[i]
				break
			} catch (e) { lastError = e }
		}
		if (written === undefined && lastError) throw lastError
		var paths = []
		if (typeof written === 'string' && written) paths.push(written)
		try {
			var constants = typeof files.getConstants === 'function' ? files.getConstants() : files
			var root = constants && (learned.writer === 'cache' ? constants.CacheDirPath || constants.CachesDirPath : constants.DocumentsDirPath)
			if (root) paths.push(String(root).replace(/\/$/, '') + '/' + name)
		} catch (e) {}
		paths.push(name)
		note('wrote ' + name + ' -> ' + paths.join(' | '))
		return paths.filter(function (p, i) { return paths.indexOf(p) === i })
	}

	function callPrepare(args) {
		return new Promise(function (resolve, reject) {
			var timer = setTimeout(function () { reject(new Error('prepare never answered')) }, 4000)
			function done(error) {
				clearTimeout(timer)
				if (error) reject(new Error(typeof error === 'string' ? error : JSON.stringify(error)))
				else resolve()
			}
			try {
				var result = orig.prepare.apply(sm, args.concat([function (error) { done(error) }]))
				if (result && typeof result.then === 'function') result.then(function () { done() }, function (e) { done(e || 'rejected') })
			} catch (e) {
				clearTimeout(timer)
				reject(e)
			}
		})
	}

	// GUESS: the shape of prepare(uri, usage, key, callback). Tried in order; the first to work is remembered.
	var VARIANTS = [
		function (u, k) { return [u, 'notification', k] },
		function (u, k) { return [u, 'ringtone', k] },
		function (u, k) { return [u, 0, k] },
		function (u, k) { return [u, k] },
	]

	function ensureReady(url) {
		if (ready[url]) return Promise.resolve(ready[url])
		if (loading[url]) return loading[url]
		loading[url] = (async function () {
			try {
				if (!sm || typeof orig.prepare !== 'function') throw new Error('The sound player (DCDSoundManager) was not found')
				var key = 'cs-' + hash(url)
				var local = /^(file:|\/)/.test(url)
				var paths = local ? [url] : await download(url)
				var candidates = []
				paths.forEach(function (p) {
					candidates.push(p)
					if (!/^file:/.test(p) && p.charAt(0) === '/') candidates.push('file://' + p)
				})
				if (!local && /^https?:/.test(url)) candidates.push(url)
				var variants = learned.variant >= 0 ? [learned.variant] : VARIANTS.map(function (v, i) { return i })
				var lastError
				for (var c = 0; c < candidates.length; c++)
					for (var v = 0; v < variants.length; v++) {
						try {
							await callPrepare(VARIANTS[variants[v]](candidates[c], key))
							learned.variant = variants[v]
							note('ready with variant ' + (variants[v] + 1) + ' and ' + candidates[c])
							ready[url] = { key: key, path: candidates[c] }
							delete failed[url]
							return ready[url]
						} catch (e) {
							lastError = e
						}
					}
				throw lastError || new Error('prepare failed')
			} catch (e) {
				failed[url] = errorText(e)
				note('could not load ' + url.slice(0, 50) + ': ' + failed[url])
				throw e
			} finally {
				delete loading[url]
				changed()
			}
		})()
		return loading[url]
	}

	/** Gets every sound you changed ready ahead of time, so the first ring is not late. */
	function warm() {
		var urls = {}
		var all = setting('sounds') || {}
		var pack = activePackId() !== 'none' ? packSounds(activePackId()) : {}
		Object.keys(all).concat(Object.keys(pack)).forEach(function (key) {
			var r = resolve(key)
			if (r && !r.off && r.url) urls[r.url] = 1
		})
		return Object.keys(urls).reduce(function (chain, url) {
			return chain.then(function () { return ensureReady(url).catch(function () {}) })
		}, Promise.resolve())
	}

	function setVolume(key, percent) {
		var v = Number(percent)
		if (!isFinite(v)) v = 100
		if (typeof orig.setVolume === 'function') {
			try { orig.setVolume(key, Math.max(0, v) / 100) } catch (e) {} // GUESS: setVolume(key, 0..1)
		}
	}

	/** Plays a link right now, for the preview buttons. */
	async function previewUrl(url, volume) {
		try {
			var slot = await ensureReady(url)
			setVolume(slot.key, volume)
			orig.play.call(sm, slot.key)
		} catch (e) {
			toast('Could not play it: ' + errorText(e))
		}
	}

	/** Plays Discord's own version of a sound, for the preview buttons. */
	function previewOriginal(id) {
		try { orig.play.call(sm, id) } catch (e) { toast('Could not play it: ' + errorText(e)) }
	}

	// ---- Listening to Discord ------------------------------------------------------------------
	function hear(raw) {
		var key = keyOf(raw)
		var item = heard.filter(function (x) { return x.key === key })[0]
		if (!item) {
			item = { key: key, raw: String(raw), count: 0 }
			heard.unshift(item)
			if (heard.length > 30) heard.pop()
		}
		item.count++
		item.at = Date.now()
		return item
	}

	function installPatches(cleanup) {
		sm = native('DCDSoundManager')
		if (!sm) return note('The sound player (DCDSoundManager) is missing on this phone')
		;['prepare', 'play', 'stop', 'pause', 'release', 'setVolume', 'setNumberOfLoops', 'setCurrentTime', 'setPan', 'getCurrentTime'].forEach(function (m) {
			if (typeof sm[m] === 'function') orig[m] = sm[m]
		})
		note('DCDSoundManager methods: ' + Object.keys(sm).join(', '))
		var files = native('DCDFileManager')
		note('DCDFileManager methods: ' + (files ? Object.keys(files).join(', ') : 'missing'))

		if (typeof orig.play === 'function')
			cleanup(
				valenced.patcher.instead(sm, 'play', function (args, original) {
					var name = args[0]
					if (typeof name !== 'string') return Reflect.apply(original, this, args)
					var item = hear(name)
					var r
					try { r = resolve(item.key) } catch (e) {}
					item.replaced = !!r
					changed()
					if (!r) return Reflect.apply(original, this, args)
					if (r.off) return undefined
					var slot = ready[r.url]
					if (!slot) {
						// Not downloaded yet: let Discord's own sound play this time, and get ours ready.
						ensureReady(r.url).catch(function () {})
						return Reflect.apply(original, this, args)
					}
					setVolume(slot.key, r.volume)
					return Reflect.apply(original, this, [slot.key].concat(args.slice(1)))
				}),
			)

		// Stopping, pausing and looping a sound that was replaced has to reach the file that is playing.
		;['stop', 'pause', 'setNumberOfLoops', 'setCurrentTime', 'setPan'].forEach(function (m) {
			if (typeof orig[m] !== 'function') return
			cleanup(
				valenced.patcher.instead(sm, m, function (args, original) {
					var name = args[0]
					if (typeof name === 'string') {
						try {
							var r = resolve(keyOf(name))
							if (r && r.off) return undefined
							if (r && ready[r.url]) return Reflect.apply(original, this, [ready[r.url].key].concat(args.slice(1)))
						} catch (e) {}
					}
					return Reflect.apply(original, this, args)
				}),
			)
		})
	}

	// ---- Talking to Discord's API ---------------------------------------------------------------
	async function apiGet(path) {
		var f = valenced.modules.finders
		var http = f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0] || f.lookupModule(f.filters.withProps('get', 'post', 'patch'))[0]
		if (http && typeof http.get === 'function') {
			try {
				var answer = await http.get({ url: path })
				return answer && answer.body
			} catch (e) {
				if (e && (e.status != null || e.body != null)) throw new Error((e.body && e.body.message) || 'Discord said no (' + e.status + ')')
			}
		}
		var auth = f.lookupModule(f.filters.withProps('getToken'))[0]
		var token = auth && auth.getToken && auth.getToken()
		if (!token) throw new Error('Could not find a way to reach Discord')
		var res = await fetch('https://discord.com/api/v9' + path, { headers: { Authorization: token } })
		if (!res.ok) throw new Error('Discord said no (' + res.status + ')')
		return res.json()
	}

	function guildList() {
		var guilds = valenced.discord.flux.Stores.GuildStore.getGuilds() || {}
		return Object.keys(guilds).map(function (id) { return guilds[id] }).filter(Boolean).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)) })
	}

	// ---- Settings: building blocks -------------------------------------------------------------
	function chevron() {
		var Design = valenced.discord.design.Design
		var id = valenced.assets.getAssetIdByName('ChevronSmallRightIcon')
		return id != null && Design.TableRow && Design.TableRow.Icon ? h(Design.TableRow.Icon, { source: id }) : undefined
	}

	/** A text box that saves a moment after you stop typing. */
	function Field(props) {
		var React = valenced.react.React
		var state = React.useState(props.value == null ? '' : String(props.value))
		var value = state[0]
		React.useEffect(
			function () {
				if (value === (props.value == null ? '' : String(props.value))) return
				var timer = setTimeout(function () { props.onCommit(value) }, props.instant ? 0 : 350)
				return function () { clearTimeout(timer) }
			},
			[value],
		)
		return h(valenced.discord.design.Design.TextInput, {
			label: props.label,
			description: props.description,
			placeholder: props.placeholder,
			size: 'md',
			value: value,
			onChange: function (v) { state[1](v); if (props.onDraft) props.onDraft(v) },
		})
	}

	function hostOf(url) {
		return String(url || '').replace(/^https?:\/\//, '').replace(/^www\./, '').slice(0, 44)
	}

	function copyText(text, what) {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(text)
			toast((what || 'Text') + ' copied')
		} catch (e) { toast('Could not copy') }
	}

	// ---- Settings ------------------------------------------------------------------------------
	function SettingsComponent(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var data = Object.assign({}, defaults, json.use())
		var viewState = React.useState({ tab: 'sounds', stack: [] })
		var view = viewState[0]
		var uiState = React.useState({ search: '', packName: '', packUrl: '', busy: false, link: '', test: '', board: null, boardSearch: '', pickSearch: '' })
		var u = uiState[0]
		function setUi(patch) { uiState[1](function (p) { return Object.assign({}, p, patch) }) }
		var tickState = React.useState(0)
		var topScreen = view.stack[view.stack.length - 1]
		var boardSource = topScreen && topScreen.name === 'board' ? topScreen.source : null
		React.useEffect(function () {
			if (!boardSource) return
			var cancelled = false
			setUi({ board: null, boardSearch: '' })
			apiGet(boardSource === 'default' ? '/soundboard-default-sounds' : '/guilds/' + boardSource + '/soundboard-sounds').then(
				function (body) { if (!cancelled) setUi({ board: { list: Array.isArray(body) ? body : (body && body.items) || [] } }) },
				function (e) { if (!cancelled) setUi({ board: { error: errorText(e) } }) },
			)
			return function () { cancelled = true }
		}, [boardSource])
		React.useEffect(function () {
			var update = function () { tickState[1](function (n) { return n + 1 }) }
			listeners.push(update)
			return function () { listeners = listeners.filter(function (l) { return l !== update }) }
		}, [])

		function setTab(tab) { viewState[1]({ tab: tab, stack: [] }) }
		function go(screen) { viewState[1]({ tab: view.tab, stack: view.stack.concat([screen]) }) }
		function back() { viewState[1]({ tab: view.tab, stack: view.stack.slice(0, -1) }) }
		function home() { viewState[1]({ tab: view.tab, stack: [] }) }
		function put(key, patch) {
			var all = {}
			all[key] = patch
			json.set({ sounds: all })
			setTimeout(warm, 400)
		}
		function row(label, subLabel, onPress, extra) {
			return h(Design.TableRow, Object.assign({ key: String(label) + String(subLabel || ''), label: label, subLabel: subLabel, onPress: onPress, trailing: onPress ? chevron() : undefined }, extra || {}))
		}
		function group(title, rows) { return h(Design.TableRowGroup, { key: 'g:' + title, title: title }, rows.filter(Boolean)) }
		function button(text, onPress, variant) { return h(Design.Button, { key: 'b:' + text, text: text, variant: variant || 'secondary', size: 'md', onPress: onPress }) }
		function note2(text) { return h(Design.Text, { key: 'n:' + text.slice(0, 24), variant: 'text-sm/medium', color: 'text-muted', style: { paddingHorizontal: 4 } }, text) }
		function radio(title, value, items, onChange) {
			return h(
				Design.TableRadioGroup,
				{ key: 'r:' + title, title: title, value: value, onChange: onChange },
				items.map(function (r) { return h(Design.TableRadioRow, { key: r.value, label: r.label, subLabel: r.subLabel, value: r.value }) }),
			)
		}
		function page(children) {
			return h(
				RN.ScrollView,
				{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 48 }, keyboardShouldPersistTaps: 'handled' },
				h(Design.Stack, { style: { paddingVertical: 16, paddingHorizontal: 12 }, spacing: 20 }, children.filter(Boolean)),
			)
		}
		function title(text, sub) {
			return h(
				RN.View,
				{ key: 't:' + text, style: { paddingHorizontal: 4 } },
				h(Design.Text, { variant: 'heading-lg/bold' }, text),
				sub ? h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, sub) : null,
			)
		}
		function backBar() { return button('‹ Back', back) }

		// ---- one list of every sound, used by the Sounds tab and the "use for" picker
		function soundGroups(search, onPick) {
			var q = String(search || '').toLowerCase().trim()
			var order = ['Messages & pings', 'Calls', 'Voice controls', 'Camera & streams', 'Activities & games', 'Other']
			return order
				.map(function (cat) {
					var rows = SOUNDS.filter(function (s) { return s.cat === cat && (!q || s.name.toLowerCase().indexOf(q) >= 0 || s.id.indexOf(q) >= 0) }).map(function (s) {
						var key = keyOf(s.id)
						return row(s.name, onPick ? 'Replace this sound' : describe(key), function () { onPick ? onPick(s) : go({ name: 'edit', key: key, title: s.name, id: s.id }) })
					})
					return rows.length ? group(cat, rows) : null
				})
				.filter(Boolean)
		}

		// ---- Edit one sound
		function EditScreen(screen) {
			var key = screen.key
			var e = entryOf(key)
			var sound = soundInfo(key)
			var r = resolve(key)
			var variants = sound ? variantsOf(sound) : []
			var url = r && !r.off ? r.url : ''
			return page([
				backBar(),
				title(screen.title, 'Sound name: ' + screen.id),
				radio(
					'What should play',
					e.mode,
					[
						{ value: 'pack', label: 'Follow the pack', subLabel: activePackId() === 'none' ? 'No pack is on, so Discord\'s own sound plays' : 'Uses the ' + (SEASONS[activePackId()] ? SEASONS[activePackId()].name : 'selected') + ' pack when it has this sound' },
						{ value: 'discord', label: 'Discord default', subLabel: 'Always Discord\'s own sound, even when a pack is on' },
						{ value: 'custom', label: 'Custom link', subLabel: 'Your own sound from a link' },
						{ value: 'off', label: 'Silent', subLabel: 'Never play this sound' },
					],
					function (mode) { put(key, { mode: mode }) },
				),
				e.mode === 'custom'
					? h(
							RN.View,
							{ key: 'custom', style: { gap: 12 } },
							h(Field, { key: key + ':url', label: 'Sound link', description: 'A direct link to an mp3, ogg, wav or m4a file', placeholder: 'https://example.com/sound.mp3', value: e.url, onCommit: function (v) { put(key, { url: v.trim(), label: '' }) } }),
							h(Field, { key: key + ':label', label: 'Name (optional)', placeholder: 'My ping', value: e.label, onCommit: function (v) { put(key, { label: v }) } }),
					  )
					: null,
				url && failed[url] ? note2('Could not load this sound: ' + failed[url]) : null,
				variants.length
					? group(
							'Discord\'s own variants',
							variants.map(function (v) {
								return row(v.label, e.url === v.url && e.mode === 'custom' ? 'In use' : 'Tap to use it', function () { put(key, { mode: 'custom', url: v.url, label: 'Discord ' + v.label }); toast(v.label + ' set') })
							}),
					  )
					: null,
				radio(
					'Volume',
					String(e.volume || 100),
					VOLUMES.map(function (v) { return { value: String(v), label: v + '%', subLabel: v === 100 ? 'Normal' : undefined } }),
					function (v) { put(key, { volume: Number(v) }) },
				),
				group('Try it', [
					url ? row('Play my version', hostOf(url), function () { previewUrl(url, e.volume) }) : null,
					row('Play Discord\'s version', 'The sound as Discord has it', function () { previewOriginal(screen.id) }),
				]),
				button('Reset this sound', function () { put(key, { mode: 'pack', url: '', label: '', volume: 100 }); toast('Reset') }),
			])
		}

		// ---- Sounds tab
		function SoundsTab() {
			var enabled = !!data.enabled
			var count = Object.keys(data.sounds || {}).filter(function (k) { return data.sounds[k] && (data.sounds[k].mode === 'custom' || data.sounds[k].mode === 'off') }).length
			var search = u.search
			var recent = heard.filter(function (x) { return !soundInfo(x.key) }).slice(0, 8)
			return page([
				title('Sounds', enabled ? count + ' changed · pack: ' + (packs().filter(function (p) { return p.id === activePackId() })[0] || { name: 'none' }).name : 'Custom sounds are off'),
				h(Design.TableRowGroup, { key: 'master', title: 'Custom sounds' }, h(Design.TableSwitchRow, { key: 'on', label: 'Use custom sounds', subLabel: 'Turn everything off without losing your setup', value: enabled, onValueChange: function (v) { json.set({ enabled: v }); setTimeout(warm, 300) } })),
				h(Field, { key: 'search', label: 'Search', placeholder: 'Search sounds', value: search, instant: true, onCommit: function (v) { setUi({ search: v }) } }),
				recent.length && !search
					? group('Heard from Discord, not in the list', recent.map(function (x) { return row(x.raw, describe(x.key) + ' · heard ' + x.count + 'x', function () { go({ name: 'edit', key: x.key, title: x.raw, id: x.raw }) }) }))
					: null,
			].concat(soundGroups(search)))
		}

		// ---- Packs
		function exportPack(name, sounds) { return JSON.stringify({ name: name, sounds: sounds }, null, 1) }

		function currentCustomSounds() {
			var out = {}
			Object.keys(data.sounds || {}).forEach(function (k) {
				var e = data.sounds[k]
				if (e && e.mode === 'custom' && e.url) out[(soundInfo(k) || { id: k }).id] = e.url
			})
			return out
		}

		function importPack(text) {
			var parsed
			try { parsed = JSON.parse(text) } catch (e) { return toast('That is not a pack. It should look like { "name": "...", "sounds": { "message1": "https://..." } }') }
			var sounds = {}
			var raw = parsed && parsed.sounds
			if (!raw || typeof raw !== 'object') return toast('That pack has no "sounds"')
			Object.keys(raw).forEach(function (k) { if (typeof raw[k] === 'string' && /^https?:\/\//.test(raw[k])) sounds[k] = raw[k] })
			if (!Object.keys(sounds).length) return toast('No sound links found in that pack')
			var id = 'u' + hash(String(parsed.name || 'pack') + Date.now())
			var all = {}
			all[id] = { name: String(parsed.name || 'Imported pack').slice(0, 40), sounds: sounds }
			json.set({ userPacks: all, activePack: id })
			setTimeout(warm, 400)
			toast('Added ' + Object.keys(sounds).length + ' sounds in "' + all[id].name + '"')
			home()
		}

		function PacksTab() {
			var list = packs()
			var active = data.activePack || 'none'
			return page([
				title('Packs', 'Switch a whole set of sounds at once'),
				radio('Active pack', active, list.map(function (p) { return { value: p.id, label: p.name, subLabel: p.blurb } }), function (id) { json.set({ activePack: id }); setTimeout(warm, 400) }),
				h(Design.TableRowGroup, { key: 'auto', title: 'Seasons' }, h(Design.TableSwitchRow, { key: 'autoSwitch', label: 'Switch automatically', subLabel: 'Halloween Oct 15 to Nov 2, Winter Dec 1 to Jan 5, otherwise your chosen pack', value: !!data.autoPacks, onValueChange: function (v) { json.set({ autoPacks: v }); setTimeout(warm, 400) } })),
				note2(autoNote()),
				group(
					'Your packs',
					list.filter(function (p) { return !p.builtin }).map(function (p) { return row(p.name, p.blurb, function () { go({ name: 'pack', id: p.id }) }) }).concat([
						row('Save my custom sounds as a pack', 'Keeps everything you set to a custom link', function () { go({ name: 'savePack' }) }),
						row('Import a pack from a link', 'A link to a pack file', function () { go({ name: 'importLink' }) }),
						row('Import a pack from the clipboard', 'Paste what a friend sent you', function () {
							Promise.resolve(valenced.externals.ReactNativeClipboard.Clipboard.getString()).then(importPack, function () { toast('Could not read the clipboard') })
						}),
					]),
				),
			])
		}
		function autoNote() {
			if (!data.autoPacks) return 'Automatic switching is off.'
			var id = activePackId()
			return SEASONS[id] ? 'Right now: ' + SEASONS[id].name + ' is on.' : 'No season is on right now, so your chosen pack is used.'
		}

		function PackScreen(screen) {
			var p = (data.userPacks || {})[screen.id]
			if (!p || p.deleted) return page([backBar(), title('Pack removed')])
			var ids = Object.keys(p.sounds || {})
			return page([
				backBar(),
				title(p.name, ids.length + ' sounds'),
				button('Use this pack', function () { json.set({ activePack: screen.id }); setTimeout(warm, 400); toast(p.name + ' is on') }, 'primary'),
				button('Copy pack to share', function () { copyText(exportPack(p.name, p.sounds), 'Pack') }),
				group('Sounds in this pack', ids.map(function (id) { return row((soundInfo(keyOf(id)) || { name: id }).name, hostOf(p.sounds[id]), function () { previewUrl(p.sounds[id], 100) }) })),
				button('Delete this pack', function () {
					var all = {}
					all[screen.id] = { deleted: true }
					json.set({ userPacks: all, activePack: data.activePack === screen.id ? 'none' : data.activePack })
					home()
				}),
			])
		}

		function SavePackScreen() {
			var mine = currentCustomSounds()
			return page([
				backBar(),
				title('Save as a pack', Object.keys(mine).length + ' custom sounds'),
				h(Field, { key: 'packName', label: 'Pack name', placeholder: 'My sounds', value: u.packName, onCommit: function (v) { setUi({ packName: v }) } }),
				button('Save pack', function () {
					var name = String(u.packName).trim()
					if (!name) return toast('Give the pack a name first')
					if (!Object.keys(mine).length) return toast('You have no custom sounds to save yet')
					var id = 'u' + hash(name + Date.now())
					var all = {}
					all[id] = { name: name.slice(0, 40), sounds: mine }
					json.set({ userPacks: all })
					toast('Saved "' + name + '"')
					home()
				}, 'primary'),
			])
		}

		function ImportLinkScreen() {
			return page([
				backBar(),
				title('Import a pack from a link', 'A link to a JSON pack file'),
				h(Field, { key: 'packUrl', label: 'Pack link', placeholder: 'https://example.com/pack.json', value: u.packUrl, onCommit: function (v) { setUi({ packUrl: v }) } }),
				button(u.busy ? 'Loading…' : 'Import', function () {
					var link = String(u.packUrl).trim()
					if (!/^https?:\/\//.test(link)) return toast('Paste a link starting with https://')
					setUi({ busy: true })
					fetch(link).then(function (res) { if (!res.ok) throw new Error('Could not download it (' + res.status + ')'); return res.text() }).then(importPack, function (e) { toast(errorText(e)) }).then(function () { setUi({ busy: false }) })
				}, 'primary'),
				note2('A pack file looks like: { "name": "My pack", "sounds": { "message1": "https://…/ping.mp3", "call_ringing": "https://…/ring.mp3" } }'),
			])
		}

		// ---- Discover
		function useFor(clip) { go({ name: 'pick', clip: clip }) }

		function DiscoverTab() {
			var guilds = []
			try { guilds = guildList() } catch (e) {}
			return page([
				title('Discover', 'Sounds other people put on Discord'),
				group('Soundboards', [row('Discord\'s default soundboard', 'The sounds every server has', function () { go({ name: 'board', source: 'default', label: 'Discord\'s default soundboard' }) })]),
				guilds.length
					? group('Your servers\' soundboards', guilds.slice(0, 80).map(function (g) { return row(g.name, 'Soundboard clips from this server', function () { go({ name: 'board', source: g.id, label: g.name }) }) }))
					: null,
				h(Field, { key: 'quickLink', label: 'Any sound link', description: 'Paste a link, listen, then choose which sound it replaces', placeholder: 'https://…', value: u.link, onCommit: function (v) { setUi({ link: v }) } }),
				button('Listen', function () { var l = String(u.link).trim(); if (/^https?:\/\//.test(l)) previewUrl(l, 100); else toast('Paste a link starting with https://') }),
				button('Use for a sound…', function () { var l = String(u.link).trim(); if (/^https?:\/\//.test(l)) useFor({ url: l, label: hostOf(l) }); else toast('Paste a link starting with https://') }, 'primary'),
			])
		}

		function BoardScreen(screen) {
			var state = u.board
			var q = String(u.boardSearch).toLowerCase().trim()
			var rows = state && state.list ? state.list.filter(function (c) { return !q || String(c.name).toLowerCase().indexOf(q) >= 0 }) : []
			return page([
				backBar(),
				title(screen.label, state && state.list ? state.list.length + ' clips' : undefined),
				h(Field, { key: 'boardSearch', label: 'Search', placeholder: 'Search clips', value: u.boardSearch, instant: true, onCommit: function (v) { setUi({ boardSearch: v }) } }),
				!state ? note2('Loading…') : null,
				state && state.error ? note2('Could not load: ' + state.error) : null,
				state && state.list && !rows.length ? note2('No clips found.') : null,
				rows.length
					? group('Clips', rows.slice(0, 120).map(function (c) {
							var clip = { url: CDN_SOUNDBOARD + c.sound_id, label: String(c.name), emoji: c.emoji_name }
							return row((c.emoji_name ? c.emoji_name + ' ' : '') + c.name, 'Tap to listen or use it', function () { go({ name: 'clip', clip: clip }) })
					  }))
					: null,
			])
		}

		function ClipScreen(screen) {
			var clip = screen.clip
			return page([
				backBar(),
				title((clip.emoji ? clip.emoji + ' ' : '') + clip.label, hostOf(clip.url)),
				button('Listen', function () { previewUrl(clip.url, 100) }, 'primary'),
				button('Use for a sound…', function () { useFor(clip) }),
			])
		}

		function PickScreen(screen) {
			var clip = screen.clip
			return page(
				[
					backBar(),
					title('Which sound should it replace?', clip.label),
					h(Field, { key: 'pickSearch', label: 'Search', placeholder: 'Search sounds', value: u.pickSearch, instant: true, onCommit: function (v) { setUi({ pickSearch: v }) } }),
				].concat(
					soundGroups(u.pickSearch, function (s) {
						put(keyOf(s.id), { mode: 'custom', url: clip.url, label: clip.label, volume: 100 })
						toast(s.name + ' now plays ' + clip.label)
						home()
					}),
				),
			)
		}

		// ---- Tools
		function ToolsTab() {
			var readyCount = Object.keys(ready).length
			var failCount = Object.keys(failed).length
			return page([
				title('Tools', 'Status, backups and troubleshooting'),
				group('Status', [
					row('Sound player', sm ? 'Found (DCDSoundManager)' : 'Not found on this phone'),
					row('Custom sounds ready', readyCount + ' ready' + (failCount ? ', ' + failCount + ' failed' : '')),
					row('How files are loaded', learned.variant >= 0 ? 'Method ' + (learned.variant + 1) + ' worked' : 'Not learned yet, play a custom sound'),
				]),
				group(
					'Heard from Discord',
					heard.length
						? heard.slice(0, 12).map(function (x) { return row(x.raw, (x.replaced ? 'Replaced' : 'Discord\'s own') + ' · ' + x.count + 'x', function () { go({ name: 'edit', key: x.key, title: (soundInfo(x.key) || { name: x.raw }).name, id: x.raw }) }) })
						: [row('Nothing yet', 'Do something that makes a sound, then come back here')],
				),
				h(Field, { key: 'testUrl', label: 'Try a link', placeholder: 'https://…/sound.mp3', value: u.test, onCommit: function (v) { setUi({ test: v }) } }),
				button('Play it', function () { var l = String(u.test).trim(); if (/^https?:\/\//.test(l)) previewUrl(l, 100); else toast('Paste a link starting with https://') }),
				group('Backup', [
					row('Copy all my settings', 'Share or keep a copy', function () { copyText(JSON.stringify({ sounds: data.sounds, userPacks: data.userPacks, activePack: data.activePack, autoPacks: data.autoPacks }), 'Settings') }),
					row('Paste settings from the clipboard', 'Replaces what you have now', function () {
						Promise.resolve(valenced.externals.ReactNativeClipboard.Clipboard.getString()).then(function (text) {
							var parsed
							try { parsed = JSON.parse(text) } catch (e) { return toast('That is not a settings backup') }
							json.set({ sounds: parsed.sounds || {}, userPacks: parsed.userPacks || {}, activePack: parsed.activePack || 'none', autoPacks: !!parsed.autoPacks })
							setTimeout(warm, 400)
							toast('Settings restored')
						}, function () { toast('Could not read the clipboard') })
					}),
				]),
				group('Troubleshooting', [
					row('Download my sounds again', 'Clears what was loaded and loads it again', function () { ready = {}; failed = {}; loading = {}; changed(); warm().then(function () { toast('Done') }) }),
					row('Copy the log', 'Send this when something does not work', function () { copyText(diag.join('\n') || 'empty', 'Log') }),
					row('Reset everything', 'Back to Discord\'s own sounds', function () { json.set({ sounds: {}, userPacks: {}, activePack: 'none', autoPacks: false, enabled: true }); ready = {}; failed = {}; toast('Everything was reset') }),
				]),
				group('Log', diag.slice(-8).map(function (l, i) { return row(l, undefined, undefined, { key: 'log' + i }) })),
				group('About', [row('Credits', 'The list of Discord sounds and its seasonal sound files come from ScattrdBlade\'s Vencord CustomSounds plugin.')]),
			])
		}

		var screen = topScreen
		if (screen) {
			if (screen.name === 'edit') return EditScreen(screen)
			if (screen.name === 'pack') return PackScreen(screen)
			if (screen.name === 'savePack') return SavePackScreen()
			if (screen.name === 'importLink') return ImportLinkScreen()
			if (screen.name === 'board') return BoardScreen(screen)
			if (screen.name === 'clip') return ClipScreen(screen)
			if (screen.name === 'pick') return PickScreen(screen)
		}
		var tabs = [['sounds', 'Sounds'], ['packs', 'Packs'], ['discover', 'Discover'], ['tools', 'Tools']]
		var body = view.tab === 'packs' ? PacksTab() : view.tab === 'discover' ? DiscoverTab() : view.tab === 'tools' ? ToolsTab() : SoundsTab()
		return h(
			RN.View,
			{ style: { flex: 1 } },
			h(
				RN.View,
				{ style: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 12 } },
				tabs.map(function (t) { return h(RN.View, { key: t[0], style: { flex: 1 } }, h(Design.Button, { text: t[1], size: 'sm', variant: view.tab === t[0] ? 'primary' : 'secondary', onPress: function () { setTab(t[0]) } })) }),
			),
			body,
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			storage = api.jsonStorage
			installPatches(cleanup)
			setTimeout(warm, 1500)
			// Packs that switch with the date: look again once an hour, so a new season starts without a restart.
			var lastPack = activePackId()
			var timer = setInterval(function () {
				var now = activePackId()
				if (now !== lastPack) { lastPack = now; warm() }
			}, 3600000)
			cleanup(function () {
				clearInterval(timer)
				ready = {}
				loading = {}
				listeners = []
			})
		},
	})
	return exports
})({})
