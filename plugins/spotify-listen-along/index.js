(function (exports) {
	/*
	 * Spotify Listen Along for Valenced.
	 * Based on the "Add Listen Along" module of nexpid's NexxUtils for Revenge (CC BY 4.0),
	 * https://github.com/nexpid/RevengePlugins. Rewritten for Valenced. Shipped as written.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var TAG = '[spotify-listen-along]'
	var TOAST = 'ESKIMO_SPOTIFY_LISTEN_ALONG'

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }

	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text }) } catch (e) {}
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

	function listen(reason, activity, userId) {
		if (typeof reason === 'string') return toast(reason)
		var actions = finders().lookupModule(finders().filters.withProps('play', 'sync'))[0]
		if (!actions) return toast('Spotify controls were not found')
		if (store('SpotifyStore').getActivity()) return actions.sync(activity, userId)
		onceAfterPlayerState(function () { actions.sync(activity, userId) })
		actions.play(activity, userId)
	}

	function findIcon() {
		var names = ['UserPlayIcon', 'MusicIcon', 'PlayIcon']
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
		var Icon = findIcon()
		var press = function () {
			if (loading) return
			listen(reason, activity, userId)
			if (!reason) {
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

	function wrap(ret, activity) {
		if (!ret || !userIdOf(activity)) return ret
		return h(ListenButton, { button: ret, activity: activity })
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		start: function (api) {
			var cleanup = api.cleanup
			var f = finders()
			// The classic button, on the activity card inside profiles.
			cleanup(
				f.getModules(f.filters.withProps('SpotifyPlayButton'), function (module) {
					var Button = module.SpotifyPlayButton
					if (!Button || !Button.prototype || typeof Button.prototype.render !== 'function')
						return api.plugin.reportError('Spotify play button was not found.')
					cleanup(
						valenced.patcher.instead(Button.prototype, 'render', function (args, original) {
							var ret = Reflect.apply(original, this, args)
							return wrap(ret, this.props && this.props.activity)
						}),
					)
				}),
			)
			// The newer, simplified button.
			cleanup(
				f.getModules(f.filters.withProps('PlayOnSpotifyButton'), function (module) {
					if (typeof module.PlayOnSpotifyButton !== 'function') return
					cleanup(
						valenced.patcher.instead(module, 'PlayOnSpotifyButton', function (args, original) {
							var ret = Reflect.apply(original, this, args)
							return wrap(ret, args[0] && args[0].activity)
						}),
					)
				}),
			)
		},
	})
	return exports
})({})
