(function (exports) {
	/*
	 * Server Info for Valenced.
	 * Based on the Server Info plugin for Revenge by fshin, published in
	 * https://github.com/kmmiio99o/revenge-plugins under CC0 (public domain). Rewritten for Valenced.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var SHEET_KEY = 'marklong-server-info'
	var FRIENDS_KEY = 'marklong-server-info-friends'
	var ownerCache = new Map()

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function sheets() { return valenced.discord.actions.ActionSheetActionCreators }
	function asset(name) { return valenced.assets.getAssetIdByName(name) }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_SERVER_INFO', { text: text }) } catch (e) {}
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

	// ---- Discord helpers -----------------------------------------------------------------------
	// Snowflake IDs hold their creation time. Dividing by 2^22 is exact enough here, and avoids BigInt.
	function snowflake(id) { return Math.floor(Number(id) / 4194304) }
	function createdOn(id) {
		return new Date(snowflake(id) + 1420070400000).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
	}
	function avatarUrl(userId, hash) {
		if (!hash) return 'https://cdn.discordapp.com/embed/avatars/' + (snowflake(userId) % 6) + '.png'
		return 'https://cdn.discordapp.com/avatars/' + userId + '/' + hash + '.' + (String(hash).indexOf('a_') === 0 ? 'gif' : 'png') + '?size=64'
	}
	function assetUrl(kind, id, hash, size) {
		return 'https://cdn.discordapp.com/' + kind + '/' + id + '/' + hash + '.' + (String(hash).indexOf('a_') === 0 ? 'gif' : 'png') + '?size=' + size
	}
	function number(value) {
		return typeof value === 'number' ? value.toLocaleString() : value
	}

	function rest() {
		var f = finders()
		return f.lookupModule(f.filters.withProps('get', 'post', 'patch'))[0] || f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0]
	}

	function openProfile(userId, guildId) {
		try { sheets().hideAllActionSheets() } catch (e) {}
		var f = finders()
		var args = { userId: userId, guildId: guildId }
		var names = ['openUserProfileModal', 'openUserProfile', 'showUserProfile']
		for (var i = 0; i < names.length; i++) {
			var mod = f.lookupModule(f.filters.withProps(names[i]))[0]
			if (mod && typeof mod[names[i]] === 'function') {
				try { return mod[names[i]](args) } catch (e) {}
			}
		}
		toast("Couldn't open this profile.")
	}

	/** The friends you have in a server. Asks Discord for those members first, then waits briefly. */
	async function getGuildFriends(guildId, timeoutMs) {
		var friendIds = (store('RelationshipStore') && store('RelationshipStore').getFriendIDs && store('RelationshipStore').getFriendIDs()) || []
		if (!friendIds.length) return []
		var f = finders()
		var actions = f.lookupModule(f.filters.withProps('requestMembersById'))[0]
		if (actions && actions.requestMembersById) actions.requestMembersById(guildId, friendIds)
		await new Promise(function (resolve) {
			var timer
			var off
			var finish = function () {
				clearTimeout(timer)
				if (off) off()
				resolve()
			}
			off = valenced.discord.flux.onFluxEventDispatched('GUILD_MEMBERS_CHUNK', function (payload) {
				if (payload && (payload.guildId === guildId || payload.guild_id === guildId)) setTimeout(finish, 0)
				return payload
			})
			timer = setTimeout(finish, timeoutMs || 1500)
		})
		var members = store('GuildMemberStore')
		var all = (members.getMembers && members.getMembers(guildId)) || {}
		var out = []
		friendIds.forEach(function (id) {
			var member = all[id] || (members.getMember && members.getMember(guildId, id))
			if (!member) return
			var user = store('UserStore').getUser(id)
			out.push({ id: id, username: (user && user.username) || null, globalName: (user && user.globalName) || null, nick: member.nick || null })
		})
		return out
	}

	// ---- Sheets --------------------------------------------------------------------------------
	function ActionSheetBody(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var size = RN.useWindowDimensions ? RN.useWindowDimensions() : { height: 800 }
		return h(
			Design.ActionSheet,
			null,
			h(
				RN.ScrollView,
				{ style: { maxHeight: Math.round(size.height * 0.75) } },
				h(Design.Stack, { spacing: 16, style: { padding: 16 } }, props.children),
			),
		)
	}

	function chevron() {
		var Design = valenced.discord.design.Design
		var id = asset('ChevronSmallRightIcon')
		return id != null ? h(Design.TableRow.Icon, { source: id }) : undefined
	}

	function FriendsSheet(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var friends = props.friends
		return h(
			ActionSheetBody,
			null,
			h(Design.Text, { variant: 'heading-md/bold' }, 'Friends in this server (' + friends.length + ')'),
			friends.length === 0
				? h(Design.Text, { variant: 'text-md/medium', color: 'text-muted' }, 'No friends found in this server.')
				: h(
						Design.TableRowGroup,
						null,
						friends.map(function (friend) {
							var name = friend.nick || friend.globalName || friend.username || friend.id
							var handle = friend.username ? '@' + friend.username : undefined
							var user = store('UserStore').getUser(friend.id)
							return h(Design.TableRow, {
								key: friend.id,
								label: name,
								subLabel: handle && handle !== '@' + name ? handle : undefined,
								icon: h(RN.Image, { source: { uri: avatarUrl(friend.id, user && user.avatar) }, style: { width: 28, height: 28, borderRadius: 14 } }),
								trailing: chevron(),
								onPress: function () { openProfile(friend.id, props.guildId) },
							})
						}),
				  ),
			h(Design.Button, { text: 'Close', variant: 'secondary', onPress: function () { sheets().hideActionSheet(FRIENDS_KEY) } }),
		)
	}

	function ServerInfoSheet(props) {
		var React = valenced.react.React
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var guildId = props.guildId
		var tickState = React.useState(0)
		var friendsState = React.useState([])
		var loadingState = React.useState(true)
		var forceUpdate = function () { tickState[1](function (n) { return n + 1 }) }

		var GuildStore = store('GuildStore')
		var UserStore = store('UserStore')
		var GuildRoleStore = store('GuildRoleStore')
		var GuildChannelStore = store('GuildChannelStore')
		var GuildMemberStore = store('GuildMemberStore')
		var counts = store('GuildMemberCountStore') || finders().lookupModule(finders().filters.withProps('getMemberCount', 'getOnlineCount'))[0]
		var headerCounts = store('GuildHeaderCountsStore') || counts

		// Redraw when what the sheet shows changes.
		React.useEffect(function () {
			var watched = [GuildStore, UserStore, GuildRoleStore, GuildChannelStore, counts, headerCounts].filter(Boolean)
			watched.forEach(function (s) { if (s.addChangeListener) s.addChangeListener(forceUpdate) })
			return function () { watched.forEach(function (s) { if (s.removeChangeListener) s.removeChangeListener(forceUpdate) }) }
		}, [])

		// Friends you have in this server.
		React.useEffect(function () {
			var mounted = true
			loadingState[1](true)
			getGuildFriends(guildId).then(
				function (list) { if (mounted) { friendsState[1](list); loadingState[1](false) } },
				function () { if (mounted) loadingState[1](false) },
			)
			return function () { mounted = false }
		}, [guildId])

		var guild = GuildStore && GuildStore.getGuild && GuildStore.getGuild(guildId)
		var cached = ownerCache.get(guildId)
		var ownerIdState = React.useState((guild && guild.ownerId) || (cached && cached.id) || null)
		var ownerNameState = React.useState((cached && cached.name) || null)
		var ownerAvatarState = React.useState((cached && cached.avatar) || null)
		var ownerId = ownerIdState[0]

		// The owner, when the guild does not say.
		React.useEffect(function () {
			var http = rest()
			if (ownerId || !http || !http.get) return
			var cancelled = false
			Promise.resolve(http.get({ url: '/guilds/' + guildId })).then(function (res) {
				if (!cancelled && res && res.body && res.body.owner_id) ownerIdState[1](res.body.owner_id)
			}, function () {})
			return function () { cancelled = true }
		}, [guildId, ownerId])

		// The owner's name and avatar, from Discord or from a lookup.
		React.useEffect(function () {
			if (!ownerId) return
			var known = UserStore.getUser(ownerId)
			if (known && known.username) {
				var name = known.globalName || known.username
				ownerNameState[1](name)
				ownerAvatarState[1](known.avatar || null)
				ownerCache.set(guildId, { id: ownerId, name: name, avatar: known.avatar || null })
				return
			}
			var http = rest()
			if (!http || !http.get) return
			var cancelled = false
			Promise.resolve(http.get({ url: '/users/' + ownerId })).then(function (res) {
				var user = res && res.body
				if (!user || cancelled) return
				var name = user.global_name || user.globalName || user.username
				try { valenced.discord.common.flux.Dispatcher.dispatch({ type: 'USER_UPDATE', user: user }) } catch (e) {}
				ownerNameState[1](name)
				ownerAvatarState[1](user.avatar || null)
				ownerCache.set(guildId, { id: ownerId, name: name, avatar: user.avatar || null })
				forceUpdate()
			}, function () {})
			return function () { cancelled = true }
		}, [ownerId, guildId])

		if (!guild) return null

		var friends = friendsState[0]
		var friendsLoading = loadingState[0]
		var bannerUrl = guild.banner ? assetUrl('banners', guildId, guild.banner, 512) : null
		var iconUrl = guild.icon ? assetUrl('icons', guildId, guild.icon, 256) : null

		var rawMembers = (counts && counts.getMemberCount && counts.getMemberCount(guildId))
		if (rawMembers == null) rawMembers = guild.memberCount
		if (rawMembers == null) rawMembers = guild.approximateMemberCount
		if (rawMembers == null && GuildMemberStore.getMemberIds) rawMembers = (GuildMemberStore.getMemberIds(guildId) || []).length
		var rawOnline = (headerCounts && headerCounts.getOnlineCount && headerCounts.getOnlineCount(guildId))
		if (rawOnline == null && counts && counts.getOnlineCount) rawOnline = counts.getOnlineCount(guildId)
		var roles = GuildRoleStore && GuildRoleStore.getSortedRoles ? (GuildRoleStore.getSortedRoles(guildId) || []).length : null
		var channels = GuildChannelStore && GuildChannelStore.getChannels ? Object.keys(GuildChannelStore.getChannels(guildId) || {}).length : null

		var ownerMember = ownerId && GuildMemberStore.getMember ? GuildMemberStore.getMember(guildId, ownerId) : null
		var ownerName = (ownerMember && ownerMember.nick) || ownerNameState[0] || (ownerId ? 'User (' + String(ownerId).slice(0, 6) + ')' : 'Loading...')
		var vanity = guild.vanityURLCode ? 'discord.gg/' + guild.vanityURLCode : null

		function row(label, subLabel, extra) {
			return h(Design.TableRow, Object.assign({ key: label, label: label, subLabel: subLabel }, extra || {}))
		}

		return h(
			ActionSheetBody,
			null,
			bannerUrl ? h(RN.Image, { source: { uri: bannerUrl }, style: { width: '100%', height: 120, borderRadius: 8 }, resizeMode: 'cover' }) : null,
			h(
				RN.View,
				{ style: { flexDirection: 'row', alignItems: 'center' } },
				iconUrl
					? h(RN.Image, { source: { uri: iconUrl }, style: { width: 64, height: 64, borderRadius: 12 } })
					: h(RN.View, { style: { width: 64, height: 64, borderRadius: 12, alignItems: 'center', justifyContent: 'center' } }, h(Design.Text, { variant: 'heading-lg/bold' }, String(guild.name || '').slice(0, 2))),
				h(RN.View, { style: { flex: 1, marginLeft: 14 } }, h(Design.Text, { variant: 'heading-lg/bold', numberOfLines: 2 }, guild.name)),
			),
			guild.description ? h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, guild.description) : null,
			h(
				Design.TableRowGroup,
				{ title: 'Overview' },
				row('Members', String(number(rawMembers == null ? '—' : rawMembers))),
				rawOnline != null ? row('Online', String(number(rawOnline))) : null,
				row('Friends in this server', friendsLoading ? 'Loading...' : friends.length + ' friend' + (friends.length === 1 ? '' : 's'), friendsLoading
					? {}
					: {
							trailing: chevron(),
							onPress: function () {
								sheets().openLazy(Promise.resolve({ default: function () { return h(FriendsSheet, { friends: friends, guildId: guildId }) } }), FRIENDS_KEY, {})
							},
					  }),
				roles !== null ? row('Roles', String(roles)) : null,
				channels !== null ? row('Channels', String(channels)) : null,
				row('Boost status', 'Level ' + (guild.premiumTier || 0) + ' (' + (guild.premiumSubscriberCount || 0) + ' boosts)'),
			),
			h(
				Design.TableRowGroup,
				{ title: 'Server details' },
				ownerId
					? row('Owner', ownerName, {
							icon: h(RN.Image, { source: { uri: avatarUrl(ownerId, ownerAvatarState[0]) }, style: { width: 24, height: 24, borderRadius: 12 } }),
							trailing: chevron(),
							onPress: function () { openProfile(ownerId, guildId) },
					  })
					: null,
				vanity ? row('Vanity URL', vanity) : null,
				row('Created on', createdOn(guildId)),
				row('Server ID', guildId, {
					onPress: function () {
						try { valenced.externals.ReactNativeClipboard.Clipboard.setString(String(guildId)); toast('Server ID copied') } catch (e) {}
					},
				}),
			),
			h(Design.Button, { text: 'Close', variant: 'secondary', onPress: function () { sheets().hideActionSheet(SHEET_KEY) } }),
		)
	}

	function openServerInfo(guildId) {
		sheets().openLazy(Promise.resolve({ default: function () { return h(ServerInfoSheet, { guildId: guildId }) } }), SHEET_KEY, {})
	}

	// ---- The server menu -----------------------------------------------------------------------
	/** Adds Server Info to the list of items in the menu you get when you hold down a server icon. */
	function withServerInfo(items, guildId) {
		if (!Array.isArray(items) || guildId == null) return items
		if (items.some(function (item) { return item && item.label === 'Server Info' })) return items
		var template = items.find(function (item) { return item && typeof item.label === 'string' }) || {}
		var item = Object.assign({}, template, {
			label: 'Server Info',
			action: function () { openServerInfo(String(guildId)) },
		})
		;['id', 'key', 'testID', 'nativeID', 'index', 'state', 'onPress'].forEach(function (name) { delete item[name] })
		var icon = asset('CircleInformationIcon')
		if (icon == null) icon = asset('InformationIcon')
		if (icon != null) item.iconSource = icon
		else delete item.iconSource
		delete item.IconComponent
		return items.concat(item)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		start: function (api) {
			var cleanup = api.cleanup
			var f = finders()
			cleanup(function () {
				try { sheets().hideActionSheet(SHEET_KEY) } catch (e) {}
				try { sheets().hideActionSheet(FRIENDS_KEY) } catch (e) {}
				ownerCache.clear()
			})
			cleanup(
				f.getModules(
					f.filters.withName('getGuildsBarGuildMenuItems'),
					function (module) {
						if (!module || typeof module.default !== 'function') return
						cleanup(
							valenced.patcher.instead(module, 'default', function (args, original) {
								var items = Reflect.apply(original, this, args)
								try {
									return withServerInfo(items, args[0])
								} catch (e) {
									return items
								}
							}),
						)
					},
					{ returnNamespace: true },
				),
			)
		},
	})
	return exports
})({})
