(function (exports) {
	/*
	 * Copy Role Colors for Valenced.
	 * Based on CopyRoleColor for Vendetta by MSMA (public domain),
	 * https://github.com/Martinz64/vendetta-plugins. Rewritten for Valenced.
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */
	var TOAST = 'MARKLONG_COPY_ROLE_COLORS'

	function finders() { return valenced.modules.finders }

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

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		start: function (api) {
			var f = finders()
			api.cleanup(
				f.getModules(
					f.filters.withName('ThemedRolePill'),
					function (module) {
						if (!module || typeof module.default !== 'function') return
						api.cleanup(
							valenced.patcher.after(module, 'default', function (args, ret) {
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
