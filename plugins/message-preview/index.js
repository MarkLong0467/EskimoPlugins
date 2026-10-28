(function (exports) {
	/*
	 * Message Preview for Valenced.
	 * Based on the Message Preview plugin for Revenge by nexpid and pylix (CC BY 4.0),
	 * https://github.com/nexpid/RevengePlugins. Rewritten for Valenced.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var ALERT_KEY = 'marklong.message-preview'
	var defaults = { buttonType: 'pill', previewType: 'ephemeral' }
	var BUTTON_SIZE = 40

	var storage
	var styles

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function find(filter) { return finders().lookupModule(filter)[0] }
	function setting(key) {
		var s = storage && storage.cache
		return (s && s[key]) || defaults[key]
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

	// ---- The preview ---------------------------------------------------------------------------
	/** What you have picked to upload, written the way a sent message lists its attachments. */
	async function getAttachments(channelId) {
		try {
			var uploads = store('UploadAttachmentStore').getUploads(channelId, 0)
			return await Promise.all(
				uploads.map(async function (upload) {
					var item = upload.item
					var attachment = {
						id: upload.uniqueId,
						filename: upload.spoiler ? 'SPOILER_' + upload.filename : upload.filename,
						content_type: item.mimeType,
						size: await upload.getSize(),
						spoiler: upload.spoiler,
						url: item.uri + '#',
						proxy_url: item.uri + '#',
					}
					if (upload.isImage) {
						attachment.width = item.width
						attachment.height = item.height
					}
					return attachment
				}),
			)
		} catch (e) {
			return []
		}
	}

	/** Shows the message to you only, as a message from Clyde's kind of ephemeral bot message. */
	function previewAsEphemeral(channelId, content, attachments, author) {
		var f = finders()
		var bots = find(f.filters.withProps('createBotMessage'))
		if (!bots) return false
		var message = Object.assign(bots.createBotMessage({ channelId: channelId, content: content }), { author: author, attachments: attachments })
		var actions = find(f.filters.withProps('receiveMessage'))
		if (actions) {
			try {
				actions.receiveMessage(channelId, message)
				return true
			} catch (e) {}
		}
		try {
			valenced.discord.common.flux.Dispatcher.dispatch({ type: 'MESSAGE_CREATE', channelId: channelId, message: message, optimistic: false, isPushNotification: false })
			return true
		} catch (e) {}
		return false
	}

	/** Draws the message in a popup, with Discord's own message drawing. */
	function previewAsPopup(channelId, content, attachments, author) {
		var f = finders()
		var MessageRecord = find(f.filters.withName('MessageRecord'))
		var RowManager = find(f.filters.withName('RowManager'))
		var wrapper = find(f.filters.withProps('DCDAutoModerationSystemMessageView', 'default'))
		var ChatItem = wrapper && wrapper.default
		if (typeof MessageRecord !== 'function' || typeof RowManager !== 'function' || !ChatItem) return false
		var message = new MessageRecord({ id: '0', channel_id: channelId, content: content, attachments: attachments, author: author })
		valenced.discord.actions.AlertActionCreators.openAlert(ALERT_KEY, h(PreviewAlert, { ChatItem: ChatItem, rows: new RowManager(), message: message }))
		return true
	}

	function PreviewAlert(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var size = RN.useWindowDimensions ? RN.useWindowDimensions() : { height: 800 }
		return h(Design.AlertModal, {
			title: 'Message Preview',
			extraContent: h(
				RN.ScrollView,
				{ style: { marginVertical: 12, maxHeight: size.height * 0.7 } },
				h(props.ChatItem, { rowGenerator: props.rows, message: props.message }),
			),
			actions: h(Design.AlertActionButton, {
				text: 'Close',
				variant: 'secondary',
				onPress: function () { valenced.discord.actions.AlertActionCreators.dismissAlert(ALERT_KEY) },
			}),
		})
	}

	/** Previews what is in the message box. `typed` is the text from the box when it is known. */
	async function openPreview(typed) {
		var channelId = store('SelectedChannelStore').getChannelId()
		if (!channelId) return
		var content = typeof typed === 'string' ? typed : store('DraftStore').getDraft(channelId, 0) || ''
		var uploads = store('UploadAttachmentStore')
		var hasUploads = !!(uploads && uploads.getUploads && uploads.getUploads(channelId).length)
		if (!content.trim() && !hasUploads) return
		var author = store('UserStore').getCurrentUser()
		var attachments = await getAttachments(channelId)
		var shown = false
		try {
			if (setting('previewType') === 'popup') shown = previewAsPopup(channelId, content, attachments, author)
		} catch (e) {}
		if (!shown) {
			var ok = false
			try { ok = previewAsEphemeral(channelId, content, attachments, author) } catch (e) {}
			if (!ok) valenced.discord.actions.ToastActionCreators.open('MARKLONG_MESSAGE_PREVIEW', { text: 'Could not show the preview' })
		}
	}

	// ---- The floating button -------------------------------------------------------------------
	function findIcon(names) {
		for (var i = 0; i < names.length; i++) {
			var icon = valenced.utils.discord.lookupGeneratedIconComponent(names[i])
			if (icon) return icon
		}
	}

	function PreviewButton(props) {
		var React = valenced.react.React
		var RN = valenced.react.ReactNative
		var Design = valenced.discord.design.Design
		var Tokens = valenced.discord.common.tokens.Tokens
		var textState = React.useState('')
		React.useEffect(function () {
			var input = props.inputProps
			var undo = valenced.patcher.before(input, 'handleTextChanged', function (args) {
				textState[1](typeof args[0] === 'string' ? args[0] : '')
				return args
			})
			return function () { undo() }
		}, [])
		if (!styles)
			styles = Design.createStyles({
				wrap: { flexDirection: 'row', position: 'absolute', left: 0, top: -BUTTON_SIZE, zIndex: 3 },
				button: {
					borderRadius: 2147483647,
					height: BUTTON_SIZE,
					width: BUTTON_SIZE,
					marginHorizontal: 4,
					marginLeft: 8,
					marginTop: -4,
					flexShrink: 0,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: Tokens.default.colors.BACKGROUND_SURFACE_HIGH,
				},
			})
		var st = styles()
		var text = textState[0]
		var visible = text.length > 0
		var Icon = findIcon(['EyeIcon'])
		var asset = valenced.assets.getAssetIdByName('EyeIcon')
		var Tap = RN.Pressable || RN.TouchableOpacity
		return h(
			RN.View,
			{ style: [st.wrap, { opacity: visible ? 1 : 0 }], pointerEvents: visible ? 'box-none' : 'none' },
			h(
				Tap,
				{ style: st.button, accessibilityLabel: 'Preview message', onPress: visible ? function () { openPreview(text) } : undefined },
				Icon ? h(Icon, { size: 'md' }) : asset != null ? h(RN.Image, { source: asset, style: { width: BUTTON_SIZE * 0.6, height: BUTTON_SIZE * 0.6 } }) : null,
			),
		)
	}

	/** Finds an element anywhere in a tree of React elements. */
	function findInTree(node, test) {
		if (!node || typeof node !== 'object') return undefined
		if (Array.isArray(node)) {
			for (var i = 0; i < node.length; i++) {
				var hit = findInTree(node[i], test)
				if (hit) return hit
			}
			return undefined
		}
		if (test(node)) return node
		return node.props ? findInTree(node.props.children, test) : undefined
	}

	/** Adds the button to the message box when it is drawn. */
	function decorateInput(ret) {
		if (setting('buttonType') !== 'pill' || !ret || !ret.props) return ret
		var holder = findInTree(ret.props.children, function (x) { return x && x.props && x.props.chatInputRef && x.props.chatInputRef.current })
		var inputProps = holder && holder.props.chatInputRef.current
		if (!inputProps || typeof inputProps.handleTextChanged !== 'function') return ret
		var row = findInTree(ret.props.children, function (x) {
			return x && x.type && (x.type.displayName === 'View' || x.type === valenced.react.ReactNative.View) && Array.isArray(x.props && x.props.children)
		})
		if (!row) return ret
		var kids = row.props.children
		if (kids.some(function (k) { return k && k.key === 'message-preview-button' })) return ret
		kids.unshift(h(PreviewButton, { key: 'message-preview-button', inputProps: inputProps }))
		return ret
	}

	// ---- Settings ------------------------------------------------------------------------------
	function SettingsComponent(props) {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var json = props.api.jsonStorage
		storage = json
		var settings = Object.assign({}, defaults, json.use())
		function radio(title, key, rows) {
			return h(
				Design.TableRadioGroup,
				{ title: title, value: settings[key], onChange: function (value) { var patch = {}; patch[key] = value; json.set(patch) } },
				rows.map(function (r) { return h(Design.TableRadioRow, { key: r.value, label: r.label, subLabel: r.subLabel, value: r.value }) }),
			)
		}
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				radio('Button type', 'buttonType', [
					{ value: 'pill', label: 'Floating pill', subLabel: 'A button over the message box that shows when you have typed something' },
					{ value: 'send', label: 'Send button', subLabel: 'Holding the send button' },
				]),
				radio('Preview type', 'previewType', [
					{ value: 'popup', label: 'Popup', subLabel: 'Shown in a window on top of the chat' },
					{ value: 'ephemeral', label: 'Ephemeral message', subLabel: 'Shown in the chat, only to you' },
				]),
				h(
					Design.TableRowGroup,
					{ title: 'About' },
					h(Design.TableRow, { key: 'credit', label: 'Credit', subLabel: 'Based on Message Preview for Revenge by nexpid and pylix.' }),
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
			cleanup(function () {
				try { valenced.discord.actions.AlertActionCreators.dismissAlert(ALERT_KEY) } catch (e) {}
			})

			// The message box. Discord names the part that wraps it ChatInputGuardWrapper.
			cleanup(
				f.getModules(
					f.filters.withName('ChatInputGuardWrapper'),
					function (module) {
						if (!module || typeof module.default !== 'function') return
						cleanup(
							valenced.patcher.instead(module, 'default', function (args, original) {
								var ret = Reflect.apply(original, this, args)
								try { return decorateInput(ret) } catch (e) { return ret }
							}),
						)
					},
					{ returnNamespace: true },
				),
			)

			// Holding the send button. Its tap handler is named handlePressSend in every language.
			var RN = valenced.react.ReactNative
			var Pressable = RN.Pressable
			if (Pressable && typeof Pressable.type === 'function') {
				cleanup(
					valenced.patcher.before(Pressable, 'type', function (args) {
						try {
							var props = args[0]
							if (props && typeof props.onPress === 'function' && props.onPress.name === 'handlePressSend') {
								var original = props.onLongPress
								return [Object.assign({}, props, {
									onLongPress: function () {
										if (setting('buttonType') === 'send') openPreview()
										else if (typeof original === 'function') return original.apply(this, arguments)
									},
								})].concat(args.slice(1))
							}
						} catch (e) {}
						return args
					}),
				)
			}
		},
	})
	return exports
})({})
