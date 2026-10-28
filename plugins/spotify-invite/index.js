(function (exports) {
	/*
	 * Send Spotify Invite for Valenced.
	 * Based on the "Send Spotify invite" module of nexpid's NexxUtils for Revenge (CC BY 4.0),
	 * https://github.com/nexpid/RevengePlugins. Rewritten for Valenced. Shipped as written.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var TOAST = 'ESKIMO_SPOTIFY_INVITE'

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

	function sendInvite() {
		var activity = store('SpotifyStore').getActivity()
		if (!activity || !activity.party || !activity.party.id) return toast('Play something on Spotify first.')
		var f = finders()
		var messages = f.lookupModule(f.filters.withProps('sendMessage', 'revealMessage'))[0]
		var drafts = f.lookupModule(f.filters.withProps('clearDraft'))[0]
		if (!messages) return toast('Could not send the invite.')
		var channel = store('SelectedChannelStore').getChannelId()
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
	}

	function InviteButton() {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
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
		var Icon =
			valenced.utils.discord.lookupGeneratedIconComponent('SpotifyNeutralIcon') ||
			valenced.utils.discord.lookupGeneratedIconComponent('MusicIcon')
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

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		start: function (api) {
			var cleanup = api.cleanup
			var f = finders()
			cleanup(
				f.getModules(f.filters.withName('MediaKeyboardListHeader'), function (module) {
					// The header is either a plain function or a memo wrapper around one.
					var host = typeof module.default === 'function' ? module : module.default && typeof module.default.type === 'function' ? module.default : undefined
					var key = host === module ? 'default' : 'type'
					if (!host) return api.plugin.reportError('The attachment menu header was not found.')
					cleanup(
						valenced.patcher.instead(host, key, function (args, original) {
							var ret = Reflect.apply(original, this, args)
							if (!ret || !ret.props) return ret
							var React = valenced.react.React
							return React.cloneElement(
								ret,
								{},
								...React.Children.toArray(ret.props.children),
								h(InviteButton, { key: 'spotify-invite' }),
							)
						}),
					)
				}),
			)
		},
	})
	return exports
})({})
