(function (exports) {
	/*
	 * Spotify Tools for Valenced: Listen Along, and sending your song as a listen along invite, a song
	 * link or an album link from the + menu.
	 * Based on the "Add Listen Along" and "Send Spotify invite" modules of nexpid's NexxUtils for
	 * Revenge (CC BY 4.0), https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var TOAST = 'ESKIMO_SPOTIFY_TOOLS'
	var defaults = {
		listenAlong: true,
		sendInvite: true,
		sendSongLink: true,
		sendAlbumLink: true,
		plusMenu: true,
	}

	var storage
	var spotifyActions
	// Rows of the + menu.
	var PLUS_LABELS = { Camera: 1, Photos: 1, Poll: 1, Files: 1, Apps: 1 }

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text }) } catch (e) {}
	}
	/** A switch that is on unless it was turned off. */
	function enabled(key) {
		var s = storage && storage.cache
		return !s || s[key] !== false
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

	/** Runs `callback` after the next Spotify player update. */
	function onceAfterPlayerState(callback) {
		var off
		var done = false
		off = valenced.discord.flux.onFluxEventDispatched('SPOTIFY_PLAYER_STATE', function (payload) {
			if (!done) {
				done = true
				if (off) off()
				setTimeout(callback, 0)
			}
			return payload
		})
	}

	function findIcon(names) {
		for (var i = 0; i < names.length; i++) {
			var icon = valenced.utils.discord.lookupGeneratedIconComponent(names[i])
			if (icon) return icon
		}
	}

	// ---- Patching a component of any shape -----------------------------------------------------
	/**
	 * Patches module[key] whatever it is: a class, a function component, or a memo / forwardRef
	 * wrapper. `decorate(ret, props)` gets the element it rendered and returns the one to use.
	 * Returns false when the component is none of those.
	 */
	function patchComponent(module, key, decorate, cleanup) {
		var value = module[key]
		var patch = function (obj, k, getProps) {
			cleanup(
				valenced.patcher.instead(obj, k, function (args, original) {
					var ret = Reflect.apply(original, this, args)
					try {
						return decorate(ret, getProps.call(this, args))
					} catch (e) {
						return ret
					}
				}),
			)
		}
		var fromThis = function () { return this.props }
		var fromArgs = function (args) { return args[0] }
		if (typeof value === 'function') {
			if (value.prototype && typeof value.prototype.render === 'function') patch(value.prototype, 'render', fromThis)
			else patch(module, key, fromArgs)
			return true
		}
		if (value && typeof value === 'object') {
			if (typeof value.type === 'function') {
				if (value.type.prototype && typeof value.type.prototype.render === 'function') patch(value.type.prototype, 'render', fromThis)
				else patch(value, 'type', fromArgs)
				return true
			}
			if (typeof value.render === 'function') {
				patch(value, 'render', fromArgs)
				return true
			}
		}
		return false
	}

	// ---- What is playing -----------------------------------------------------------------------
	/**
	 * What you are listening to. Discord's Spotify store is empty on some phones even while Spotify is
	 * playing, so fall back to your own presence, the activity other people see.
	 */
	function mySpotifyActivity() {
		var spotify = store('SpotifyStore')
		var own = spotify && spotify.getActivity && spotify.getActivity()
		if (own && own.party && own.party.id) return own
		try {
			var self = store('UserStore').getCurrentUser()
			var presence = store('PresenceStore')
			var list = (self && presence && presence.getActivities && presence.getActivities(self.id)) || []
			for (var i = 0; i < list.length; i++) {
				var a = list[i]
				if (a && a.type === 2 && (a.name === 'Spotify' || String(a.id || '').indexOf('spotify') === 0 || String((a.party && a.party.id) || '').indexOf('spotify:') === 0)) return a
			}
		} catch (e) {}
		return own
	}

	function userIdOf(activity) {
		var id = activity && activity.party && activity.party.id
		return typeof id === 'string' && id.indexOf(':') > 0 ? id.split(':')[1] : undefined
	}

	/** The song playing on your own Spotify. */
	function currentTrack() {
		var spotify = store('SpotifyStore')
		var track = spotify.getTrack && spotify.getTrack()
		var activity = mySpotifyActivity()
		var meta = (activity && activity.metadata) || {}
		var albumId = (track && track.album && track.album.id) || meta.album_id
		if (!albumId && typeof meta.context_uri === 'string') {
			var m = /^spotify:album:(\w+)/.exec(meta.context_uri)
			if (m) albumId = m[1]
		}
		return {
			trackId: (track && track.id) || (activity && activity.sync_id),
			albumId: albumId,
		}
	}

	// ---- Listen along --------------------------------------------------------------------------
	/** Why the button can't be used right now, or false when it can. */
	function disabledReason(activity, userId) {
		var self = store('UserStore').getCurrentUser()
		var mine = mySpotifyActivity()
		if (self && self.id === userId) return 'Listen along with someone else, not yourself.'
		if (mine && mine.party && mine.party.id === activity.party.id) return "You're already along for this ride."
		return false
	}

	function rest() {
		var f = finders()
		return f.lookupModule(f.filters.withProps('get', 'post', 'patch'))[0] || f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0]
	}

	/**
	 * The Spotify sign-in Discord holds for you. Discord's own store has it when Spotify is the active
	 * player, and otherwise the linked account is asked for a fresh token.
	 */
	async function spotifyAccess() {
		var sd = store('SpotifyStore').getActiveSocketAndDevice && store('SpotifyStore').getActiveSocketAndDevice()
		var socket = sd && (sd.socket || sd)
		var token = socket && socket.accessToken
		var accountId = socket && socket.accountId
		var http = rest()
		if (!token && http && http.get) {
			try {
				if (!accountId) {
					var list = await http.get({ url: '/users/@me/connections' })
					var linked = ((list && list.body) || []).find(function (c) { return c && c.type === 'spotify' && !c.revoked })
					accountId = linked && linked.id
				}
				if (accountId) {
					var res = await http.get({ url: '/users/@me/connections/spotify/' + accountId + '/access-token' })
					token = res && res.body && res.body.access_token
				}
			} catch (e) {}
		}
		return { token: token, deviceId: sd && sd.device && sd.device.id }
	}

	/** A device to play on: the one Spotify says is active, otherwise the first one it lists. */
	async function pickDevice(token) {
		try {
			var res = await fetch('https://api.spotify.com/v1/me/player/devices', { headers: { Authorization: 'Bearer ' + token } })
			if (!res.ok) return undefined
			var body = await res.json()
			var devices = ((body && body.devices) || []).filter(function (d) { return d && !d.is_restricted })
			var chosen = devices.find(function (d) { return d.is_active }) || devices[0]
			return chosen && chosen.id
		} catch (e) {
			return undefined
		}
	}

	/** Plays the other person's track at their position, through Spotify's own web API. */
	async function playThroughSpotify(activity) {
		try {
			var access = await spotifyAccess()
			if (!access.token) throw new Error('No Spotify sign-in found. Link Spotify in Discord and open the Spotify app.')
			var trackId = activity.sync_id
			if (!trackId) throw new Error('This activity has no track to play.')
			var start = activity.timestamps && activity.timestamps.start
			var position = start ? Math.max(0, Date.now() - start) : 0
			var deviceId = access.deviceId || (await pickDevice(access.token))
			var url = 'https://api.spotify.com/v1/me/player/play' + (deviceId ? '?device_id=' + encodeURIComponent(deviceId) : '')
			var res = await fetch(url, {
				method: 'PUT',
				headers: { Authorization: 'Bearer ' + access.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: position }),
			})
			if (!res.ok) {
				var why = { 401: 'Spotify sign-in expired. Open Spotify and try again.', 403: 'Spotify Premium is needed to listen along.', 404: 'No Spotify device found. Open Spotify on this phone first.', 429: 'Spotify is busy. Try again in a moment.' }[res.status]
				throw new Error(why || 'Spotify said no (' + res.status + ').')
			}
			toast('Listening along')
			return true
		} catch (e) {
			toast(String((e && e.message) || e))
			return false
		}
	}

	/** Starts listening along. Returns false right away, or a promise of whether it started. */
	function listen(reason, activity, userId) {
		if (typeof reason === 'string') return toast(reason), false
		var f = finders()
		var actions = spotifyActions || f.lookupModule(f.filters.withProps('play', 'sync'))[0]
		if (actions) {
			try {
				if (store('SpotifyStore').getActivity()) actions.sync(activity, userId)
				else {
					onceAfterPlayerState(function () { actions.sync(activity, userId) })
					actions.play(activity, userId)
				}
				return Promise.resolve(true)
			} catch (e) {}
		}
		return playThroughSpotify(activity)
	}

	function ListenButton(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var tick = React.useState(0)
		var loadingState = React.useState(false)
		React.useEffect(function () {
			return valenced.discord.flux.onFluxEventDispatched('SPOTIFY_PLAYER_STATE', function (payload) {
				setTimeout(function () { tick[1](function (n) { return n + 1 }) }, 0)
				return payload
			})
		}, [])
		var activity = props.activity
		var userId = userIdOf(activity)
		var reason = userId ? disabledReason(activity, userId) : 'No listener found'
		var loading = loadingState[0] && !reason
		var Icon = findIcon(['UserPlayIcon', 'MusicIcon', 'PlayIcon'])
		var press = function () {
			if (loading) return
			var started = listen(reason, activity, userId)
			if (started) {
				loadingState[1](true)
				var done = function () { loadingState[1](false) }
				Promise.resolve(started).then(function () { setTimeout(done, 2500) }, done)
				setTimeout(done, 15000)
			}
		}
		var control = Icon
			? h(Design.IconButton, {
					size: 'md',
					variant: 'secondary',
					loading: loading,
					icon: h(Icon, { size: 'sm' }),
					accessibilityLabel: 'Listen along',
					onPress: press,
					style: reason ? { opacity: 0.5 } : undefined,
			  })
			: h(Design.Button, { size: 'md', variant: 'secondary', text: 'Along', loading: loading, onPress: press })
		return h(
			RN.View,
			{ style: { flexDirection: 'row', flex: 1, alignItems: 'stretch' } },
			h(RN.View, { style: { paddingRight: 6 } }, control),
			h(RN.View, { style: { flex: 1, minWidth: 0 } }, props.button),
		)
	}

	/** Finds the Spotify activity in whatever props the button received. */
	function activityFrom(props) {
		if (!props) return undefined
		if (userIdOf(props.activity)) return props.activity
		if (userIdOf(props)) return props
		if (props.party && userIdOf(props.party)) return props.party
	}

	function decorateListen(ret, props) {
		if (!ret || !enabled('listenAlong')) return ret
		var activity = activityFrom(props)
		return activity ? h(ListenButton, { button: ret, activity: activity }) : ret
	}

	// ---- Sending -------------------------------------------------------------------------------
	/** Sends a message to the chat you last had open. */
	function sendMessage(message, clearDraft, options) {
		var f = finders()
		var messages = f.lookupModule(f.filters.withProps('sendMessage', 'revealMessage'))[0]
		var channel = store('SelectedChannelStore').getChannelId()
		if (!messages || !channel) return toast('Open a chat first, then try again.'), false
		messages.sendMessage(
			channel,
			Object.assign({ tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, message(channel)),
			clearDraft,
			options || {},
		)
		return channel
	}

	/** The invite card for the song you are playing. Uses what you typed as its message. */
	function sendInvite() {
		var activity = mySpotifyActivity()
		if (!activity || !activity.party || !activity.party.id) return toast('Play something on Spotify first.')
		var draft = store('DraftStore')
		var channel = sendMessage(
			function (id) { return { content: (draft && draft.getDraft(id, 0)) || '' } },
			true,
			{ activityAction: { activity: activity, type: 3 } },
		)
		if (!channel) return
		var f = finders()
		var drafts = f.lookupModule(f.filters.withProps('clearDraft'))[0]
		if (drafts) drafts.clearDraft(channel, 0)
		var info = store('ChannelStore') && store('ChannelStore').getChannel(channel)
		toast('Invite sent' + (info && info.name ? ' to #' + info.name : ''))
	}

	function sendSongLink() {
		var t = currentTrack()
		if (!t.trackId) return toast('Play something on Spotify first.')
		if (sendMessage(function () { return { content: 'https://open.spotify.com/track/' + t.trackId } }, false)) toast('Song link sent')
	}

	function sendAlbumLink() {
		var t = currentTrack()
		if (!t.trackId) return toast('Play something on Spotify first.')
		if (!t.albumId) return toast('Could not find the album for this song.')
		if (sendMessage(function () { return { content: 'https://open.spotify.com/album/' + t.albumId } }, false)) toast('Album link sent')
	}

	// ---- The menus -----------------------------------------------------------------------------
	var OPTIONS = [
		{ setting: 'sendInvite', label: 'Send listen along', run: function () { sendInvite() } },
		{ setting: 'sendSongLink', label: 'Send song link', run: function () { sendSongLink() } },
		{ setting: 'sendAlbumLink', label: 'Send playing album', run: function () { sendAlbumLink() } },
	]

	function wantedOptions() {
		return OPTIONS.filter(function (option) { return enabled(option.setting) })
	}

	var assetNames = new Map()
	/** The name of an icon, from its asset ID or its icon component. The same in every language. */
	function iconName(item) {
		if (!item || typeof item !== 'object') return ''
		var src = item.iconSource
		if (typeof src === 'number') {
			if (assetNames.has(src)) return assetNames.get(src)
			var name = ''
			try {
				var a = valenced.assets.AssetsRegistry.getAssetByID(src)
				name = (a && a.name) || ''
			} catch (e) {}
			assetNames.set(src, name)
			return name
		}
		var Component = item.IconComponent
		return (Component && (Component.displayName || Component.name)) || ''
	}

	// What the + menu icons are called: a camera, a picture, a poll, a paperclip, an app.
	var PLUS_ICONS = [/camera/i, /image|photo|picture|gallery/i, /poll/i, /paperclip|attach|file|document/i, /\bapps?\b|sparkle|robot|bot/i]
	function plusScore(items) {
		var found = {}
		var strong = false
		items.forEach(function (item) {
			var name = iconName(item)
			if (!name) return
			PLUS_ICONS.forEach(function (re, i) {
				if (re.test(name)) {
					found[i] = true
					if (i === 0 || i === 2) strong = true
				}
			})
		})
		return strong ? Object.keys(found).length : 0
	}

	function countLabels(list, labels) {
		var hits = 0
		for (var i = 0; i < list.length; i++) {
			var label = list[i] && typeof list[i] === 'object' && list[i].label
			if (typeof label === 'string' && labels[label] === 1) hits++
		}
		return hits
	}

	/**
	 * Discord's menus are data driven: a list of items (label, action, iconSource) goes in, and the menu
	 * draws the rows, tracks which one is pressed and runs the action by its place in the list. So the
	 * options are added to that list, before the menu draws anything.
	 */
	function decorateItems(result, items) {
		if (!enabled('plusMenu')) return result
		if (countLabels(items, PLUS_LABELS) < 2 && plusScore(items) < 3) return result
		var wanted = wantedOptions()
		if (!wanted.length) return result
		for (var i = 0; i < items.length; i++)
			if (items[i] && OPTIONS.some(function (option) { return option.label === items[i].label })) return result
		var template = items.find(function (item) { return item && typeof item.label === 'string' })
		if (!template) return result
		var Icon = findIcon(['SpotifyNeutralIcon', 'MusicIcon', 'PlayIcon'])
		var assetId = valenced.assets.getAssetIdByName('ic_spotify_white_16px')
		var extra = wanted.map(function (option) {
			var lastPress = 0
			var press = function () {
				// One tap can reach more than one handler, so only the first one counts.
				if (Date.now() - lastPress < 1500) return
				lastPress = Date.now()
				try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
				setTimeout(option.run, 0)
			}
			var item = Object.assign({}, template, { label: option.label })
			// Nothing of the item it was copied from may remain: its action, its icon or its identity.
			;['id', 'key', 'testID', 'nativeID', 'index', 'state'].forEach(function (name) { delete item[name] })
			;['action', 'onPress', 'onSelect', 'onClick', 'callback', 'handler'].forEach(function (name) {
				if (name in template || name === 'action') item[name] = press
			})
			if (assetId != null) item.iconSource = assetId
			else delete item.iconSource
			if ('IconComponent' in template || Icon) {
				if (Icon) item.IconComponent = Icon
				else delete item.IconComponent
			}
			return item
		})
		return valenced.react.React.cloneElement(result, { items: items.concat(extra) })
	}

	/** Looks at every element Discord creates, and adds the options to the + menu. */
	function decorateMenu(result) {
		try {
			var props = result && result.props
			if (!props) return result
			if (Array.isArray(props.items) && props.items.length >= 2 && props.items.length <= 24)
				return decorateItems(result, props.items)
			return result
		} catch (e) {
			return result
		}
	}

	function installMenuHook(cleanup) {
		var f = finders()
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, decorateMenu))
		})
	}

	// ---- Settings ------------------------------------------------------------------------------
	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var settings = Object.assign({}, defaults, json.use())
		function toggle(key, label, subLabel) {
			return h(Design.TableSwitchRow, {
				key: key,
				label: label,
				subLabel: subLabel,
				value: settings[key] !== false,
				onValueChange: function (value) {
					var patch = {}
					patch[key] = value
					json.set(patch)
				},
			})
		}
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Listen along' },
					toggle('listenAlong', 'Listen along button', "Adds a button next to Play on Spotify on other people's Spotify activity"),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Send options' },
					toggle('sendInvite', 'Send listen along', 'The invite card for the song you are playing'),
					toggle('sendSongLink', 'Send song link', 'A link to the song you are playing'),
					toggle('sendAlbumLink', 'Send playing album', 'A link to the album you are playing'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Where it shows up' },
					toggle('plusMenu', '+ menu', 'Adds the send options to the menu you get when you tap + next to the message box'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'About' },
					h(Design.TableRow, { key: 'needs', label: 'Before you start', subLabel: 'Spotify must be linked to Discord. Listening along needs Spotify Premium and Spotify open on your phone.' }),
					h(Design.TableRow, { key: 'credit', label: 'Credit', subLabel: "Based on nexpid's NexxUtils for Revenge." }),
				),
			),
		)
	}

	// ---- Plugin --------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			storage = api.jsonStorage
			var f = finders()

			// The Listen Along button goes next to Play on Spotify, in either of its two forms.
			;['SpotifyPlayButton', 'PlayOnSpotifyButton'].forEach(function (name) {
				cleanup(
					f.getModules(f.filters.withProps(name), function (module) {
						patchComponent(module, name, decorateListen, cleanup)
					}),
				)
			})

			// Discord's own Spotify controls are used for listening along when this version has them.
			;[['play', 'sync'], ['sync', 'pause']].forEach(function (names) {
				cleanup(
					f.getModules(f.filters.withProps.apply(null, names), function (module) {
						if (!spotifyActions) spotifyActions = module
					}),
				)
			})
			cleanup(function () { spotifyActions = undefined })

			try {
				installMenuHook(cleanup)
			} catch (e) {}
		},
	})
	return exports
})({})
