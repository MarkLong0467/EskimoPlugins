(function (exports) {
	/*
	 * Role Options for Valenced.
	 * The role color on a long press is based on CopyRoleColor for Vendetta by MSMA (public domain),
	 * https://github.com/Martinz64/vendetta-plugins. Rewritten for Valenced.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var TOAST = 'MARKLONG_ROLE_OPTIONS'

	var ID_LABELS = { 'Copy Role ID': 1 }
	var addedAt = 0
	var seen = { roleId: null, guildId: null, at: 0 }

	function finders() { return valenced.modules.finders }
	function find(filter) { return finders().lookupModule(filter)[0] }
	function store(name, prop) {
		var s = valenced.discord.flux.Stores[name]
		return s || find(finders().filters.withProps(prop))
	}

	function toast(text) {
		try {
			var icon = valenced.assets.getAssetIdByName('ic_message_copy')
			valenced.discord.actions.ToastActionCreators.open(TOAST, icon ? { text: text, icon: icon } : { text: text })
		} catch (e) {}
	}

	function hexFromInt(n) {
		return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6)
	}

	function findInTree(node, test, depth) {
		depth = depth || 0
		if (!node || depth > 25) return undefined
		if (Array.isArray(node)) {
			for (var i = 0; i < node.length; i++) {
				var hit = findInTree(node[i], test, depth + 1)
				if (hit) return hit
			}
			return undefined
		}
		if (typeof node !== 'object') return undefined
		if (test(node)) return node
		return node.props ? findInTree(node.props.children, test, depth + 1) : undefined
	}

	function styleColor(style) {
		var list = Array.isArray(style) ? style : [style]
		for (var i = list.length - 1; i >= 0; i--) {
			var c = list[i] && list[i].backgroundColor
			if (typeof c === 'string' && c.charAt(0) === '#') return c
		}
	}

	/** The role's color: from the role itself when the pill has one, else from what it drew. */
	function roleColor(props, drawn) {
		var role = props && props.role
		if (role && typeof role.color === 'number' && role.color > 0) return hexFromInt(role.color)
		var named = findInTree(drawn, function (x) { return x.props && typeof x.props.roleColor === 'string' })
		if (named) return named.props.roleColor
		var dot = findInTree(drawn, function (x) { return x.props && styleColor(x.props.style) })
		if (dot) return styleColor(dot.props.style)
	}

	/** The colors of a role as text: one hex code, or every color of a gradient role. */
	function roleColors(role) {
		if (!role) return undefined
		var list = []
		var c = role.colors
		if (c && typeof c === 'object')
			['primary_color', 'secondary_color', 'tertiary_color'].forEach(function (k) {
				if (typeof c[k] === 'number') list.push(hexFromInt(c[k]))
			})
		if (!list.length && typeof role.color === 'number' && role.color > 0) list.push(hexFromInt(role.color))
		return list.length ? list.join(', ') : undefined
	}

	function lookupRole(roleId) {
		var roles = store('GuildRoleStore', 'getSortedRoles')
		if (!roles || !roleId) return undefined
		var guilds = []
		try { guilds.push(store('SelectedGuildStore', 'getGuildId').getGuildId()) } catch (e) {}
		if (seen.guildId) guilds.unshift(seen.guildId)
		try { guilds = guilds.concat(Object.keys(store('GuildStore', 'getGuilds').getGuilds())) } catch (e) {}
		for (var i = 0; i < guilds.length; i++) {
			var role = guilds[i] && roles.getRole(guilds[i], roleId)
			if (role) return role
		}
	}

	/** Runs Discord's own Copy Role ID action, but keeps the id it copies instead of letting it land in the clipboard. */
	function captureId(press) {
		var CB = valenced.externals.ReactNativeClipboard.Clipboard
		var original = CB.setString
		var id
		CB.setString = function (value) { id = value }
		try { press() } catch (e) {} finally { CB.setString = original }
		return typeof id === 'string' && /^\d{5,}$/.test(id) ? id : undefined
	}

	function copyText(text) {
		valenced.externals.ReactNativeClipboard.Clipboard.setString(text)
	}

	/** Downloads the role's icon and puts the picture itself on the clipboard. */
	async function copyIcon(role) {
		if (!role.icon) return toast('That role has no icon')
		var url = 'https://cdn.discordapp.com/role-icons/' + role.id + '/' + role.icon + '.png?size=512'
		var base64 = await new Promise(function (resolve, reject) {
			fetch(url)
				.then(function (res) {
					if (!res.ok) throw new Error('HTTP ' + res.status)
					return res.blob()
				})
				.then(function (blob) {
					var reader = new FileReader()
					reader.onloadend = function () { resolve(String(reader.result).split(',')[1]) }
					reader.onerror = function () { reject(reader.error) }
					reader.readAsDataURL(blob)
				})
				.catch(reject)
		})
		valenced.externals.ReactNativeClipboard.Clipboard.setImage(base64)
		toast('Copied the role icon')
	}

	var OPTIONS = [
		{
			label: 'Copy Role Name',
			run: function (role) {
				copyText(role.name)
				toast('Copied ' + role.name)
			},
		},
		{
			label: 'Copy Role Color',
			run: function (role) {
				var colors = roleColors(role)
				if (!colors) return toast('That role has no color')
				copyText(colors)
				toast('Copied ' + colors)
			},
		},
		{ label: 'Copy Role Icon', run: copyIcon },
	]

	function isOurs(label) {
		return OPTIONS.some(function (o) { return o.label === label })
	}

	function runOption(option, press) {
		var id = captureId(press)
		if (!id && Date.now() - seen.at < 60000) id = seen.roleId
		var role = lookupRole(id)
		if (!role) return toast('Could not find that role')
		Promise.resolve(option.run(role)).catch(function (e) {
			toast('Could not copy: ' + String((e && e.message) || e))
		})
	}

	/** Remembers which role a sheet or chip is about, from the props Discord gives it. */
	function noteProps(props) {
		var role = props.role
		var id = typeof props.roleId === 'string' ? props.roleId : role && typeof role.id === 'string' ? role.id : undefined
		if (!id) return
		seen.roleId = id
		seen.guildId = props.guildId || (role && role.guild_id) || seen.guildId
		seen.at = Date.now()
	}

	function isIdLabel(x) {
		return x && typeof x === 'object' && typeof x.label === 'string' && ID_LABELS[x.label] === 1
	}

	/** Adds Copy Role Color under Copy Role ID, whether the sheet is a list of items or drawn rows. */
	function decorateSheet(result) {
		try {
			var props = result && result.props
			if (!props) return result
			noteProps(props)
			if (Array.isArray(props.items)) {
				var items = props.items
				var at = items.findIndex(isIdLabel)
				if (at === -1 || items.some(function (i) { return i && isOurs(i.label) })) return result
				var template = items[at]
				var press = ['action', 'onPress', 'onSelect', 'onClick', 'callback', 'handler'].find(function (n) { return typeof template[n] === 'function' })
				if (!press) return result
				var base = template[press]
				var made = OPTIONS.map(function (option) {
					var item = Object.assign({}, template, { label: option.label })
					;['id', 'key', 'testID', 'nativeID', 'index', 'state'].forEach(function (n) { delete item[n] })
					;['action', 'onPress', 'onSelect', 'onClick', 'callback', 'handler'].forEach(function (n) {
						if (n in template) item[n] = function () { runOption(option, base) }
					})
					return item
				})
				if (Date.now() - addedAt < 400) return result
				addedAt = Date.now()
				var next = items.slice()
				next.splice.apply(next, [at + 1, 0].concat(made))
				return valenced.react.React.cloneElement(result, { items: next })
			}
			var kids = props.children
			if (!Array.isArray(kids)) return result
			var row = kids.findIndex(function (k) { return k && k.props && isIdLabel(k.props) })
			if (row === -1 || Date.now() - addedAt < 400) return result
			if (findInTree(kids, function (x) { return x.props && isOurs(x.props.label) })) return result
			addedAt = Date.now()
			var source = kids[row]
			var base2 = source.props.onPress
			if (typeof base2 !== 'function') return result
			kids.splice.apply(kids, [row + 1, 0].concat(OPTIONS.map(function (option, i) {
				return valenced.react.React.cloneElement(source, {
					key: 'role-option-' + i,
					label: option.label,
					onPress: function () { runOption(option, base2) },
				})
			})))
			return result
		} catch (e) {
			return result
		}
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		start: function (api) {
			var f = finders()
			var runtime = find(f.filters.withProps('jsx', 'jsxs')) || valenced.react.ReactJSXRuntime
			;['jsx', 'jsxs'].forEach(function (name) {
				if (runtime && typeof runtime[name] === 'function') api.cleanup(valenced.patcher.after(runtime, name, decorateSheet))
			})
			api.cleanup(
				f.getModules(
					f.filters.withName('ThemedRolePill'),
					function (module) {
						if (!module || typeof module.default !== 'function') return
						api.cleanup(
							valenced.patcher.instead(module, 'default', function (args, original) {
								var ret = Reflect.apply(original, this, args)
								try {
									if (!ret || !ret.props || typeof ret.props.onPress !== 'function') return ret
									var color = roleColor(args[0], ret)
									if (!color) return ret
									return Object.assign({}, ret, {
										props: Object.assign({}, ret.props, {
											onLongPress: function () {
												valenced.externals.ReactNativeClipboard.Clipboard.setString(color)
												toast('Copied ' + color)
											},
										}),
									})
								} catch (e) {
									return ret
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
