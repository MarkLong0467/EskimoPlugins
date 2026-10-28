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
	// Used when you set no Application ID, so image links and buttons work out of the box.
	var FALLBACK_APP_ID = '1054951789318909972'

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
		{ v: 'countdown', l: 'Countdown from applied' },
		{ v: 'custom', l: 'Custom start and end' },
	]
	var PROFILE_KEYS = [
		'label', 'name', 'type', 'details', 'state', 'applicationId', 'streamUrl',
		'largeImage', 'largeText', 'smallImage', 'smallText',
		'timestampMode', 'customStart', 'customEnd', 'countdownMinutes',
		'partyCurrent', 'partyMax',
		'button1Label', 'button1Url', 'button2Label', 'button2Url',
	]

	function newProfile(id, label) {
		return {
			id: id, label: label, name: 'Eskimo', type: 0, details: '', state: '',
			applicationId: '', streamUrl: '',
			largeImage: '', largeText: '', smallImage: '', smallText: '',
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

	/** Turns image URLs into Discord asset IDs. Asset keys and mp: IDs pass through unchanged. */
	async function resolveImage(appId, value) {
		var v = fill(value)
		if (typeof v !== 'string' || !(v = v.trim())) return undefined
		if (!/^https?:\/\//i.test(v)) return v
		appId = appId || FALLBACK_APP_ID
		var key = appId + '|' + v
		if (assetCache.has(key)) return assetCache.get(key)
		var finders = valenced.modules.finders
		var utils =
			finders.lookupModule(finders.filters.withProps('fetchAssetIds'))[0] ||
			finders.lookupModule(finders.filters.withProps('getAssetIds'))[0]
		if (!utils) return undefined
		var ids
		try {
			ids = utils.getAssetIds && utils.getAssetIds(appId, [v])
		} catch (e) {}
		if (!ids || !ids.length) ids = await utils.fetchAssetIds(appId, [v])
		var id = ids && ids[0]
		if (id) assetCache.set(key, id)
		return id
	}

	async function buildActivity(p) {
		var activity = { name: text(p.name) || 'Eskimo', type: Number(p.type) || 0, flags: 0 }
		var appId = String(p.applicationId || '').trim() || FALLBACK_APP_ID
		activity.application_id = appId
		var details = text(p.details)
		var state = text(p.state)
		if (details) activity.details = details
		if (state) activity.state = state
		if (activity.type === 1) {
			var url = text(p.streamUrl)
			if (url) activity.url = url
		}

		if (p.timestampMode === 'elapsed') activity.timestamps = { start: appliedAt }
		else if (p.timestampMode === 'countdown') {
			var minutes = num(p.countdownMinutes) || 0
			activity.timestamps = { end: appliedAt + minutes * 60000 }
		} else if (p.timestampMode === 'custom') {
			var start = parseTime(p.customStart)
			var end = parseTime(p.customEnd)
			if (start !== undefined || end !== undefined) {
				activity.timestamps = {}
				if (start !== undefined) activity.timestamps.start = start
				if (end !== undefined) activity.timestamps.end = end
			}
		}

		var cur = num(p.partyCurrent)
		var max = num(p.partyMax)
		if (cur !== undefined && max !== undefined && max > 0)
			activity.party = { id: 'eskimo-party', size: [Math.min(cur, max), max] }

		var assets = {}
		var li = await resolveImage(appId, p.largeImage)
		var si = await resolveImage(appId, p.smallImage)
		if (li) assets.large_image = li
		if (si) assets.small_image = si
		var lt = text(p.largeText)
		var st = text(p.smallText)
		if (lt && li) assets.large_text = lt
		if (st && si) assets.small_text = st
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

	async function apply(resetTimer) {
		if (!active) return
		if (resetTimer) appliedAt = Date.now()
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
		applyTimer = setTimeout(function () { apply(resetTimer) }, 400)
	}

	function restartRefresh() {
		clearInterval(refreshTimer)
		refreshTimer = undefined
		var seconds = num(read().refreshSeconds) || 0
		if (seconds > 0)
			refreshTimer = setInterval(function () { apply(false) }, Math.max(15, seconds) * 1000)
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
				var timer = setTimeout(function () { props.onCommit(value) }, 500)
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

	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var Page = valenced.components.Page
		var Clipboard = valenced.externals.ReactNativeClipboard.Clipboard
		var store = props.api.jsonStorage
		storage = store
		var settings = merge(store.use())
		var profile = currentProfile(settings)

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
			radio('Activity type', profile.type, TYPES, function (type) { update({ type: type }) }),
			field('name', 'Activity name', 'Eskimo', 'The text after the activity type. Supports variables.', 128),
			field('details', 'Details', '', 'First line. Supports variables.', 128),
			field('state', 'State', '', 'Second line. Supports variables.', 128),
			profile.type === 1
				? field('streamUrl', 'Stream URL', 'https://twitch.tv/name', 'A Twitch or YouTube link.', 300)
				: null,
			field('applicationId', 'Application ID', '', 'Optional. Use your own application for asset keys. Image links and buttons work without one.', 24),
			field('largeImage', 'Large image', 'https://… or asset key', 'A direct image link or an asset key.', 300),
			field('largeText', 'Large image text', '', 'Shown when hovering the large image.', 128),
			field('smallImage', 'Small image', 'https://… or asset key', 'Shown in the corner of the large image.', 300),
			field('smallText', 'Small image text', '', '', 128),
			radio('Timer', profile.timestampMode, TIME_MODES, function (timestampMode) { update({ timestampMode: timestampMode }, true) }),
			profile.timestampMode === 'countdown'
				? field('countdownMinutes', 'Countdown minutes', '30', 'The timer counts down to zero.', 6)
				: null,
			profile.timestampMode === 'custom'
				? [
						field('customStart', 'Start time', '2026-01-01 12:00', 'A date or a Unix time in seconds or milliseconds.', 40),
						field('customEnd', 'End time', '', 'Optional. Shows a countdown when set.', 40),
				  ]
				: null,
			field('partyCurrent', 'Party size', '1', 'Current players. Set the maximum below as well.', 4),
			field('partyMax', 'Party maximum', '4', '', 4),
			field('button1Label', 'Button 1 label', '', 'A button needs a label and a link.', 32),
			field('button1Url', 'Button 1 link', 'https://', '', 300),
			field('button2Label', 'Button 2 label', '', '', 32),
			field('button2Url', 'Button 2 link', 'https://', '', 300),
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
			Page,
			null,
			children.reduce(function (all, item) { return all.concat(item) }, []),
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
