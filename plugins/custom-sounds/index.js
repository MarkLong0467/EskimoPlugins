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
	var defaults = { enabled: true, activePack: 'none', autoPacks: false, sounds: {}, userPacks: {}, keyNames: {} }
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
	var failedAt = {} // url -> when, so a broken sound is not retried on every play
	var toldAbout = {} // url -> true once the failure was shown
	var learned = { variant: -1, path: -1, writer: '' }
	var learnedVariant // the prepare layout that worked

	/** Saves the layout that worked, so later starts can use it without any trial and error. */
	function rememberLayout(name) {
		try { if (storage && typeof storage.set === 'function' && name !== 'what Discord uses') storage.set({ layout: name }) } catch (e) {}
	}
	function restoreLayout() {
		var saved = setting('layout')
		if (!saved) return
		for (var i = 0; i < VARIANTS.length; i++) if (VARIANTS[i].name === saved) learnedVariant = VARIANTS[i]
	}
	/** Whether sounds can be loaded on their own: only once a layout is known to work. */
	function layoutKnown() { return !!(learnedVariant || learnedTemplate) }
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
	/** A native module by name, looked up every way a phone can expose it. */
	function native(name) {
		var RN = valenced.react.ReactNative
		var found = RN.NativeModules && RN.NativeModules[name]
		if (found) return found
		try { if (typeof nativeModuleProxy !== 'undefined' && nativeModuleProxy[name]) return nativeModuleProxy[name] } catch (e) {}
		try { if (typeof __turboModuleProxy === 'function') return __turboModuleProxy(name) || undefined } catch (e) {}
	}

	/** Discord's file module (NativeFileModule): Valenced exposes it, and older builds call it DCDFileManager. */
	function fileModule() {
		try {
			var viaValenced = valenced.discord.native && valenced.discord.native.FileModule
			if (viaValenced && typeof viaValenced.writeFile === 'function') return viaValenced
		} catch (e) {}
		var names = ['NativeFileModule', 'DCDFileManager']
		for (var i = 0; i < names.length; i++) {
			var m = native(names[i])
			if (m && typeof m.writeFile === 'function') return m
		}
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
	var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
	function toBase64(buffer) {
		var bytes = new Uint8Array(buffer)
		var out = ''
		for (var i = 0; i < bytes.length; i += 3) {
			var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0)
			out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=')
		}
		return out
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
		var files = fileModule()
		if (!files) throw new Error('The file module was not found on this phone')
		var res = await fetch(url)
		if (!res.ok) throw new Error('Could not download it (' + res.status + ')')
		var buffer = await res.arrayBuffer()
		if (buffer.byteLength > MAX_BYTES) throw new Error('That file is bigger than 12 MB')
		var name = 'custom-sounds/cs-' + hash(url) + '.' + extensionOf(url, res.headers && res.headers.get && res.headers.get('content-type'))
		var base = toBase64(buffer)
		var written
		var dir
		var lastError
		var dirs = ['cache', 'documents']
		for (var i = 0; i < dirs.length && written === undefined; i++) {
			try {
				written = await files.writeFile(dirs[i], name, base, 'base64')
				dir = dirs[i]
				if (written === undefined) written = null
			} catch (e) { lastError = e }
		}
		if (written === undefined) throw lastError || new Error('Could not write the file')
		var paths = []
		if (typeof written === 'string' && written) paths.push(written)
		try {
			var constants = typeof files.getConstants === 'function' ? files.getConstants() : {}
			var root = dir === 'cache' ? constants.CacheDirPath : constants.DocumentsDirPath
			if (root) paths.push(String(root).replace(/\/$/, '') + '/' + name)
		} catch (e) {}
		note('wrote ' + name + ' to ' + dir + ' -> ' + (paths.join(' | ') || '(no path returned)'))
		return paths.filter(function (p, i) { return paths.indexOf(p) === i })
	}

	/** Calls prepare. `args` holds CALLBACK where the completion callback goes (or none, for a promise). */
	var CALLBACK = { callback: true }
	function callPrepare(args) {
		return new Promise(function (resolve, reject) {
			var timer = setTimeout(function () { reject(new Error('prepare never answered')) }, 3000)
			var finished = false
			function done(error) {
				if (finished) return
				finished = true
				clearTimeout(timer)
				if (error) reject(new Error(typeof error === 'string' ? error : (error && error.message) || JSON.stringify(error)))
				else resolve()
			}
			try {
				var real = args.map(function (a) { return a === CALLBACK ? function (error) { done(error) } : a })
				var result = orig.prepare.apply(sm, real)
				if (result && typeof result.then === 'function') result.then(function () { done() }, function (e) { done(e || 'rejected') })
				else if (args.indexOf(CALLBACK) < 0) done() // nothing to wait for
			} catch (e) {
				clearTimeout(timer)
				finished = true
				reject(e)
			}
		})
	}

	// The shape of prepare is learned from what Discord itself sends (see watchPrepare). Until then these are
	// tried in order, the way Discord's sound player (a fork of react-native-sound) is most likely to take them.
	function textKey(n) { return 'cs-' + n }
	var VARIANTS = [
		{ name: 'uri, key, options, cb', build: function (u, k) { return [u, k, { loadSync: true }, CALLBACK] } },
		{ name: 'uri, key, cb', build: function (u, k) { return [u, k, CALLBACK] } },
		{ name: 'uri, usage, key, cb', build: function (u, k) { return [u, 'notification', k, CALLBACK] } },
		{ name: 'uri, usage, key, options, cb', build: function (u, k) { return [u, 'notification', k, { loadSync: true }, CALLBACK] } },
		{ name: 'uri, key, usage, cb', build: function (u, k) { return [u, k, 'notification', CALLBACK] } },
		{ name: 'uri, 0, key, cb', build: function (u, k) { return [u, 0, k, CALLBACK] } },
		{ name: 'uri, name, options, cb', keyFor: textKey, build: function (u, k) { return [u, k, { loadSync: true }, CALLBACK] } },
		{ name: 'uri, usage, name, cb', keyFor: textKey, build: function (u, k) { return [u, 'notification', k, CALLBACK] } },
		{ name: 'uri, name, cb', keyFor: textKey, build: function (u, k) { return [u, k, CALLBACK] } },
		{ name: 'uri, 0, name, cb', keyFor: textKey, build: function (u, k) { return [u, 0, k, CALLBACK] } },
	]

	var nameOfKey = {} // Discord's key for a sound -> the sound it is (from its prepare calls)
	var keyOfName = {} // the other way round
	var observedPrepare = [] // what Discord's own prepare calls looked like
	var learnedTemplate // function(uri, key) -> arguments, built from one of those calls
	var learnedKeyIsNumber = true

	function plain(value) {
		return typeof value === 'function' ? '[function]' : value && typeof value === 'object' ? JSON.stringify(value).slice(0, 60) : value
	}

	/** Remembers how Discord calls prepare, and works out which argument is the sound and which is its name. */
	/** The Discord sound a file name or path belongs to, or undefined. The longest matching name wins. */
	function soundFromText(text) {
		var t = keyOf(String(text))
		var best
		SOUNDS.forEach(function (sound) {
			var id = keyOf(sound.id)
			if (t === id || t.slice(-id.length) === id || t.indexOf(id) >= 0) if (!best || id.length > keyOf(best.id).length) best = sound
		})
		return best
	}

	function learnKeys(args) {
		var number
		var text
		for (var i = 0; i < args.length; i++) {
			if (typeof args[i] === 'number') number = args[i]
			else if (typeof args[i] === 'string' && !text && args[i].length > 2 && !/^(notification|ringtone|voice|media|alarm|default)$/i.test(args[i])) text = args[i]
		}
		if (number === undefined || !text) return
		var sound = soundFromText(text)
		var name = sound ? keyOf(sound.id) : keyOf(text)
		nameOfKey[number] = name
		keyOfName[name] = number
	}

	function watchPrepare(args) {
		try { learnKeys(args) } catch (e) {}
		var shown = args.map(plain)
		if (observedPrepare.length < 6) {
			observedPrepare.push(shown)
			note('Discord prepare: ' + JSON.stringify(shown))
		}
		return shown
	}

	function learnTemplate(prepareArgs, playedName) {
		if (learnedTemplate || !prepareArgs) return
		var keyAt = -1
		for (var i = 0; i < prepareArgs.length; i++) if (prepareArgs[i] === playedName && (typeof playedName === 'number' || typeof prepareArgs[i] === 'string')) keyAt = i
		if (keyAt < 0) return
		var uriAt = -1
		for (var j = 0; j < prepareArgs.length; j++) {
			if (j === keyAt || typeof prepareArgs[j] !== 'string' || /^(notification|ringtone|voice|media|alarm|default|system|music|game|ambient|playback|call)$/i.test(prepareArgs[j])) continue
			uriAt = j
			break
		}
		if (uriAt < 0) return
		var copy = prepareArgs.map(function (a) { return typeof a === 'function' ? CALLBACK : a })
		learnedTemplate = function (u, k) {
			var out = copy.slice()
			out[uriAt] = u
			out[keyAt] = k
			return out
		}
		learnedKeyIsNumber = typeof playedName === 'number'
		note('Learned how Discord calls prepare: sound is argument ' + (uriAt + 1) + ', name is argument ' + (keyAt + 1) + ' of ' + copy.length)
	}

	function candidatesFor(url, paths) {
		var list = []
		paths.forEach(function (p) {
			list.push(p)
			if (!/^file:/.test(p) && p.charAt(0) === '/') list.push('file://' + p)
		})
		if (/^https?:/.test(url)) list.push(url) // Android's player can stream a link itself
		return list
	}

	/** Whether a sound that failed to load should be left alone for now. */
	function coolingDown(url) {
		return !!failedAt[url] && Date.now() - failedAt[url] < 60000
	}

	function ensureReady(url, force) {
		if (ready[url]) return Promise.resolve(ready[url])
		if (!force && coolingDown(url)) return Promise.reject(new Error(failed[url] || 'could not load'))
		if (loading[url]) return loading[url]
		loading[url] = (async function () {
			try {
				if (!sm || typeof orig.prepare !== 'function') throw new Error('The sound player was not found on this phone')
				var number = 900000 + (parseInt(hash(url), 36) % 90000)
				var paths = []
				var bundled = /^bundled:/.test(url) ? url.slice(8) : ''
				if (bundled) paths = [bundled, bundled + '.mp3', bundled + '.ogg', bundled + '.wav', bundled.replace(/_/g, '')]
				else if (/^(file:|\/)/.test(url)) paths = [url]
				else {
					try { paths = await download(url) } catch (e) { note('download problem: ' + errorText(e) + ' (trying the link directly)') }
				}
				var candidates = bundled ? paths : candidatesFor(url, paths)
				var variants = []
				if (learnedTemplate) variants.push({ name: 'what Discord uses', build: learnedTemplate, keyFor: learnedKeyIsNumber ? undefined : textKey })
				if (learnedVariant) variants.push(learnedVariant)
				else VARIANTS.forEach(function (v) { variants.push(v) })
				var started = Date.now()
				var lastError
				var messages = {}
				for (var c = 0; c < candidates.length; c++)
					for (var v = 0; v < variants.length; v++) {
						if (Date.now() - started > 25000) throw lastError || new Error('Gave up after 25 seconds')
						try {
							var usedKey = variants[v].keyFor ? variants[v].keyFor(number) : number
							await callPrepare(variants[v].build(candidates[c], usedKey))
							if (variants[v] !== learnedVariant) {
								learnedVariant = variants[v]
								rememberLayout(variants[v].name)
							}
							note('ready: ' + variants[v].name + ' with ' + (candidates[c].length > 60 ? candidates[c].slice(0, 60) + '…' : candidates[c]))
							ready[url] = { key: usedKey, path: candidates[c] }
							delete failed[url]
							delete failedAt[url]
							return ready[url]
						} catch (e) {
							lastError = e
							var text = errorText(e).replace(/^Exception in HostFunction: /, '').slice(0, 110)
							if (!messages[text]) {
								messages[text] = true
								note('prepare (' + variants[v].name + ') failed: ' + text)
							}
						}
					}
				throw new Error(Object.keys(messages).slice(0, 2).join(' | ') || (lastError ? errorText(lastError) : 'prepare failed'))
			} catch (e) {
				failed[url] = errorText(e)
				failedAt[url] = Date.now()
				if (!toldAbout[url]) {
					toldAbout[url] = true
					toast('Custom Sounds could not load a sound: ' + failed[url].slice(0, 90) + '. See Tools > Log.')
				}
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
		if (!layoutKnown()) return Promise.resolve()
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

	function noop() {}
	var tails = {} // method -> the extra arguments it turned out to need

	/**
	 * Calls a method of the sound player. Native methods check how many arguments they get, so when a call
	 * is refused for its arguments it is tried again with a callback or two added at the end.
	 */
	function nativeCall(method, args) {
		var fn = orig[method]
		if (typeof fn !== 'function') throw new Error('The sound player has no ' + method)
		var options = tails[method] ? [tails[method]] : [[], [noop], [noop, noop]]
		var lastError
		for (var i = 0; i < options.length; i++) {
			try {
				var result = fn.apply(sm, args.concat(options[i]))
				tails[method] = options[i]
				return result
			} catch (e) {
				lastError = e
				if (!/expected|argument|arity/i.test(errorText(e))) throw e
			}
		}
		throw lastError
	}

	function setVolume(key, percent) {
		var v = Number(percent)
		if (!isFinite(v)) v = 100
		if (typeof orig.setVolume === 'function') {
			try { nativeCall('setVolume', [key, Math.max(0, v) / 100]) } catch (e) { note('setVolume: ' + errorText(e).slice(0, 90)) }
		}
	}

	/** Plays a link right now, for the preview buttons. */
	async function previewUrl(url, volume) {
		var slot
		try {
			slot = await ensureReady(url, true)
		} catch (e) {
			return toast('Could not load the sound: ' + errorText(e).slice(0, 120))
		}
		try {
			setVolume(slot.key, volume)
			nativeCall('play', [slot.key])
		} catch (e) {
			note('play failed: ' + errorText(e))
			toast('Loaded, but could not play it: ' + errorText(e).slice(0, 120))
		}
	}

	/** Plays Discord's own version of a sound, for the preview buttons. */
	function previewOriginal(id) {
		var known = keyOfName[keyOf(id)]
		if (known !== undefined) {
			try { return nativeCall('play', [known]) } catch (e) { note('play failed: ' + errorText(e)) }
		}
		// Discord has not loaded this sound yet, so load the same built-in file ourselves.
		ensureReady('bundled:' + id, true).then(
			function (slot) {
				try { nativeCall('play', [slot.key]) } catch (e) {
					note('play failed: ' + errorText(e))
					toast('Could not play it. See Tools > Log.')
				}
			},
			function (e) {
				note('could not load the built-in sound ' + id + ': ' + errorText(e))
				toast('Could not play Discord\'s own version of this sound. See Tools > Log.')
			},
		)
	}

	// ---- Listening to Discord ------------------------------------------------------------------
	function hear(raw, label) {
		var key = keyOf(raw)
		var item = heard.filter(function (x) { return x.key === key })[0]
		if (!item) {
			item = { key: key, raw: String(label || raw), count: 0 }
			heard.unshift(item)
			if (heard.length > 30) heard.pop()
		}
		item.count++
		item.at = Date.now()
		return item
	}

	var SOUND_METHODS = ['prepare', 'play', 'stop', 'pause', 'release', 'setVolume', 'setNumberOfLoops', 'setCurrentTime', 'setPan', 'getCurrentTime']
	var hooks = { native: 'not tried', js: 'not tried', cls: 'not found' }

	/**
	 * Handles one request from Discord to play a sound. Returns true when it was dealt with here (your
	 * sound played, or the sound was silenced), false when Discord should play its own.
	 */
	function handleSound(name) {
		var item = hear(name)
		var r
		try { r = resolve(item.key) } catch (e) {}
		item.replaced = !!r
		changed()
		if (!r) return false
		if (r.off) return true
		var slot = ready[r.url]
		if (!slot) {
			// Not downloaded yet: let Discord's own sound play this time, and get ours ready.
			if (layoutKnown() && !coolingDown(r.url)) ensureReady(r.url).catch(function () {})
			return false
		}
		setVolume(slot.key, r.volume)
		try { nativeCall('play', [slot.key]) } catch (e) { note('could not play: ' + errorText(e)); return false }
		return true
	}

	/** Runs one step of setting up, so a problem in one place never stops the rest. */
	function attempt(label, step) {
		try { step() } catch (e) { note(label + ' failed: ' + errorText(e)) }
	}

	function installPatches(cleanup) {
		attempt('finding the sound player', function () { sm = native('DCDSoundManager') })
		if (!sm) return note('The sound player (DCDSoundManager) is missing on this phone')
		var present = []
		SOUND_METHODS.forEach(function (m) {
			attempt('checking ' + m, function () {
				if (typeof sm[m] === 'function') {
					orig[m] = sm[m]
					present.push(m)
				}
			})
		})
		note('Sound player methods: ' + (present.join(', ') || 'none found'))
		attempt('finding the file module', function () { note('File module: ' + (fileModule() ? 'found' : 'missing')) })
		var lastPrepare = {}

		// Layer 1: the native sound player itself.
		var patched = 0
		function patchNative(method, make) {
			if (typeof orig[method] !== 'function') return
			attempt('patching ' + method, function () {
				cleanup(valenced.patcher.instead(sm, method, make))
				patched++
			})
		}
		/** Which sound a request from Discord is about: its name, or a number it was given when it was loaded. */
		function soundOf(first) {
			if (typeof first === 'number') return nameOfKey[first] || ''
			if (typeof first === 'string') return keyOf(first)
			return ''
		}
		function rawName(first) {
			return typeof first === 'number' ? (nameOfKey[first] ? nameOfKey[first] : 'Sound #' + first) : String(first)
		}

		patchNative('prepare', function (args, original) {
			try {
				var shown = watchPrepare(args)
				for (var i = 0; i < shown.length; i++) if (typeof args[i] === 'string' || typeof args[i] === 'number') lastPrepare[String(args[i])] = args.slice()
			} catch (e) {}
			return Reflect.apply(original, this, args)
		})
		patchNative('play', function (args, original) {
			var first = args[0]
			if (typeof first !== 'string' && typeof first !== 'number') return Reflect.apply(original, this, args)
			try { learnTemplate(lastPrepare[String(first)], first) } catch (e) {}
			if (!tails.play && args.length > 1) tails.play = args.slice(1).map(function (x) { return typeof x === 'function' ? noop : x })
			var sound = soundOf(first)
			var item = hear(sound || rawName(first), rawName(first))
			var r
			try { r = sound ? resolve(sound) : null } catch (e) {}
			item.replaced = !!r
			changed()
			if (!r) return Reflect.apply(original, this, args)
			if (r.off) return undefined
			var slot = ready[r.url]
			if (!slot) {
				if (layoutKnown() && !coolingDown(r.url)) ensureReady(r.url).catch(function () {})
				return Reflect.apply(original, this, args)
			}
			setVolume(slot.key, r.volume)
			return Reflect.apply(original, this, [slot.key].concat(args.slice(1)))
		})
		// Stopping, pausing and looping a sound that was replaced has to reach the file that is playing.
		;['stop', 'pause', 'setNumberOfLoops', 'setCurrentTime', 'setPan'].forEach(function (m) {
			patchNative(m, function (args, original) {
				var sound = soundOf(args[0])
				if (sound) {
					try {
						var r = resolve(sound)
						if (r && r.off) return undefined
						if (r && ready[r.url]) return Reflect.apply(original, this, [ready[r.url].key].concat(args.slice(1)))
					} catch (e) {}
				}
				return Reflect.apply(original, this, args)
			})
		})
		hooks.native = patched ? 'working (' + patched + ' methods)' : 'could not be patched'
		note('Native sound player hook: ' + hooks.native)

		// Layer 1b: Discord's sound class on the JS side, which knows each sound by name.
		attempt('finding the sound class', function () {
			var f = valenced.modules.finders
			var told = false
			cleanup(
				f.getModules(
					f.filters.withName('MobileAudioSound'),
					function (module) {
						var cls = typeof module === 'function' ? module : module && typeof module.default === 'function' ? module.default : null
						if (!cls || !cls.prototype || typeof cls.prototype.play !== 'function') return
						attempt('patching the sound class', function () {
							cleanup(
								valenced.patcher.instead(cls.prototype, 'play', function (args, original) {
									try {
										var found
										var fields = []
										Object.keys(this).forEach(function (k) {
											var v = this[k]
											if (typeof v === 'string' || typeof v === 'number') fields.push(k + '=' + String(v).slice(0, 40))
											if (!found && typeof v === 'string' && v.length < 90) {
												var sound = soundFromText(v)
												if (sound) found = keyOf(sound.id)
											}
										}, this)
										if (!told) { told = true; note('Sound class fields: ' + fields.join(', ')) }
										if (found && handleSound(found)) return undefined
									} catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							hooks.cls = 'working'
							note('Sound class hook: working')
							changed()
						})
					},
					{ returnNamespace: true },
				),
			)
		})

		// Layer 2: Discord's own sound helper, for phones where the native player cannot be patched.
		attempt('finding the sound helper', function () {
			var f = valenced.modules.finders
			cleanup(
				f.getModules(
					f.filters.withProps('playSound'),
					function (module) {
						var holder = module && typeof module.playSound === 'function' ? module : module && module.default && typeof module.default.playSound === 'function' ? module.default : null
						if (!holder) return
						attempt('patching playSound', function () {
							cleanup(
								valenced.patcher.instead(holder, 'playSound', function (args, original) {
									var name = args[0]
									try { if (typeof name === 'string' && handleSound(name)) return undefined } catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							hooks.js = 'working'
							note('Sound helper hook: working')
							changed()
						})
					},
					{ returnNamespace: true },
				),
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
		function openHeard(x) {
			var m = /#(\d+)$/.exec(x.raw)
			if (m) go({ name: 'identify', number: Number(m[1]) })
			else go({ name: 'edit', key: x.key, title: x.raw, id: x.raw })
		}

		function IdentifyScreen(screen) {
			return page([
				backBar(),
				title('Sound #' + screen.number, 'Discord played a sound it had loaded before this plugin started'),
				group('Find out which sound it is', [
					row('Play it', 'Listen to what Discord plays', function () { try { nativeCall('play', [screen.number]) } catch (e) { note('play failed: ' + errorText(e)); toast('Could not play it. See Tools > Log.') } }),
					row('This is…', 'Choose which Discord sound this is', function () { go({ name: 'identifyPick', number: screen.number }) }),
				]),
				note2('Numbers can change after Discord restarts, so you may need to do this again.'),
			])
		}

		function IdentifyPickScreen(screen) {
			return page(
				[
					backBar(),
					title('Which sound is #' + screen.number + '?'),
					h(Field, { key: 'identifySearch', label: 'Search', placeholder: 'Search sounds', value: u.pickSearch, instant: true, onCommit: function (v) { setUi({ pickSearch: v }) } }),
				].concat(
					soundGroups(u.pickSearch, function (sound) {
						var name = keyOf(sound.id)
						nameOfKey[screen.number] = name
						keyOfName[name] = screen.number
						var all = {}
						all[screen.number] = name
						json.set({ keyNames: all })
						heard = heard.filter(function (x) { return !(/#\d+$/.test(x.raw) && Number(/#(\d+)$/.exec(x.raw)[1]) === screen.number) })
						toast('Sound #' + screen.number + ' is ' + sound.name)
						home()
					}),
				),
			)
		}

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
					? group('Heard from Discord, not in the list', recent.map(function (x) { return row(x.raw, (/#\d+$/.test(x.raw) ? 'Tap to find out which sound this is' : describe(x.key)) + ' · heard ' + x.count + 'x', function () { openHeard(x) }) }))
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
					row('File module', fileModule() ? 'Found' : 'Not found, links are played directly'),
					row('Hooks into Discord\'s sounds', 'Player: ' + hooks.native + ' · Helper: ' + hooks.js + ' · Class: ' + hooks.cls),
					row('Custom sounds ready', readyCount + ' ready' + (failCount ? ', ' + failCount + ' failed' : '')),
					row('How files are loaded', learnedVariant ? 'Works with: ' + learnedVariant.name : 'Not learned yet, play a custom sound'),
				]),
				group(
					'Heard from Discord',
					heard.length
						? heard.slice(0, 12).map(function (x) { return row(x.raw, (x.replaced ? 'Replaced' : 'Discord\'s own') + ' · ' + x.count + 'x', function () { openHeard(x) }) })
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
					row('Download my sounds again', 'Clears what was loaded and loads it again', function () { ready = {}; failed = {}; failedAt = {}; toldAbout = {}; loading = {}; changed(); warm().then(function () { toast('Done') }) }),
					row('Copy the log', 'Send this when something does not work', function () { copyText(diag.join('\n') || 'empty', 'Log') }),
					row('Reset everything', 'Back to Discord\'s own sounds', function () { json.set({ sounds: {}, userPacks: {}, activePack: 'none', autoPacks: false, enabled: true }); ready = {}; failed = {}; failedAt = {}; toast('Everything was reset') }),
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
			if (screen.name === 'identify') return IdentifyScreen(screen)
			if (screen.name === 'identifyPick') return IdentifyPickScreen(screen)
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
			restoreLayout()
			attempt('loading saved sound names', function () {
				var saved = setting('keyNames') || {}
				Object.keys(saved).forEach(function (n) { if (nameOfKey[n] === undefined) { nameOfKey[n] = saved[n]; keyOfName[saved[n]] = Number(n) } })
			})
			installPatches(cleanup)
			setTimeout(warm, 5000)
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
