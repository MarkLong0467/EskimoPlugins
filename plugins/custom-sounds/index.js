(function (exports) {
	/*
	 * Custom Sounds for Valenced, by MarkLong0467.
	 * Replaces the sounds Discord plays in the app with links you choose, per sound, with ready-made packs
	 * (Halloween, Winter and more), a soundboard browser and shareable packs.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 *
	 * How it works: Discord's sound class and its native player (DCDSoundManager) are hooked. For a sound you
	 * changed, your link is loaded and played in its place. Stop and loop for that sound reach your version.
	 *
	 * Notice: the table of Discord's sounds below (ids, names, seasonal files) is derived from
	 * ScattrdBlade's customSounds, GPL-3.0-or-later.
	 */
	var defaults = { hapticMenus: true, hapticOther: true, hapticVibration: true, enabled: true, activePack: 'none', autoPacks: false, sounds: {}, userPacks: {}, keyNames: {}, bad: {}, proven: {} }
	var CDN_SOUNDBOARD = 'https://cdn.discordapp.com/soundboard-sounds/'
	var VOLUMES = [25, 50, 75, 100]

	var SOUNDS = [
		{ id: "message1", name: "Message 1 (All Message Notifications)", cat: "Messages & pings", seasonal: {"halloween_message1": "https://discord.com/assets/c269de500ca3cb7b.mp3"} },
		{ id: "message2", name: "Message 2 (Friend Started Playing)", cat: "Messages & pings", seasonal: {} },
		{ id: "message3", name: "Message 3 (Current Channel, if enabled in Discord)", cat: "Messages & pings", seasonal: {} },
		{ id: "mention1", name: "Mention 1 (Unused by Discord)", cat: "Messages & pings", seasonal: {} },
		{ id: "mention2", name: "Mention 2 (Unused by Discord)", cat: "Messages & pings", seasonal: {} },
		{ id: "mention3", name: "Mention 3 (Audio Device Changed)", cat: "Messages & pings", seasonal: {} },
		{ id: "ducky_message1", name: "Ducky Message", cat: "Messages & pings", seasonal: {} },
		{ id: "asmr_message1", name: "ASMR Message", cat: "Messages & pings", seasonal: {} },
		{ id: "bit_message1", name: "Bit Message", cat: "Messages & pings", seasonal: {} },
		{ id: "bop_message1", name: "Bop Message", cat: "Messages & pings", seasonal: {} },
		{ id: "lofi_message1", name: "LoFi Message", cat: "Messages & pings", seasonal: {} },
		{ id: "poggermode_message_send", name: "Poggermode Message", cat: "Messages & pings", seasonal: {} },
		{ id: "call_calling", name: "Call Calling", cat: "Calls", seasonal: {"halloween_call_calling": "https://discord.com/assets/ef24e229a3413c8a.mp3", "winter_call_calling": "https://discord.com/assets/a07935fe464c324c.mp3"} },
		{ id: "call_ringing", name: "Call Ringing", cat: "Calls", seasonal: {"halloween_call_ringing": "https://discord.com/assets/7a287e2f88531f25.mp3", "winter_call_ringing": "https://discord.com/assets/daf6c21d9f92979a.mp3", "call_ringing_beat": "https://discord.com/assets/574220f72e718dad.mp3", "call_ringing_snow_halation": "https://discord.com/assets/82954088613583bc.mp3", "call_ringing_snowsgiving": "https://discord.com/assets/4261355196740dab.mp3"} },
		{ id: "disconnect", name: "Disconnect", cat: "Calls", seasonal: {"halloween_disconnect": "https://discord.com/assets/9b8ef0a59d731dd6.mp3", "winter_disconnect": "https://discord.com/assets/600991ad4560f288.mp3"} },
		{ id: "reconnect", name: "Reconnect", cat: "Calls", seasonal: {} },
		{ id: "user_join", name: "User Join", cat: "Calls", seasonal: {"halloween_user_join": "https://discord.com/assets/00b48ea9fc787786.mp3", "winter_user_join": "https://discord.com/assets/b766ee70384a56ce.mp3"} },
		{ id: "user_leave", name: "User Leave", cat: "Calls", seasonal: {"halloween_user_leave": "https://discord.com/assets/c9b6b9d1ef992f1b.mp3", "winter_user_leave": "https://discord.com/assets/cf2c36fde50eb05d.mp3"} },
		{ id: "user_moved", name: "User Moved", cat: "Calls", seasonal: {} },
		{ id: "stage_waiting", name: "Stage Waiting", cat: "Calls", seasonal: {} },
		{ id: "hang_status_select", name: "Hang Status Select", cat: "Calls", seasonal: {} },
		{ id: "ptt_start", name: "PTT Start", cat: "Calls", seasonal: {} },
		{ id: "ptt_stop", name: "PTT Stop", cat: "Calls", seasonal: {} },
		{ id: "mute", name: "Mute", cat: "Voice controls", seasonal: {"halloween_mute": "https://discord.com/assets/d5e69d2c2aac0a27.mp3", "winter_mute": "https://discord.com/assets/81034fa14558e50f.mp3"} },
		{ id: "unmute", name: "Unmute", cat: "Voice controls", seasonal: {"halloween_unmute": "https://discord.com/assets/6f0d538ed066a1a6.mp3", "winter_unmute": "https://discord.com/assets/b2c49178b1a4e3d9.mp3"} },
		{ id: "deafen", name: "Deafen", cat: "Voice controls", seasonal: {"halloween_deafen": "https://discord.com/assets/514663b657bc4c7d.mp3", "winter_deafen": "https://discord.com/assets/70fe5e248588bb13.mp3"} },
		{ id: "undeafen", name: "Undeafen", cat: "Voice controls", seasonal: {"halloween_undeafen": "https://discord.com/assets/4dfa756a71484219.mp3", "winter_undeafen": "https://discord.com/assets/5b518eba0a73ec4a.mp3"} },
		{ id: "camera_on", name: "Camera On", cat: "Camera & streams", seasonal: {} },
		{ id: "camera_off", name: "Camera Off", cat: "Camera & streams", seasonal: {} },
		{ id: "stream_started", name: "Stream Started", cat: "Camera & streams", seasonal: {} },
		{ id: "stream_ended", name: "Stream Ended", cat: "Camera & streams", seasonal: {} },
		{ id: "stream_user_joined", name: "Stream User Joined", cat: "Camera & streams", seasonal: {} },
		{ id: "stream_user_left", name: "Stream User Left", cat: "Camera & streams", seasonal: {} },
		{ id: "clip_save", name: "Clip Save", cat: "Camera & streams", seasonal: {} },
		{ id: "clip_error", name: "Clip Error", cat: "Camera & streams", seasonal: {} },
		{ id: "voice_message_recording_stopped", name: "Voice Message Recording Stopped", cat: "Camera & streams", seasonal: {} },
		{ id: "activity_end", name: "Activity End", cat: "Activities & games", seasonal: {} },
		{ id: "activity_launch", name: "Activity Launch", cat: "Activities & games", seasonal: {} },
		{ id: "activity_user_join", name: "Activity User Join", cat: "Activities & games", seasonal: {} },
		{ id: "activity_user_left", name: "Activity User Left", cat: "Activities & games", seasonal: {} },
		{ id: "ddr-down", name: "DDR Down", cat: "Activities & games", seasonal: {} },
		{ id: "ddr-left", name: "DDR Left", cat: "Activities & games", seasonal: {} },
		{ id: "ddr-right", name: "DDR Right", cat: "Activities & games", seasonal: {} },
		{ id: "ddr-up", name: "DDR Up", cat: "Activities & games", seasonal: {} },
		{ id: "discodo", name: "Discodo", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_bark", name: "Doggo Game: Bark (Game Start)", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_cat", name: "Doggo Game: Cat Death", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_cat_hurt", name: "Doggo Game: Cat Hurt", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_dog_death", name: "Doggo Game: Dog Death", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_dog_hurt", name: "Doggo Game: Dog Hurt", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_slash", name: "Doggo Game: Knife Slash", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_music", name: "Doggo Game: Music", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_death", name: "Doggo Game: Player Death", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_human_hit", name: "Doggo Game: Player Hit", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_rat", name: "Doggo Game: Rat Attack", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_rat_hit", name: "Doggo Game: Rat Hit", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_skeleton", name: "Doggo Game: Skeleton Attack", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_skeleton_die", name: "Doggo Game: Skeleton Death", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_skeleton_hit", name: "Doggo Game: Skeleton Hit", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_zombie", name: "Doggo Game: Zombie Attack", cat: "Activities & games", seasonal: {} },
		{ id: "doggo_zombie_hit", name: "Doggo Game: Zombie Hit", cat: "Activities & games", seasonal: {} },
		{ id: "human_man", name: "Human Man", cat: "Activities & games", seasonal: {} },
		{ id: "overlayunlock", name: "Overlay Unlock", cat: "Activities & games", seasonal: {} },
		{ id: "poggermode_achievement_unlock", name: "Poggermode Achievement", cat: "Activities & games", seasonal: {} },
		{ id: "poggermode_applause", name: "Poggermode Applause", cat: "Activities & games", seasonal: {} },
		{ id: "poggermode_enabled", name: "Poggermode Enabled", cat: "Activities & games", seasonal: {} },
		{ id: "robot_man", name: "Robot Man", cat: "Activities & games", seasonal: {} },
		{ id: "vibing_wumpus", name: "Vibing Wumpus", cat: "Activities & games", seasonal: {} },
		{ id: "success", name: "Success", cat: "Other", seasonal: {} },
	]

	// Seasonal files Discord itself ships. A pack is every sound that has a file for that season.
	var SEASONS = {
		halloween: { name: 'Halloween', blurb: 'Spooky versions of calls, mute, join and leave', test: function (m, d) { return (m === 10 && d >= 15) || (m === 11 && d <= 2) } },
		winter: { name: 'Winter', blurb: 'Snowy versions of calls, mute, join and leave', test: function (m, d) { return m === 12 || (m === 1 && d <= 5) } },
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
	var LOG = 'custom-sounds/log.json'
	var LOG_PREV = 'custom-sounds/log-before.json'
	var logChain = Promise.resolve()
	var logOn = false // starts once last session's log has been read
	var previousLog = [] // what the log said when the app last closed
	/** Saves the log to a file, so it is still there when the app closes in the middle of a step. */
	function persistLog() {
		if (!logOn) return logChain
		var files = fileModule()
		if (!files) return logChain
		var body = JSON.stringify(diag)
		logChain = logChain.then(function () { return files.writeFile('cache', LOG, body, 'utf8') }).catch(function () {})
		return logChain
	}
	function note(line) {
		diag.push(new Date().toTimeString().slice(0, 8) + ' ' + line)
		if (diag.length > 40) diag.shift()
		persistLog()
		changed()
	}
	/** Reads the log the app left behind last time, and keeps a copy of it. */
	async function loadPreviousLog() {
		var files = fileModule()
		try {
			if (files && typeof files.fileExists === 'function' && typeof files.readFile === 'function') {
				var constants = typeof files.getConstants === 'function' ? files.getConstants() : {}
				if (constants.CacheDirPath) {
					var path = String(constants.CacheDirPath).replace(/\/$/, '') + '/' + LOG
					if (await files.fileExists(path)) {
						var text = await files.readFile(path, 'utf8')
						var lines = JSON.parse(text)
						if (Array.isArray(lines) && lines.length) {
							previousLog = lines
							await files.writeFile('cache', LOG_PREV, text, 'utf8')
						}
					}
				}
			}
		} catch (e) {}
		logOn = true
		if (previousLog.length) note('Last session ended with: ' + previousLog[previousLog.length - 1].slice(0, 120))
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
	// Ready-made packs. A value of 'off' silences that sound. Everything here uses Discord's own files.
	function ringtone(id) {
		var url
		SOUNDS.forEach(function (s) { if (s.id === 'call_ringing' && s.seasonal && s.seasonal[id]) url = s.seasonal[id] })
		return url ? { call_ringing: url } : {}
	}
	var PRESETS = {
		quiet: {
			name: 'Quiet calls',
			blurb: 'Silences join, leave, move, mute, deafen, camera and stream sounds. Rings and messages stay.',
			build: function () {
				var map = {}
				;['user_join', 'user_leave', 'user_moved', 'mute', 'unmute', 'deafen', 'undeafen', 'ptt_start', 'ptt_stop', 'camera_on', 'camera_off', 'stream_started', 'stream_ended', 'stream_user_joined', 'stream_user_left', 'activity_user_join', 'activity_user_left'].forEach(function (k) { map[keyOf(k)] = 'off' })
				return map
			},
		},
		focus: {
			name: 'Focus',
			blurb: 'Silences everything except ringing, calling, mentions and Message 1',
			build: function () {
				var keep = ['call_ringing', 'call_calling', 'mention1', 'mention2', 'mention3', 'message1']
				var map = {}
				SOUNDS.forEach(function (s) { if (keep.indexOf(s.id) < 0) map[keyOf(s.id)] = 'off' })
				return map
			},
		},
		beat: { name: 'Ringtone: Beat', blurb: 'Only the incoming call ringtone, Discord\'s Beat version', build: function () { return ringtone('call_ringing_beat') } },
		halation: { name: 'Ringtone: Snow Halation', blurb: 'Only the incoming call ringtone, Discord\'s Snow Halation version', build: function () { return ringtone('call_ringing_snow_halation') } },
		snowsgiving: { name: 'Ringtone: Snowsgiving', blurb: 'Only the incoming call ringtone, Discord\'s Snowsgiving version', build: function () { return ringtone('call_ringing_snowsgiving') } },
	}

	function packs() {
		var list = [{ id: 'none', name: 'No pack', blurb: 'Every sound stays as Discord plays it unless you changed it', builtin: true }]
		Object.keys(SEASONS).forEach(function (id) { list.push({ id: id, name: SEASONS[id].name, blurb: SEASONS[id].blurb, builtin: true, season: SEASONS[id] }) })
		Object.keys(PRESETS).forEach(function (id) { list.push({ id: id, name: PRESETS[id].name, blurb: PRESETS[id].blurb, builtin: true }) })
		var mine = setting('userPacks') || {}
		Object.keys(mine).forEach(function (id) { if (mine[id] && !mine[id].deleted) list.push({ id: id, name: mine[id].name || 'Pack', blurb: Object.keys(mine[id].sounds || {}).length + ' sounds', builtin: false }) })
		return list
	}

	function packSounds(id) {
		if (PRESETS[id]) return PRESETS[id].build()
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
		if (chosen === 'none' || SEASONS[chosen] || PRESETS[chosen]) return chosen
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
		if (map[key] === 'off') return { off: true }
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
		if (r && r.off) return 'Silent (from the ' + packs().filter(function (p) { return p.id === activePackId() })[0].name + ' pack)'
		if (r) return 'From the ' + (SEASONS[activePackId()] ? SEASONS[activePackId()].name : packs().filter(function (p) { return p.id === activePackId() })[0].name) + ' pack' + tail
		return 'Discord default'
	}

	// ---- Getting a sound ready -----------------------------------------------------------------
	// ---- Crash journal ---------------------------------------------------------------------------
	// Some calls into the phone's sound player can close the whole app instead of failing politely. Before a
	// call that has never worked on this phone, a note is written to a file. If the app closes during the call,
	// the note is still there at the next start, and that call is skipped from then on.
	var JOURNAL = 'custom-sounds/journal.json'
	var journalReady = Promise.resolve()
	var bad = {} // calls that closed the app before
	var proven = {} // calls that have worked

	function sleep(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms) }) }
	function saveFlags() {
		try { if (storage && typeof storage.set === 'function') storage.set({ bad: bad, proven: proven }) } catch (e) {}
	}
	async function journalSet(kind) {
		var files = fileModule()
		if (!files) return
		try { await files.writeFile('cache', JOURNAL, JSON.stringify({ kind: kind, at: Date.now() }), 'utf8') } catch (e) {}
	}
	async function journalClear() {
		var files = fileModule()
		if (!files) return
		try { await files.removeFile('cache', JOURNAL) } catch (e) {}
	}
	/** Runs once at start: if the app closed in the middle of a risky call last time, remember which one. */
	async function journalCheck() {
		var files = fileModule()
		if (!files || typeof files.fileExists !== 'function' || typeof files.readFile !== 'function') return
		try {
			var constants = typeof files.getConstants === 'function' ? files.getConstants() : {}
			if (!constants.CacheDirPath) return
			var path = String(constants.CacheDirPath).replace(/\/$/, '') + '/' + JOURNAL
			if (!(await files.fileExists(path))) return
			var entry = JSON.parse(await files.readFile(path, 'utf8'))
			if (entry && entry.kind) {
				bad[entry.kind] = true
				proven[entry.kind] = false
				var parts = String(entry.kind).split('|')
				// A crash while loading a file is blamed on how the file was given, not on the argument layout.
				if (parts[0] === 'prepare' && parts.length === 4) bad['prepare|*|' + parts[2] + '|' + parts[3]] = true
				saveFlags()
				note('The app closed during "' + entry.kind + '". That step is skipped from now on.')
				toast('Custom Sounds skipped a step that closed the app last time. See Tools > Log.')
			}
			await journalClear()
		} catch (e) {
			note('could not read the crash journal: ' + errorText(e))
		}
	}
	/** Runs one risky call with the journal around it. Rejects at once for a call that closed the app before. */
	async function guarded(kind, fn, graceMs) {
		await journalReady
		if (bad[kind]) throw new Error('skipped, it closed the app before (' + kind + ')')
		var risky = !proven[kind]
		if (risky) {
			note('trying: ' + kind)
			await logChain
			await journalSet(kind)
		}
		try {
			var out = await fn()
			if (risky) {
				note('worked: ' + kind)
				if (/^play/.test(kind)) setTimeout(function () { note('still running 8 s after play (' + kind + ')') }, 8000)
				await sleep(graceMs || 600)
				proven[kind] = true
				saveFlags()
			}
			return out
		} finally {
			if (risky) await journalClear()
		}
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
	var lastPrepare = {} // Discord's key for a sound -> the arguments of Discord's own prepare call

	function plain(value) {
		return typeof value === 'function' ? '[function]' : value && typeof value === 'object' ? JSON.stringify(value).slice(0, 60) : value
	}

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

	/** Whether a sound that failed to load should be left alone for now. */
	function coolingDown(url) {
		return !!failedAt[url] && Date.now() - failedAt[url] < 60000
	}

	function ensureReady(url, force) {
		if (ready[url]) return Promise.resolve(ready[url])
		if (!force && coolingDown(url)) return Promise.reject(new Error(failed[url] || 'could not load'))
		var slotKey = url + (force ? '!' : '')
		if (loading[slotKey]) return loading[slotKey]
		loading[slotKey] = (async function () {
			try {
				if (!sm || typeof orig.prepare !== 'function') throw new Error('The sound player was not found on this phone')
				var number = 900000 + (parseInt(hash(url), 36) % 90000)
					if (!/^https?:/.test(url)) throw new Error('Only links starting with https:// can be played')
				var variants = []
				if (learnedTemplate) variants.push({ name: 'what Discord uses', build: learnedTemplate, keyFor: learnedKeyIsNumber ? undefined : textKey })
				if (learnedVariant) variants.push(learnedVariant)
				else if (!learnedTemplate) VARIANTS.forEach(function (v) { variants.push(v) }) // guessing is only for phones where Discord's own layout is not known yet
				var started = Date.now()
				var lastError
				var messages = {}
				var attempted = 0
				for (var v = 0; v < variants.length; v++) {
						if (Date.now() - started > 25000) throw lastError || new Error('Gave up after 25 seconds')
						var kind = 'prepare|' + variants[v].name + '|link|file'
						if (bad[kind] || bad['prepare|*|link|file']) continue
						// Nothing new is tried unless you asked for it (a play button); background loading only repeats what worked.
						if (!force && !proven[kind]) continue
						attempted++
						try {
							var usedKey = variants[v].keyFor ? variants[v].keyFor(number) : number
							await guarded(kind, function () { return callPrepare(variants[v].build(url, usedKey)) }, 700)
							proven[kind] = true
							if (variants[v] !== learnedVariant) {
								learnedVariant = variants[v]
								rememberLayout(variants[v].name)
							}
							note('ready: ' + variants[v].name + ' with ' + url.slice(0, 60))
							ready[url] = { key: usedKey, url: url, source: 'file' }
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
				if (!attempted) throw new Error(force ? 'Every way of loading this sound was skipped because it closed the app before' : 'waiting for a play button press')
				throw new Error(Object.keys(messages).slice(0, 2).join(' | ') || (lastError ? errorText(lastError) : 'prepare failed'))
			} catch (e) {
				if (/waiting for a play button press/.test(errorText(e))) throw e
				failed[url] = errorText(e)
				failedAt[url] = Date.now()
				if (!toldAbout[url]) {
					toldAbout[url] = true
					toast('Custom Sounds could not load a sound: ' + failed[url].slice(0, 90) + '. See Tools > Log.')
				}
				note('could not load ' + url.slice(0, 50) + ': ' + failed[url])
				throw e
			} finally {
				delete loading[slotKey]
				changed()
			}
		})()
		return loading[slotKey]
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

	/** Sets how loud a sound plays. Full volume needs no call at all, and nothing goes above 100%. */
	async function setVolumeSafely(key, percent, automatic) {
		var v = Number(percent)
		if (!isFinite(v) || v >= 100 || typeof orig.setVolume !== 'function') return
		if (automatic && !proven.volume) return
		try { await guarded('volume', function () { return nativeCall('setVolume', [key, Math.max(0, v) / 100]) }, 400) } catch (e) { note('volume: ' + errorText(e).slice(0, 90)) }
	}

	/** Volume for a sound played in the background: only when that call has worked before. */
	function autoVolume(slot, percent) {
		var v = Number(percent)
		if (!isFinite(v) || v >= 100 || !proven.volume) return
		try { nativeCall('setVolume', [slot.key, Math.max(0, v) / 100]) } catch (e) {}
	}

	/**
	 * Loads a sound again after it has played. The phone's player lets go of a sound once it finished, so a
	 * second play of the same number does nothing. Loading it again uses the call that already worked.
	 */
	function refresh(slot) {
		if (typeof orig.stop === 'function') { try { nativeCall('stop', [slot.key]) } catch (e) {} }
		if (typeof orig.release === 'function') { try { nativeCall('release', [slot.key]) } catch (e) {} }
		delete ready[slot.url]
		note('loading again to replay: ' + String(slot.url).slice(0, 50))
		return ensureReady(slot.url, true)
	}

	/** Plays one of our own sounds, with the journal around the first time. */
	async function playOurs(slot, volume) {
		if (slot.played) slot = await refresh(slot)
		slot.played = true
		if (volume !== undefined) await setVolumeSafely(slot.key, volume, false)
		return guarded('play|' + (slot.source || 'file'), function () { return nativeCall('play', [slot.key]) }, 900)
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
			await playOurs(slot, volume)
		} catch (e) {
			note('play failed: ' + errorText(e))
			toast('Loaded, but could not play it: ' + errorText(e).slice(0, 120))
		}
	}

	/**
	 * Plays a sound Discord loaded itself. Discord's player lets go of a sound once it has played, so a second
	 * play of the same number is late or silent. Loading it again with Discord's own prepare call fixes that.
	 */
	async function replayDiscords(key) {
		var prep = lastPrepare[String(key)]
		try {
			if (prep && typeof orig.release === 'function') {
				try { nativeCall('stop', [key]) } catch (e) {}
				try { nativeCall('release', [key]) } catch (e) {}
				var again = prep.map(function (a) { return typeof a === 'function' ? CALLBACK : a })
				await guarded('prepare|discord again', function () { return callPrepare(again) }, 300)
			}
			await nativeCall('play', [key])
		} catch (e) {
			note('play failed: ' + errorText(e))
			toast('Could not play it: ' + errorText(e).slice(0, 80))
		}
	}

	var soundFactory // Discord's own sound maker (createSound), found when the plugin starts
	var bypassUntil = 0 // while a preview of Discord's own sound plays, nothing is swapped for your version
	// The sounds the mobile app really has.
	var BUILT_IN = ['call_ringing', 'call_calling', 'user_join', 'user_leave', 'user_moved', 'disconnect', 'reconnect', 'mute', 'unmute', 'deafen', 'undeafen', 'camera_on', 'camera_off', 'stream_started', 'stream_ended', 'stream_user_joined', 'stream_user_left', 'ptt_start', 'ptt_stop', 'message1', 'message2', 'message3', 'mention1', 'mention2', 'mention3']

	/**
	 * Plays Discord's own version of a sound, for the preview buttons. It goes through Discord's own sound maker,
	 * never by loading a file name: that closed the app for sounds the phone does not have (Ducky, Lofi).
	 */
	function previewOriginal(id) {
		var known = keyOfName[keyOf(id)]
		if (BUILT_IN.indexOf(String(id)) >= 0 && soundFactory && typeof soundFactory.createSound === 'function') {
			try {
				bypassUntil = Date.now() + 6000
				var sound = soundFactory.createSound(id, id)
				sound.usage = 'media'
				Promise.resolve(sound.playWithListener()).then(
					function (ok) { if (!ok) toast('Discord could not play this sound.') },
					function (e) { note('Discord\'s sound failed: ' + errorText(e)) },
				)
				setTimeout(function () { try { sound.stop() } catch (e) {} }, 5000)
				return
			} catch (e) { note('Discord\'s sound maker failed: ' + errorText(e)) }
		}
		if (known !== undefined) return replayDiscords(known)
		note('no play for ' + id + ': not a sound the phone has')
		toast('The phone has no built-in version of this sound, so there is nothing to play. Your own version still works.')
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
	var lastSaid = {} // sound -> when it was last written to the log, so a repeating sound does not fill it
	/** Writes what happened to a sound Discord played, so a sound that is not replaced can be explained. */
	function said(name, why) {
		var line = 'sound ' + name + ': ' + why
		if (Date.now() - (lastSaid[line] || 0) < 3000) return
		lastSaid[line] = Date.now()
		note(line)
	}

	function handleSound(name, loop) {
		if (Date.now() < bypassUntil) return false
		var item = hear(name)
		var r
		try { r = resolve(item.key) } catch (e) {}
		item.replaced = !!r
		changed()
		if (!r) { said(name, 'Discord plays its own (nothing is set for it)'); return false }
		if (r.off) { said(name, 'silenced'); return true }
		var slot = ready[r.url]
		if (!slot) {
			said(name, 'Discord plays its own (yours is not loaded yet)')
			// Not downloaded yet: let Discord's own sound play this time, and get ours ready.
			if (layoutKnown() && !coolingDown(r.url)) ensureReady(r.url).catch(function () {})
			return false
		}
		if (!proven['play|' + (slot.source || 'file')]) { said(name, 'Discord plays its own (yours has not been tried on this phone yet)'); return false } // never played on this phone yet: Discord's own sound plays
		said(name, loop ? 'playing yours, repeating' : 'playing yours')
		startOurs(slot, r, loop).catch(function (e) { note('could not play: ' + errorText(e)) })
		return true
	}

	/** Plays your sound for a request from Discord. A ringtone repeats until Discord stops it. */
	async function startOurs(slot, r, loop) {
		if (slot.played) slot = await refresh(slot)
		slot.played = true
		autoVolume(slot, r.volume)
		if (loop && typeof orig.setNumberOfLoops === 'function') {
			try { await guarded('loops', function () { return nativeCall('setNumberOfLoops', [slot.key, -1]) }, 300) } catch (e) { note('looping: ' + errorText(e).slice(0, 90)) }
		}
		nativeCall('play', [slot.key])
	}

	/** Stops your version of a sound, when Discord stops its own (a ringtone ending). */
	function stopOurs(name) {
		var r
		try { r = resolve(keyOf(name)) } catch (e) {}
		var slot = r && !r.off && ready[r.url]
		if (slot && typeof orig.stop === 'function') { try { nativeCall('stop', [slot.key]) } catch (e) {} }
	}

	/** Runs one step of setting up, so a problem in one place never stops the rest. */
	function attempt(label, step) {
		try { step() } catch (e) { note(label + ' failed: ' + errorText(e)) }
	}

	// ---- Buzzing (haptics) ---------------------------------------------------------------------
	var hapticHooks = { menus: 'not found yet', libraries: 'none found', vibration: 'not found' }
	var buzzes = [] // { label, note, count, at }: buzzes that went by, newest first

	/** Remembers a buzz that went by, with what was done about it. The log gets a line the first time, then every 5 s. */
	function sawBuzz(label, what) {
		var item = buzzes.filter(function (x) { return x.label === label && x.note === what })[0]
		if (!item) {
			item = { label: label, note: what, count: 0 }
			buzzes.unshift(item)
			if (buzzes.length > 30) buzzes.pop()
		}
		item.count++
		if (!item.at || Date.now() - item.at > 5000) note('buzz: ' + label + ' -> ' + what + ' (' + item.count + 'x so far)')
		item.at = Date.now()
	}
	function shortArgs(args) {
		try { return Array.prototype.slice.call(args, 0, 2).map(function (a) { return typeof a === 'string' || typeof a === 'number' ? String(a) : typeof a }).join(', ') } catch (e) { return '' }
	}

	/** A haptic function that Discord's code calls: logged, and swallowed when its switch is off. */
	function hookBuzz(cleanup, holder, name, label) {
		if (!holder || typeof holder[name] !== 'function') return false
		cleanup(
			valenced.patcher.instead(holder, name, function (args, original) {
				var off = !setting('hapticOther')
				sawBuzz(label + '.' + name + '(' + shortArgs(args) + ')', off ? 'swallowed' : 'allowed')
				if (off) return /Async$/.test(name) ? Promise.resolve() : undefined
				return Reflect.apply(original, this, args)
			}),
		)
		return true
	}

	function installHaptics(cleanup) {
		// Long-press menus: Discord opens them with an option that skips the buzz.
		attempt('hooking menus', function () {
			var creators = valenced.discord.actions && valenced.discord.actions.ActionSheetActionCreators
			if (!creators || typeof creators.openLazy !== 'function') return note('Buzz: the menu opener was not found')
			cleanup(
				valenced.patcher.instead(creators, 'openLazy', function (args, original) {
					try {
						if (!setting('hapticMenus')) {
							args[2] = Object.assign({}, args[2], { disableHapticOnOpen: true })
							sawBuzz('Menu opened', 'buzz removed')
						} else sawBuzz('Menu opened', 'buzz kept')
					} catch (e) {}
					return Reflect.apply(original, this, args)
				}),
			)
			hapticHooks.menus = 'working'
		})
		// Haptic libraries, found by what they export.
		attempt('hooking haptic libraries', function () {
			var f = valenced.modules.finders
			var found = []
			function add(label) { found.push(label); hapticHooks.libraries = found.join(', '); note('Buzz: hooked ' + label); changed() }
			cleanup(
				f.getModules(f.filters.withProps('impactAsync', 'notificationAsync', 'selectionAsync'), function (module) {
					attempt('hooking the haptics library', function () {
						var holder = module && typeof module.impactAsync === 'function' ? module : module && module.default
						var any = false
						;['impactAsync', 'notificationAsync', 'selectionAsync'].forEach(function (n) { if (hookBuzz(cleanup, holder, n, 'haptics')) any = true })
						if (any) add('haptics')
					})
				}),
			)
			cleanup(
				f.getModules(f.filters.withProps('trigger', 'HapticFeedbackTypes'), function (module) {
					attempt('hooking the haptic feedback library', function () {
						var any = hookBuzz(cleanup, module, 'trigger', 'hapticFeedback')
						if (module && module.default && module.default !== module && hookBuzz(cleanup, module.default, 'trigger', 'hapticFeedback')) any = true
						if (any) add('haptic feedback')
					})
				}),
			)
			// Native modules, looked up by exact name only (their members are never listed).
			var natives = (valenced.react.ReactNative && valenced.react.ReactNative.NativeModules) || {}
			;[['RNHapticFeedback', ['trigger']], ['ExpoHaptics', ['impactAsync', 'notificationAsync', 'selectionAsync']]].forEach(function (pair) {
				var m = natives[pair[0]]
				if (!m) return
				var any = false
				pair[1].forEach(function (n) { if (hookBuzz(cleanup, m, n, pair[0])) any = true })
				if (any) add(pair[0])
			})
		})
		// Plain vibrations, from React Native's own Vibration API.
		attempt('hooking vibrations', function () {
			var vib = valenced.react.ReactNative && valenced.react.ReactNative.Vibration
			if (!vib || typeof vib.vibrate !== 'function') return
			cleanup(
				valenced.patcher.instead(vib, 'vibrate', function (args, original) {
					var off = !setting('hapticVibration')
					sawBuzz('Vibration', off ? 'swallowed' : 'allowed')
					if (off) return undefined
					return Reflect.apply(original, this, args)
				}),
			)
			hapticHooks.vibration = 'working'
		})
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
			if (Date.now() < bypassUntil) return Reflect.apply(original, this, args)
			if (!tails.play && args.length > 1) tails.play = args.slice(1).map(function (x) { return typeof x === 'function' ? noop : x })
			var sound = soundOf(first)
			var item = hear(sound || rawName(first), rawName(first))
			said(sound || rawName(first), 'reached the phone player')
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
			if (!proven['play|' + (slot.source || 'file')]) return Reflect.apply(original, this, args)
			if (slot.played) {
				var self = this
				refresh(slot).then(function (fresh) {
					fresh.played = true
					autoVolume(fresh, r.volume)
					Reflect.apply(original, self, [fresh.key].concat(args.slice(1)))
				}).catch(function (e) {
					note('could not play again: ' + errorText(e))
					try { Reflect.apply(original, self, args) } catch (x) {}
				})
				return undefined
			}
			slot.played = true
			autoVolume(slot, r.volume)
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
			var patchedClasses = []
			function nameOf(self) {
				var found
				var fields = []
				try {
					if (typeof self.name === 'string' && self.name.length < 90) found = keyOf((soundFromText(self.name) || { id: self.name }).id)
					Object.keys(self).forEach(function (k) {
						var v = self[k]
						if (typeof v === 'string' || typeof v === 'number') fields.push(k + '=' + String(v).slice(0, 40))
						if (!found && typeof v === 'string' && v.length < 90) {
							var sound = soundFromText(v)
							if (sound) found = keyOf(sound.id)
						}
					})
				} catch (e) {}
				if (!told) { told = true; note('Sound class fields: ' + fields.join(', ')) }
				return found
			}
			cleanup(
				f.getModules(
					f.filters.withProps('MobileAudioSound'),
					function (module) {
						var proto = module && module.MobileAudioSound && module.MobileAudioSound.prototype
						if (!proto || typeof proto.play !== 'function' || patchedClasses.indexOf(proto) >= 0) return
						patchedClasses.push(proto)
						attempt('patching the sound class', function () {
							cleanup(
								valenced.patcher.instead(proto, 'play', function (args, original) {
									try { var n = nameOf(this); if (n && handleSound(n)) return undefined } catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							if (typeof proto.loop === 'function') cleanup(
								valenced.patcher.instead(proto, 'loop', function (args, original) {
									try { var n = nameOf(this); if (n && handleSound(n, true)) return undefined } catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							if (typeof proto.playWithListener === 'function') cleanup(
								valenced.patcher.instead(proto, 'playWithListener', function (args, original) {
									try { var n = nameOf(this); if (n && handleSound(n)) return Promise.resolve(true) } catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							if (typeof proto.stop === 'function') cleanup(
								valenced.patcher.instead(proto, 'stop', function (args, original) {
									try { var n = nameOf(this); if (n) stopOurs(n) } catch (e) {}
									return Reflect.apply(original, this, args)
								}),
							)
							hooks.cls = 'working'
							note('Sound class hook: working')
							changed()
						})
					},
					{ max: Infinity },
				),
			)
		})

		attempt('finding the sound maker', function () {
			var f = valenced.modules.finders
			cleanup(f.getModules(f.filters.withProps('createSound', 'createSoundForPack', 'playSound'), function (module) { soundFactory = module }))
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

	/** Opens a link in the phone's browser. */
	function openLink(url) {
		try { valenced.react.ReactNative.Linking.openURL(url) } catch (e) { copyText(url, 'Link (the browser would not open)') }
	}
	/** Opens Discord's own page in the phone's settings. */
	function openPhoneSettings() {
		try { valenced.react.ReactNative.Linking.openSettings() } catch (e) { toast('Could not open the phone settings. Open them yourself: Apps, Discord, Notifications.') }
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

		/** Walks through setting the incoming call ringtone, which Android plays itself and a plugin cannot change. */
		function RingtoneScreen() {
			var ring = SOUNDS.filter(function (x) { return x.id === 'call_ringing' })[0]
			var options = ring ? variantsOf(ring) : []
			return page([
				backBar(),
				title('Incoming call ringtone', 'The phone plays this one itself, so it is set in Android, not here'),
				note2('When someone calls you, Android shows a call notification and plays its sound. Plugins cannot change that, but you can pick any sound file in your phone settings. It also works when the phone is locked or Discord is closed.'),
				group('Step 1: get a ringtone file', options.map(function (o) {
					return row(o.label + ' ringtone', 'Tap to download it in your browser', function () { openLink(o.url) })
				}).concat([
					row('Use my own sound', 'Any mp3 saved on your phone works too'),
				])),
				group('Or copy a link', options.map(function (o) {
					return row('Copy the ' + o.label + ' link', 'Paste it into any browser or download app', function () { copyText(o.url, o.label + ' link') })
				})),
				note2('If a download page says "Temporary Network Error", the problem is on Discord side, not yours. Wait a few minutes and try again.'),
				group('Step 2: pick it in Android', [
					row('Open Discord in your phone settings', 'Then: Notifications, the incoming call category, Sound', openPhoneSettings),
				]),
				note2('Easiest way: when a call comes in, press and hold the call notification (or swipe it a little and tap the gear). That opens the settings for that exact notification. Tap Sound and choose the file you downloaded, usually under Downloads or My sounds.'),
				note2('Or in the phone settings page, open Notifications and look for the category used for calls. Some phones, like Samsung, only show the categories once a call notification has appeared at least once.'),
				note2('Not every phone allows this. If the notification settings only have an on or off switch for sound, with no Sound choice (Samsung with Valenced does this), the call ringtone cannot be changed at all. Every other sound still can.'),
				note2('This sets one ringtone for good. It does not follow the Halloween or Winter packs, so change it again when you want another.'),
			])
		}

		function IdentifyScreen(screen) {
			return page([
				backBar(),
				title('Sound #' + screen.number, 'Discord played a sound it had loaded before this plugin started'),
				group('Find out which sound it is', [
					row('Play it', 'Listen to what Discord plays', function () { try { replayDiscords(screen.number) } catch (e) { note('play failed: ' + errorText(e)); toast('Could not play it. See Tools > Log.') } }),
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
						{ value: 'pack', label: 'Follow the pack', subLabel: activePackId() === 'none' ? 'No pack is on, so Discord\'s own sound plays' : 'Uses the ' + (SEASONS[activePackId()] ? SEASONS[activePackId()].name : (PRESETS[activePackId()] ? PRESETS[activePackId()].name : 'selected')) + ' pack when it has this sound' },
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
					String(Math.min(100, e.volume || 100)),
					VOLUMES.map(function (v) { return { value: String(v), label: v + '%', subLabel: v === 100 ? 'Normal' : undefined } }),
					function (v) { put(key, { volume: Number(v) }) },
				),
				group('Try it', [
					url ? row('Play my version', hostOf(url), function () { previewUrl(url, e.volume) }) : null,
					row('Play Discord\'s version', 'The sound as Discord has it', function () { previewOriginal(screen.id) }),
				]),
				button('Reset this sound', function () { put(key, { mode: 'discord', url: '', label: '', volume: 100 }); toast('Back to Discord\'s own sound') }),
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
				h(Design.TableRowGroup, { key: 'buzzing', title: 'Buzzing' }, [
					h(Design.TableSwitchRow, { key: 'hapticMenus', label: 'Buzz when a menu opens', subLabel: 'The buzz when you long-press a message, server or person', value: !!data.hapticMenus, onValueChange: function (v) { json.set({ hapticMenus: v }) } }),
					h(Design.TableSwitchRow, { key: 'hapticOther', label: 'Other haptic feedback', subLabel: 'Taps, switches and other small buzzes from Discord', value: !!data.hapticOther, onValueChange: function (v) { json.set({ hapticOther: v }) } }),
					h(Design.TableSwitchRow, { key: 'hapticVibration', label: 'Vibrations', subLabel: 'Longer vibrations an app asks for', value: !!data.hapticVibration, onValueChange: function (v) { json.set({ hapticVibration: v }) } }),
				]),
				note2('Turn a switch off to stop that buzz. If something still buzzes, Tools, then Copy the log, lists what Discord asked for. Menus: ' + hapticHooks.menus + ' · Haptics: ' + hapticHooks.libraries + ' · Vibrations: ' + hapticHooks.vibration),
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
				group('Phone ringtone', [row('Set up the incoming call ringtone', 'Android plays it itself, so it is set in your phone settings', function () { go({ name: 'ringtone' }) })]),
				group('Status', [
					row('Sound player', sm ? 'Found (DCDSoundManager)' : 'Not found on this phone'),
					row('File module', fileModule() ? 'Found' : 'Not found, links are played directly'),
					row('Safety', Object.keys(bad).length ? Object.keys(bad).length + ' step(s) skipped because they closed the app' : 'Nothing has closed the app', Object.keys(bad).length ? function () { bad = {}; var cleared = {}; Object.keys(json.cache && json.cache.bad || {}).forEach(function (k) { cleared[k] = false }); json.set({ bad: cleared }); toast('Skipped steps will be tried again') } : undefined),
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
					row('Copy all my settings', 'Share or keep a copy', function () { copyText(JSON.stringify({ sounds: data.sounds, userPacks: data.userPacks, activePack: data.activePack, autoPacks: data.autoPacks, hapticMenus: data.hapticMenus, hapticOther: data.hapticOther, hapticVibration: data.hapticVibration }), 'Settings') }),
					row('Paste settings from the clipboard', 'Replaces what you have now', function () {
						Promise.resolve(valenced.externals.ReactNativeClipboard.Clipboard.getString()).then(function (text) {
							var parsed
							try { parsed = JSON.parse(text) } catch (e) { return toast('That is not a settings backup') }
							json.set({ sounds: parsed.sounds || {}, userPacks: parsed.userPacks || {}, activePack: parsed.activePack || 'none', autoPacks: !!parsed.autoPacks, hapticMenus: parsed.hapticMenus !== false, hapticOther: parsed.hapticOther !== false, hapticVibration: parsed.hapticVibration !== false })
							setTimeout(warm, 400)
							toast('Settings restored')
						}, function () { toast('Could not read the clipboard') })
					}),
				]),
				group('Troubleshooting', [
					row('Download my sounds again', 'Clears what was loaded and loads it again', function () { ready = {}; failed = {}; failedAt = {}; toldAbout = {}; loading = {}; changed(); warm().then(function () { toast('Done') }) }),
					row('Copy the log', 'Send this when something does not work', function () { copyText((previousLog.length ? '--- before the app last closed ---\n' + previousLog.join('\n') + '\n--- this session ---\n' : '') + (diag.join('\n') || 'empty'), 'Log') }),
					row('Reset everything', 'Back to Discord\'s own sounds', function () {
						// Saving merges into what is there, so every sound and pack has to be named to be cleared.
						var cleared = {}
						Object.keys(setting('sounds') || {}).forEach(function (k) { cleared[k] = { mode: 'pack', url: '', label: '', volume: 100 } })
						var removed = {}
						Object.keys(setting('userPacks') || {}).forEach(function (id) { removed[id] = { deleted: true } })
						json.set({ sounds: cleared, userPacks: removed, activePack: 'none', autoPacks: false, enabled: true, hapticMenus: true, hapticOther: true, hapticVibration: true })
						ready = {}; failed = {}; failedAt = {}
						toast('Everything was reset')
					}),
				]),
				group('Log', diag.slice(-8).map(function (l, i) { return row(l, undefined, undefined, { key: 'log' + i }) })),
				group('About', [
					row('What this does', 'Replaces the sounds Discord plays inside the app (calls, mute, deafen, join, leave, messages) with your own links or a ready-made pack such as Halloween or Winter. Pick a sound on the Sounds tab, or switch a whole pack on in the Packs tab. The Sounds tab also has switches for the buzzing from Discord (haptics).'),
					row('What it cannot change', 'Sounds that Android plays itself: the incoming call ringtone and message notifications, especially when the app is closed or the phone is locked. Those follow your phone settings.'),
					row('Good to know', 'Your sounds play from their links, so they need internet. If the app ever closes during a step, the plugin skips that step from then on. When something does not work, send the log from this tab.'),
				]),
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
			if (screen.name === 'ringtone') return RingtoneScreen()
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
			// Settings load in the background, and `cache` is empty until they have. Everything that reads a saved
			// setting (safety flags, the layout that worked, sound names) has to wait for that.
			var loaded = Promise.resolve(storage && typeof storage.get === 'function' ? storage.get() : undefined).catch(function () {})
			journalReady = loaded.then(function () {
				attempt('loading safety flags', function () {
					var savedBad = setting('bad') || {}
					var savedProven = setting('proven') || {}
					bad = {}
					proven = {}
					Object.keys(savedBad).forEach(function (k) { if (savedBad[k]) bad[k] = true })
					Object.keys(savedProven).forEach(function (k) { if (savedProven[k]) proven[k] = true })
				})
				restoreLayout()
				attempt('loading saved sound names', function () {
					var saved = setting('keyNames') || {}
					Object.keys(saved).forEach(function (n) { if (nameOfKey[n] === undefined) { nameOfKey[n] = saved[n]; keyOfName[saved[n]] = Number(n) } })
				})
				return journalCheck()
			}).catch(function () {}).then(loadPreviousLog).catch(function () {})
			installPatches(cleanup)
			attempt('hooking buzzing', function () { installHaptics(cleanup) })
			// Sounds are loaded once the settings are in, so the first ring after a restart already uses yours.
			journalReady.then(function () { setTimeout(warm, 1500) })
			// Packs that switch with the date: look again once an hour, so a new season starts without a restart.
			var lastPack
			journalReady.then(function () { lastPack = activePackId() })
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
