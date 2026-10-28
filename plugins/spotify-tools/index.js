(function (exports) {
	/*
	 * Spotify Tools for Valenced: Listen Along buttons and Send Spotify Invite.
	 * Based on the "Add Listen Along" and "Send Spotify invite" modules of nexpid's NexxUtils for
	 * Revenge (CC BY 4.0), https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var TOAST = 'ESKIMO_SPOTIFY_TOOLS'
	var defaults = { listenAlong: true, sendInvite: true }

	var storage
	var spotifyActions
	var status = {}
	var counters = { shown: 0, skipped: 0, popup: 0 }
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
	function userIdOf(activity) {
		var id = activity && activity.party && activity.party.id
		return typeof id === 'string' && id.indexOf(':') > 0 ? id.split(':')[1] : undefined
	}

	/** Why the button can't be used right now, or false when it can. */
	function disabledReason(activity, userId) {
		var self = store('UserStore').getCurrentUser()
		var spotify = store('SpotifyStore')
		var mine = spotify.getActivity()
		if (self && self.id === userId) return 'Listen along with someone else, not yourself.'
		if (mine && mine.party && mine.party.id === activity.party.id) return "You're already along for this ride."
		var protocol = store('SpotifyProtocolStore')
		var canPlay = !!spotify.getActiveSocketAndDevice() || !!(protocol && protocol.isProtocolRegistered())
		if (!spotify.hasConnectedAccount() || !canPlay) return 'Spotify is not detected'
		return false
	}

	/** Starts listening along. Returns true when something was started. */
	function listen(reason, activity, userId) {
		if (typeof reason === 'string') return toast(reason), false
		var f = finders()
		var actions = spotifyActions || f.lookupModule(f.filters.withProps('play', 'sync'))[0]
		if (!actions) return toast('Spotify controls were not found. Open a Spotify activity card and try again.'), false
		try {
			if (store('SpotifyStore').getActivity()) actions.sync(activity, userId)
			else {
				onceAfterPlayerState(function () { actions.sync(activity, userId) })
				actions.play(activity, userId)
			}
			return true
		} catch (e) {
			toast('Listen along failed: ' + String((e && e.message) || e))
			return false
		}
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
			if (listen(reason, activity, userId)) {
				loadingState[1](true)
				setTimeout(function () { loadingState[1](false) }, 5000)
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
		var activity = store('SpotifyStore').getActivity()
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
		var activity = store('SpotifyStore').getActivity()
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
	function decoratePopup(result) {
		try {
			var props = result && result.props
			var c = props && props.children
			if (!Array.isArray(c) || c.length < 2 || c.length > 14) return result
			var template
			var hits = 0
			for (var i = 0; i < c.length; i++) {
				var el = c[i]
				var label = el && el.props && el.props.label
				if (typeof label !== 'string') continue
				if (el.key === 'spotify-invite') return result
				if (MENU_LABELS[label] === 1) {
					hits++
					if (!template) template = el
				}
			}
			if (hits < 2 || !enabled('sendInvite')) return result
			var React = valenced.react.React
			var Icon = findIcon(['SpotifyNeutralIcon', 'MusicIcon', 'PlayIcon'])
			var icon = template.props.icon
			if (Icon && React.isValidElement(icon)) icon = React.cloneElement(icon, { IconComponent: Icon })
			var lastPress = 0
			var press = function () {
				// One tap can reach more than one of these handlers, so only the first one counts.
				if (Date.now() - lastPress < 1500) return
				lastPress = Date.now()
				try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
				setTimeout(sendInvite, 0)
			}
			// The row is a copy of one of Discord's own rows, so it also carries that row's actions and
			// IDs. Replace every action and every identifier, so nothing of the original (Camera,
			// Photos...) can still run.
			var overrides = { key: 'spotify-invite', label: 'Spotify invite', icon: icon }
			var propNames = Object.keys(template.props)
			propNames.forEach(function (name) {
				var value = template.props[name]
				if (name === 'icon' || name === 'label' || name === 'key') return
				if (typeof value === 'function' && /^(onPress|onSelect|onClick|onTap|onAction|action|callback|handler)$/.test(name)) overrides[name] = press
				else if (typeof value === 'string' && /^(id|testID|nativeID|name|value|trigger)$/.test(name)) overrides[name] = 'spotify-invite'
				else if (typeof value === 'string' && /^(accessibilityLabel|title|description|sublabel|subLabel)$/.test(name)) overrides[name] = name === 'accessibilityLabel' || name === 'title' ? 'Spotify invite' : undefined
			})
			overrides.onPress = press
			var row = React.cloneElement(template, overrides)
			counters.popup++
			if (!status.popup || !status.popup.ok) setStatus('popup', true, 'row props [' + propNames.join(', ') + '], added to the popup that has ' + Object.keys(MENU_LABELS).filter(function (l) { return c.some(function (x) { return x && x.props && x.props.label === l }) }).join(', '))
			return React.cloneElement(result, {}, ...c, row)
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

	// ---- Settings screen ----------------------------------------------------------------------
	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		useRefresh()
		var settings = Object.assign({}, defaults, json.use())
		function row(label, subLabel) {
			return h(Design.TableRow, { key: label, label: label, subLabel: subLabel })
		}
		function state(key, label) {
			var s = status[key]
			return row(label, !s ? 'Waiting for Discord to load this part' : s.ok ? 'Working: ' + s.detail : 'Problem: ' + s.detail)
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
						label: 'Send Spotify Invite',
						subLabel: 'A button in the attachment menu to invite a channel to listen along to you',
						value: settings.sendInvite,
						onValueChange: function (sendInvite) { json.set({ sendInvite: sendInvite }) },
					}),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Actions' },
					h(Design.TableRow, {
						key: 'send',
						label: 'Send invite now',
						subLabel: 'Invite the last chat you had open to listen along to your Spotify. Works even if the attachment menu button is missing.',
						onPress: sendInvite,
					}),
				),
				h(
					Design.TableRowGroup,
					{ title: 'Diagnostics' },
					state('controls', 'Spotify controls (play and sync)'),
					state('listenClassic', 'Listen Along (activity card)'),
					state('listenSimple', 'Listen Along (small button)'),
					state('popup', 'Send Invite (attachment popup)'),
					state('invite', 'Send Invite (older attachment menu)'),
					row('Spotify right now', (function () {
						var a = store('SpotifyStore') && store('SpotifyStore').getActivity()
						return a && a.party && a.party.id ? 'Playing, listen along is possible' : 'Nothing playing, or no listen along party'
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
				installPopupHook(cleanup)
			} catch (e) {
				setStatus('popup', false, 'could not hook the popup: ' + String(e))
			}
			install('invite', f.filters.withName('MediaKeyboardListHeader'), 'default', decorateHeader, 'Attachment menu header')
		},
	})
	return exports
})({})
