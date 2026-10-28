(function (exports) {
	/*
	 * Spotify Tools for Valenced: Listen Along buttons and Send Spotify Invite.
	 * Based on the "Add Listen Along" and "Send Spotify invite" modules of nexpid's NexxUtils for
	 * Revenge (CC BY 4.0), https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var TOAST = 'ESKIMO_SPOTIFY_TOOLS'
	var defaults = { listenAlong: true, sendInvite: true, sendSongLink: true, sendAlbumLink: true, popupRows: false }

	var storage
	var spotifyActions
	var status = {}
	var counters = { shown: 0, skipped: 0, popup: 0, sheet: 0 }
	var MENU_LABELS = { Camera: 1, Photos: 1, Poll: 1, Files: 1, Apps: 1 }
	var listeners = []

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text }) } catch (e) {}
	}
	function enabled(key) {
		var s = storage && storage.cache
		return !s || s[key] !== false
	}
	/** For switches that start off. */
	function optedIn(key) {
		var s = storage && storage.cache
		return !!s && s[key] === true
	}
	function setStatus(key, ok, detail) {
		status[key] = { ok: ok, detail: detail }
		notify()
	}
	function notify() {
		listeners.forEach(function (listener) { listener() })
	}
	function useRefresh() {
		var React = valenced.react.React
		var tick = React.useState(0)
		React.useEffect(function () {
			var listener = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(listener)
			return function () { listeners = listeners.filter(function (l) { return l !== listener }) }
		}, [])
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

	// ---- Patching any component shape ---------------------------------------------------------
	/** Describes a component for the diagnostics. */
	function shapeOf(value) {
		if (value === undefined || value === null) return String(value)
		if (typeof value === 'function')
			return value.prototype && typeof value.prototype.render === 'function' ? 'class' : 'function'
		if (typeof value === 'object') {
			if (typeof value.type === 'function') return 'memo of ' + shapeOf(value.type)
			if (typeof value.render === 'function') return 'forwardRef'
			return 'object (' + Object.keys(value).slice(0, 6).join(', ') + ')'
		}
		return typeof value
	}

	/**
	 * Patches module[key] whatever it is: a class, a function component, or a memo / forwardRef
	 * wrapper. `decorate(ret, props)` gets the element it rendered and returns the one to use.
	 * Returns the shape it patched, or undefined when it could not.
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
						console.warn('[spotify-tools] decorate failed:', String(e))
						return ret
					}
				}),
			)
		}
		var fromThis = function () { return this.props }
		var fromArgs = function (args) { return args[0] }
		if (typeof value === 'function') {
			if (value.prototype && typeof value.prototype.render === 'function') {
				patch(value.prototype, 'render', fromThis)
				return 'class'
			}
			patch(module, key, fromArgs)
			return 'function'
		}
		if (value && typeof value === 'object') {
			if (typeof value.type === 'function') {
				if (value.type.prototype && typeof value.type.prototype.render === 'function') {
					patch(value.type.prototype, 'render', fromThis)
					return 'memo of class'
				}
				patch(value, 'type', fromArgs)
				return 'memo of function'
			}
			if (typeof value.render === 'function') {
				patch(value, 'render', fromArgs)
				return 'forwardRef'
			}
		}
	}

	// ---- Listen along -------------------------------------------------------------------------
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
				if (a && a.type === 2 && (a.name === 'Spotify' || String(a.id || '').indexOf('spotify') === 0)) return a
			}
		} catch (e) {}
		return own
	}

	function userIdOf(activity) {
		var id = activity && activity.party && activity.party.id
		return typeof id === 'string' && id.indexOf(':') > 0 ? id.split(':')[1] : undefined
	}

	/** Why the button can't be used right now, or false when it can. */
	function disabledReason(activity, userId) {
		var self = store('UserStore').getCurrentUser()
		var spotify = store('SpotifyStore')
		var mine = mySpotifyActivity()
		if (self && self.id === userId) return 'Listen along with someone else, not yourself.'
		if (mine && mine.party && mine.party.id === activity.party.id) return "You're already along for this ride."
		var protocol = store('SpotifyProtocolStore')
		var canPlay = !!spotify.getActiveSocketAndDevice() || !!(protocol && protocol.isProtocolRegistered())
		if (!spotify.hasConnectedAccount() || !canPlay) return 'Spotify is not detected'
		return false
	}

	/** The Spotify sign-in Discord already holds, and the device Spotify is playing on. */
	async function spotifyAccess() {
		var sd = store('SpotifyStore').getActiveSocketAndDevice && store('SpotifyStore').getActiveSocketAndDevice()
		var socket = sd && (sd.socket || sd)
		var token = socket && socket.accessToken
		if (!token && socket && socket.accountId) {
			// Ask Discord for a fresh token for the linked account.
			var f = finders()
			var http = f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0]
			if (http) {
				try {
					var res = await http.get({ url: '/users/@me/connections/spotify/' + socket.accountId + '/access-token' })
					token = res && res.body && res.body.access_token
				} catch (e) {}
			}
		}
		return { token: token, deviceId: sd && sd.device && sd.device.id }
	}

	/** Plays the other person's track at their position, through Spotify's own web API. */
	async function playThroughSpotify(activity) {
		try {
			var access = await spotifyAccess()
			if (!access.token) throw new Error('No Spotify sign-in found. Open Spotify and link it in Discord.')
			var trackId = activity.sync_id
			if (!trackId) throw new Error('This activity has no track to play.')
			var start = activity.timestamps && activity.timestamps.start
			var position = start ? Math.max(0, Date.now() - start) : 0
			var url = 'https://api.spotify.com/v1/me/player/play' + (access.deviceId ? '?device_id=' + encodeURIComponent(access.deviceId) : '')
			var res = await fetch(url, {
				method: 'PUT',
				headers: { Authorization: 'Bearer ' + access.token, 'Content-Type': 'application/json' },
				body: JSON.stringify({ uris: ['spotify:track:' + trackId], position_ms: position }),
			})
			if (!res.ok) {
				var why = { 401: 'Spotify sign-in expired. Open Spotify and try again.', 403: 'Spotify Premium is needed to listen along.', 404: 'No active Spotify device. Open Spotify on this phone first.', 429: 'Spotify is busy. Try again in a moment.' }[res.status]
				throw new Error(why || 'Spotify said no (' + res.status + ').')
			}
			setStatus('method', true, "last listen used Spotify's web API")
			toast('Listening along')
			return true
		} catch (e) {
			setStatus('method', false, String((e && e.message) || e))
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
				setStatus('method', true, "last listen used Discord's own controls")
				return Promise.resolve(true)
			} catch (e) {}
		}
		return playThroughSpotify(activity)
	}

	function findIcon(names) {
		for (var i = 0; i < names.length; i++) {
			var icon = valenced.utils.discord.lookupGeneratedIconComponent(names[i])
			if (icon) return icon
		}
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
			{ style: { flexDirection: 'row', flex: 1 } },
			h(RN.View, { style: { paddingRight: 6 } }, control),
			h(RN.View, { style: { flexGrow: 1 } }, props.button),
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
		if (!activity) {
			counters.skipped++
			notify()
			return ret
		}
		counters.shown++
		notify()
		return h(ListenButton, { button: ret, activity: activity })
	}

	// ---- Send invite --------------------------------------------------------------------------
	function sendInvite() {
		var activity = mySpotifyActivity()
		if (!activity || !activity.party || !activity.party.id) return toast('Play something on Spotify first.')
		var f = finders()
		var messages = f.lookupModule(f.filters.withProps('sendMessage', 'revealMessage'))[0]
		var drafts = f.lookupModule(f.filters.withProps('clearDraft'))[0]
		if (!messages) return toast('Could not send the invite.')
		var channel = store('SelectedChannelStore').getChannelId()
		if (!channel) return toast('Open a chat first, then try again.')
		var draft = store('DraftStore')
		messages.sendMessage(
			channel,
			{
				content: (draft && draft.getDraft(channel, 0)) || '',
				tts: false,
				invalidEmojis: [],
				validNonShortcutEmojis: [],
			},
			true,
			{ activityAction: { activity: activity, type: 3 } },
		)
		if (drafts) drafts.clearDraft(channel, 0)
		var info = store('ChannelStore') && store('ChannelStore').getChannel(channel)
		toast('Invite sent' + (info && info.name ? ' to #' + info.name : ''))
	}

	/** The song playing on your own Spotify, as far as Discord knows it. */
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
			name: (track && track.name) || (activity && activity.details),
		}
	}

	/** Sends plain text to the open chat. Leaves your draft alone. */
	function sendText(content) {
		var f = finders()
		var messages = f.lookupModule(f.filters.withProps('sendMessage', 'revealMessage'))[0]
		var channel = store('SelectedChannelStore').getChannelId()
		if (!messages || !channel) return toast('Open a chat first, then try again.'), false
		messages.sendMessage(channel, { content: content, tts: false, invalidEmojis: [], validNonShortcutEmojis: [] }, false, {})
		return true
	}

	function sendSongLink() {
		var t = currentTrack()
		if (!t.trackId) return toast('Play something on Spotify first.')
		if (sendText('https://open.spotify.com/track/' + t.trackId)) toast('Song link sent')
	}

	function sendAlbumLink() {
		var t = currentTrack()
		if (!t.trackId) return toast('Play something on Spotify first.')
		if (!t.albumId) return toast('Could not find the album for this song.')
		if (sendText('https://open.spotify.com/album/' + t.albumId)) toast('Album link sent')
	}

	function InviteButton() {
		var Design = valenced.discord.design.Design
		var React = valenced.react.React
		var tick = React.useState(0)
		React.useEffect(function () {
			return valenced.discord.flux.onFluxEventDispatched('SPOTIFY_PLAYER_STATE', function (payload) {
				setTimeout(function () { tick[1](function (n) { return n + 1 }) }, 0)
				return payload
			})
		}, [])
		var activity = mySpotifyActivity()
		var disabled = !(activity && activity.party && activity.party.id)
		var assetId = valenced.assets.getAssetIdByName('ic_spotify_white_16px')
		var Icon = findIcon(['SpotifyNeutralIcon', 'MusicIcon'])
		if (assetId == null && !Icon)
			return h(Design.Button, { size: 'md', variant: 'secondary', text: 'Invite', disabled: disabled, onPress: sendInvite })
		return h(Design.IconButton, {
			size: 'md',
			variant: 'secondary',
			icon: assetId != null ? assetId : h(Icon, { size: 'sm' }),
			accessibilityLabel: 'Invite to listen along',
			disabled: disabled,
			onPress: sendInvite,
		})
	}

	function decorateHeader(ret) {
		if (!ret || !ret.props || !enabled('sendInvite')) return ret
		var React = valenced.react.React
		return React.cloneElement(
			ret,
			{},
			...React.Children.toArray(ret.props.children),
			h(InviteButton, { key: 'spotify-invite' }),
		)
	}

	// ---- Attachment popup ---------------------------------------------------------------------
	/**
	 * Adds a Spotify row to the attachment popup (Camera, Photos, Poll, Files...). The popup is found
	 * by its rows instead of by name: any element whose children include two or more of those labels.
	 */
	var POPUP_ROWS = [
		{ key: 'spotify-invite', setting: 'sendInvite', label: 'Send listen along', run: function () { sendInvite() } },
		{ key: 'spotify-song', setting: 'sendSongLink', label: 'Send song link', run: function () { sendSongLink() } },
		{ key: 'spotify-album', setting: 'sendAlbumLink', label: 'Send playing album', run: function () { sendAlbumLink() } },
	]

	function decoratePopup(result) {
		try {
			var props = result && result.props
			var c = props && props.children
			if (!Array.isArray(c) || c.length < 2 || c.length > 20) return result
			var template
			var hits = 0
			for (var i = 0; i < c.length; i++) {
				var el = c[i]
				if (el && typeof el.key === 'string' && el.key.indexOf('spotify-') === 0) return result
				var label = el && el.props && el.props.label
				if (typeof label !== 'string') continue
				if (MENU_LABELS[label] === 1) {
					hits++
					if (!template) template = el
				}
			}
			if (hits < 2) return result
			if (!optedIn('popupRows')) return result
			var wanted = POPUP_ROWS.filter(function (r) { return enabled(r.setting) })
			if (!wanted.length) return result
			var React = valenced.react.React
			var RN = valenced.react.ReactNative
			var Icon = findIcon(['SpotifyNeutralIcon', 'MusicIcon', 'PlayIcon'])
			var baseIcon = template.props.icon
			var assetId = valenced.assets.getAssetIdByName('ic_spotify_white_16px')
			var icon = baseIcon
			if (Icon && React.isValidElement(baseIcon)) icon = React.cloneElement(baseIcon, { IconComponent: Icon })
			else if (assetId != null && RN.Image) icon = h(RN.Image, { source: assetId, style: { width: 24, height: 24 } })
			var propNames = Object.keys(template.props)
			var Tap = RN.Pressable || RN.TouchableOpacity
			var rows = wanted.map(function (def) {
				var lastPress = 0
				var press = function () {
					// One tap can reach more than one handler, so only the first one counts.
					if (Date.now() - lastPress < 1500) return
					lastPress = Date.now()
					try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
					setTimeout(def.run, 0)
				}
				// A copy of Discord's row for looks only, with every action and ID replaced.
				var overrides = { key: def.key, label: def.label, icon: icon }
				propNames.forEach(function (name) {
					var value = template.props[name]
					if (name === 'icon' || name === 'label' || name === 'key') return
					if (typeof value === 'function' && /^(onPress|onSelect|onClick|onTap|onAction|action|callback|handler)$/.test(name)) overrides[name] = press
					else if (typeof value === 'string' && /^(id|testID|nativeID|name|value|trigger)$/.test(name)) overrides[name] = def.key
					else if (typeof value === 'string' && /^(accessibilityLabel|title|description|sublabel|subLabel)$/.test(name)) overrides[name] = name === 'accessibilityLabel' || name === 'title' ? def.label : undefined
				})
				overrides.onPress = press
				var look = React.cloneElement(template, overrides)
				// Discord's own row keeps its own way of reacting to taps (that is what opened the camera),
				// so it is shown for looks only and our tap area sits over it.
				return h(
					RN.View,
					{ key: def.key },
					h(RN.View, { pointerEvents: 'none' }, look),
					h(Tap, {
						accessibilityRole: 'button',
						accessibilityLabel: def.label,
						onPress: press,
						style: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
					}),
				)
			})
			counters.popup += rows.length
			if (!status.popup || !status.popup.ok) setStatus('popup', true, 'row props [' + propNames.join(', ') + '], added ' + rows.length + ' rows to the popup that has ' + Object.keys(MENU_LABELS).filter(function (l) { return c.some(function (x) { return x && x.props && x.props.label === l }) }).join(', '))
			return React.cloneElement(result, {}, ...c, ...rows)
		} catch (e) {
			return result
		}
	}

	function installPopupHook(cleanup) {
		var f = finders()
		var runtime = f.lookupModule(f.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		;['jsx', 'jsxs'].forEach(function (name) {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, decoratePopup))
		})
	}

	// ---- Message menu (hold down a message) -----------------------------------------------------
	/**
	 * Adds the send actions to the menu you get when you hold down a message. This follows the way
	 * Valenced's own Quoter plugin adds a row there: find the group of rows that has icons and add
	 * one more row of the same kind.
	 */
	function addToSheet(result) {
		var wanted = POPUP_ROWS.filter(function (r) { return enabled(r.setting) })
		if (!wanted.length) return result
		var React = valenced.react.React
		var inserted = false
		function add(node) {
			if (!React.isValidElement(node)) return node
			var kids = React.Children.toArray(node.props.children)
			var hasLabel = function (child) { return React.isValidElement(child) && typeof child.props.label === 'string' }
			if (!inserted && node.props.hasIcons && kids.some(hasLabel)) {
				var template = kids.find(hasLabel)
				var Row = template.type
				var Icon = findIcon(['UserPlayIcon', 'MusicIcon', 'PlayIcon'])
				var baseIcon = template.props.icon
				var icon = Icon && React.isValidElement(baseIcon) ? React.cloneElement(baseIcon, { IconComponent: Icon }) : baseIcon
				inserted = true
				counters.sheet++
				var rows = wanted.map(function (def) {
					return h(Row, {
						key: def.key,
						label: def.label,
						icon: icon,
						onPress: function () {
							try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
							setTimeout(def.run, 0)
						},
					})
				})
				if (!status.messageMenu || !status.messageMenu.ok || counters.sheet === 1)
					setStatus('messageMenu', true, 'added ' + rows.length + ' rows to the message menu')
				return React.cloneElement(node, {}, ...kids, ...rows)
			}
			return React.cloneElement(node, {}, React.Children.map(node.props.children, add))
		}
		return add(result)
	}

	// ---- Settings screen ----------------------------------------------------------------------
	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		useRefresh()
		// The diagnostics should follow what is happening, so redraw every couple of seconds.
		var ticker = valenced.react.React.useState(0)
		valenced.react.React.useEffect(function () {
			var id = setInterval(function () { ticker[1](function (n) { return n + 1 }) }, 2000)
			return function () { clearInterval(id) }
		}, [])
		var settings = Object.assign({}, defaults, json.use())
		function row(label, subLabel) {
			return h(Design.TableRow, { key: label, label: label, subLabel: subLabel })
		}
		function state(key, label, waiting) {
			var s = status[key]
			return row(label, !s ? waiting || 'Waiting for Discord to load this part' : s.ok ? 'Working: ' + s.detail : 'Problem: ' + s.detail)
		}
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'Features' },
					h(Design.TableSwitchRow, {
						label: 'Listen Along',
						subLabel: 'A button on Spotify activities to listen along with someone',
						value: settings.listenAlong,
						onValueChange: function (listenAlong) { json.set({ listenAlong: listenAlong }) },
					}),
					h(Design.TableSwitchRow, {
						label: 'Send listen along',
						subLabel: 'A row in the menu you get when you hold down a message. Sends the invite card.',
						value: settings.sendInvite,
						onValueChange: function (sendInvite) { json.set({ sendInvite: sendInvite }) },
					}),
					h(Design.TableSwitchRow, {
						label: 'Send song link',
						subLabel: 'A row in the hold-down message menu. Sends the link of the song playing.',
						value: settings.sendSongLink,
						onValueChange: function (sendSongLink) { json.set({ sendSongLink: sendSongLink }) },
					}),
					h(Design.TableSwitchRow, {
						label: 'Send playing album',
						subLabel: 'A row in the hold-down message menu. Sends the link of the album playing.',
						value: settings.sendAlbumLink,
						onValueChange: function (sendAlbumLink) { json.set({ sendAlbumLink: sendAlbumLink }) },
					}),
					h(Design.TableSwitchRow, {
						label: 'Also add them to the attachment popup (experimental)',
						subLabel: 'In some versions of Discord these rows open the camera instead. Leave off unless you want to test it.',
						value: !!settings.popupRows,
						onValueChange: function (popupRows) { json.set({ popupRows: popupRows }) },
					}),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Actions' },
					h(Design.TableRow, {
						key: 'send',
						label: 'Send listen along',
						subLabel: 'Send the invite card for your Spotify to the last chat you had open',
						onPress: sendInvite,
					}),
					h(Design.TableRow, {
						key: 'song',
						label: 'Send song link',
						subLabel: 'Send the link of the song playing to the last chat you had open',
						onPress: sendSongLink,
					}),
					h(Design.TableRow, {
						key: 'album',
						label: 'Send playing album',
						subLabel: 'Send the link of the album playing to the last chat you had open',
						onPress: sendAlbumLink,
					}),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Diagnostics' },
					state('method', 'Last listen along', 'Not used yet. Tap the music button on a friend\'s Spotify card.'),
					state('controls', 'Discord Spotify controls (optional)', 'Not found. That is fine, Spotify is used directly instead.'),
					state('listenClassic', 'Listen Along (activity card)'),
					state('listenSimple', 'Listen Along (small button)', 'Not in this version of Discord. That is fine.'),
					state('messageMenu', 'Hold-down message menu', 'Discord loads this the first time you hold down a message. Do that once, then come back.'),
					state('popup', 'Attachment popup (experimental)', 'Off unless you turn on the experimental switch.'),
					state('invite', 'Send Invite (older attachment menu)', 'Not in this version of Discord. That is fine.'),
					row('Spotify right now', (function () {
						var a = mySpotifyActivity()
						if (!a) return 'Nothing found. Is Spotify playing, and linked in Discord?'
						var from = store('SpotifyStore') && store('SpotifyStore').getActivity && store('SpotifyStore').getActivity() === a ? "Discord's Spotify store" : 'your presence'
						var name = [a.details, a.state].filter(Boolean).join(' by ') || 'a track'
						return name + (a.party && a.party.id ? '. Sending and listening along are possible (from ' + from + ').' : '. No listen along party on it (from ' + from + ').')
					})()),
					row('Last chat you had open', (function () {
						var id = store('SelectedChannelStore') && store('SelectedChannelStore').getChannelId()
						var c = id && store('ChannelStore') && store('ChannelStore').getChannel(id)
						return c ? (c.name ? '#' + c.name : 'a direct message') : 'none'
					})()),
					row('Buttons added so far', counters.shown + ' shown, ' + counters.skipped + ' skipped (no listener found)'),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Good to know' },
					row('Spotify', 'Spotify must be linked to Discord and open on your device.'),
					row('After toggling', 'Buttons change the next time the screen they are on redraws.'),
					row('Credit', "Based on nexpid's NexxUtils for Revenge."),
				),
			),
		)
	}

	// ---- Plugin -------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsComponent,
		start: function (api) {
			var cleanup = api.cleanup
			storage = api.jsonStorage
			var f = finders()

			function install(key, filter, exportKey, decorate, what) {
				cleanup(
					f.getModules(filter, function (module) {
						var target = exportKey === 'default' && module && module.default === undefined ? undefined : module
						var shape = target && patchComponent(target, exportKey, decorate, cleanup)
						if (shape) return setStatus(key, true, what + ' found (' + shape + ')')
						var detail = what + ' has an unexpected shape: ' + shapeOf(module && module[exportKey])
						setStatus(key, false, detail)
						api.plugin.reportError(detail)
					}),
				)
			}

			install('listenClassic', f.filters.withProps('SpotifyPlayButton'), 'SpotifyPlayButton', decorateListen, 'Spotify play button')
			install('listenSimple', f.filters.withProps('PlayOnSpotifyButton'), 'PlayOnSpotifyButton', decorateListen, 'Play on Spotify button')
			// Valenced only finds parts Discord has loaded, so catch the Spotify controls as they load.
			;[['play', 'sync'], ['sync', 'pause']].forEach(function (names) {
				cleanup(
					f.getModules(f.filters.withProps.apply(null, names), function (module) {
						if (spotifyActions) return
						spotifyActions = module
						setStatus('controls', true, 'found (' + Object.keys(module).filter(function (k) { return typeof module[k] === 'function' }).slice(0, 8).join(', ') + ')')
					}),
				)
			})
			cleanup(function () { spotifyActions = undefined })
			try {
				cleanup(
				f.getModules(
					f.filters.withName('LongPressMessageActionSheet'),
					function (module) {
						if (!module || typeof module.default !== 'function') {
							var detail = 'The message menu has an unexpected shape: ' + shapeOf(module && module.default)
							setStatus('messageMenu', false, detail)
							return api.plugin.reportError(detail)
						}
						cleanup(
							valenced.patcher.instead(module, 'default', function (args, original) {
								var result = Reflect.apply(original, this, args)
								try {
									return addToSheet(result)
								} catch (e) {
									console.warn('[spotify-tools] message menu failed:', String(e))
									return result
								}
							}),
						)
						if (!status.messageMenu) setStatus('messageMenu', true, 'message menu found, waiting for you to hold down a message')
					},
					{ returnNamespace: true },
				),
			)
			installPopupHook(cleanup)
			} catch (e) {
				setStatus('popup', false, 'could not hook the popup: ' + String(e))
			}
			install('invite', f.filters.withName('MediaKeyboardListHeader'), 'default', decorateHeader, 'Attachment menu header')
		},
	})
	return exports
})({})
