(function (exports) {
	/*
	 * Always Animate for Valenced
	 *
	 * Animates everything that can be animated. The idea comes from AlwaysAnimate for Vencord. The code is written from
	 * scratch for Valenced, using the decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354).
	 *
	 * What the decompiled app shows, and what this plugin does about it:
	 *
	 * 1. Pictures. `discord_app/utils/AvatarUtils.tsx` builds every avatar, banner, server icon and decoration address.
	 *    Each function is told whether the picture "canAnimate". When it is false Discord asks for a still picture,
	 *    even if the picture is animated. The plugin wraps those functions and says true.
	 * 2. Emoji, stickers and GIFs. `UserSettings.AnimateEmoji`, `AnimateStickers` and `GifAutoPlay` are the three
	 *    accessibility settings. The plugin makes them read "on".
	 * 3. Status emoji. `modules/activity_status/native/ActivityEmoji.tsx` animates only when its `emoji.animate` is true.
	 *    The plugin sets it.
	 * 4. Anything else with an `animate` or `canAnimate` property can be forced too (an option, off by default).
	 *
	 * The file reads top to bottom:  1 Settings  2 Counting  3 Pictures  4 Emoji, stickers, GIFs  5 Status emoji
	 *                                6 Everything else  7 Self-check  8 Settings screen  9 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '2.1.0'

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_ALWAYS_ANIMATE', { text: String(text) }) } catch (e) {}
	}
	/** Builds a React element with the JSX runtime, so the file needs no build step. */
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}
	/** The name of a React component, from the element that was just made. */
	function componentName(element) {
		const type = element && element.type
		if (!type || typeof type === 'string') return ''
		const inner = type.type || type.render || type
		return type.displayName || type.name || (inner && (inner.displayName || inner.name)) || ''
	}
	const isPlainObject = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	/** Every switch, in the order the settings screen shows them. `on` is the default. */
	const FEATURES = [
		{ key: 'pictures', on: true, title: 'Pictures', blurb: 'Profile pictures, server profile pictures, banners, avatar decorations and server icons.' },
		{ key: 'emoji', on: true, title: 'Emoji', blurb: 'Animated emoji everywhere, as if "Animate emoji" were on.' },
		{ key: 'stickers', on: true, title: 'Stickers', blurb: 'Animated stickers, as if "Animate stickers" were on.' },
		{ key: 'gifs', on: true, title: 'GIFs', blurb: 'GIFs play by themselves, as if "Play GIFs automatically" were on.' },
		{ key: 'statusEmoji', on: true, title: 'Status emoji', blurb: 'The emoji of a custom status.' },
		{ key: 'chat', on: true, title: 'Chat: pictures and decorations next to messages', blurb: 'The profile picture and avatar decoration beside each message. Discord builds these from plain addresses, so they are fixed on the way to the chat.' },
		{ key: 'addresses', on: true, title: 'Still pictures of animated things', blurb: 'A safety net: when a screen is about to show the still version of an animated server icon, profile picture or banner, it gets the animated one. This catches what the other switches miss, for example the server list.' },
		{ key: 'apng', on: true, title: 'Animated decorations (APNG)', blurb: 'Avatar decorations like ears and frames are animated PNG pictures. Discord has the phone\u2019s image view decode them only for some accounts (the experiment 2026-10-android-fastimage-apng). This switches it on for you.' },
		{ key: 'motion', on: true, title: 'Ignore "Reduce motion"', blurb: 'Discord switches animations off in the chat and elsewhere when your phone or Discord says "reduce motion" (or Game Mode is throttling). This makes Discord think motion is always fine.' },
		{ key: 'everything', on: false, title: 'Everything else (advanced)', blurb: 'Switches on every `animate` or `canAnimate` property Discord gives its screens. This can animate things Discord keeps still on purpose.' },
	]
	const defaults = { ...Object.fromEntries(FEATURES.map((f) => [f.key, f.on])), chatFormat2: 'gif', chatFlip: true, chatExtra: false }

	let storage
	let screenListeners = []
	const redrawSettings = () => screenListeners.slice().forEach((redraw) => { try { redraw() } catch (e) {} })

	function setting(key) {
		const saved = storage && storage.cache && storage.cache[key]
		return saved !== undefined ? saved : defaults[key]
	}
	function saveSettings(patch) {
		try { if (storage && typeof storage.set === 'function') storage.set(patch) } catch (e) {}
		try { if (storage && storage.cache) Object.assign(storage.cache, patch) } catch (e) {}
		redrawSettings()
	}

	// ---------------------------------------------------------------------------------------------------
	// 2. Counting, so the settings screen can say what really happened
	// ---------------------------------------------------------------------------------------------------
	const forced = Object.fromEntries(FEATURES.map((f) => [f.key, 0])) // how many times each feature changed something
	const seen = Object.fromEntries(FEATURES.map((f) => [f.key, 0])) // how many times Discord used the thing that was wrapped
	const perFunction = {} // pictures only: function name -> { seen, changed }
	let selfCheckRunning = false // the plugin's own test calls are not counted
	const found = {} // what was found in Discord: { pictures: 'AvatarUtils (2 holders, 19 functions)', ... }
	const problems = []
	function countSeen(feature, changed, detail) {
		if (selfCheckRunning) return
		seen[feature] += 1
		if (changed) forced[feature] += 1
		if (detail) {
			const entry = perFunction[detail] || (perFunction[detail] = { seen: 0, changed: 0 })
			entry.seen += 1
			if (changed) entry.changed += 1
		}
		if (seen[feature] <= 3 || seen[feature] % 50 === 0) redrawSettings()
	}
	function reportProblem(what, error) {
		const text = `${what}: ${String((error && error.message) || error).slice(0, 80)}`
		if (!problems.includes(text) && problems.length < 6) problems.push(text)
	}

	// ---------------------------------------------------------------------------------------------------
	// Finding Discord's code. `getModules` reports the modules that match now and the ones loaded later (many are
	// loaded only when a screen first needs them, which can be after this plugin started); a plain lookup covers
	// the ones that were loaded before. Everything that is hooked is hooked only once.
	// ---------------------------------------------------------------------------------------------------
	const watchers = []
	function watchModules(cleanup, makeFilter, attach) {
		const finders = valenced.modules.finders
		const run = (mod) => { try { attach(mod) } catch (e) { reportProblem('hook', e) } }
		let filter
		try { filter = makeFilter(finders.filters) } catch (e) { reportProblem('filter', e); return }
		try { if (typeof finders.getModules === 'function') cleanup(finders.getModules(filter, run)) } catch (e) { reportProblem('watch', e) }
		const again = () => { try { finders.lookupModule(filter).forEach(run) } catch (e) {} }
		again()
		watchers.push(again)
	}
	/** Looks again for everything that has not been found yet. Hooks that are already in place are skipped. */
	function lookAgain() { watchers.slice().forEach((again) => { try { again() } catch (e) {} }) }

	// ---------------------------------------------------------------------------------------------------
	// 3. Pictures: AvatarUtils
	// ---------------------------------------------------------------------------------------------------
	/**
	 * Where each AvatarUtils function takes its "may it animate" answer.
	 *   flag: a true/false at that argument position      options: an object with a `canAnimate` property at that position
	 */
	const PICTURE_FUNCTIONS = {
		// the user's picture: (user, canAnimate, size, png, webp) and its "source" form
		getUserAvatarURL: { flag: 1 },
		getUserAvatarSource: { flag: 1 },
		getGuildMemberAvatarURL: { flag: 1 },
		getGuildMemberAvatarSource: { flag: 2 },
		getAnimatableSourceWithFallback: { flag: 0 },
		// everything that takes an options object
		getGuildMemberAvatarURLSimple: { options: 0 },
		getUserBannerURL: { options: 0 },
		getGuildMemberBannerURL: { options: 0 },
		getAvatarDecorationURL: { options: 0 },
		getGuildIconURL: { options: 0 },
		getGuildIconSource: { options: 0 },
		getGuildBannerURL: { options: 0 },
		getGuildBannerSource: { options: 0 },
		getGuildSplashURL: { options: 0 },
		getGuildSplashSource: { options: 0 },
		getGuildHomeHeaderURL: { options: 0 },
		getGuildHomeHeaderSource: { options: 0 },
		getGuildDiscoverySplashURL: { options: 0 },
		getGuildDiscoverySplashSource: { options: 0 },
		getGuildTemplateIconURL: { options: 0 },
		getGuildTemplateIconSource: { options: 0 },
		getApplicationIconURL: { options: 0 },
		getApplicationIconSource: { options: 0 },
		getChannelIconURL: { options: 0 },
		getChannelIconSource: { options: 0 },
	}

	/** The arguments with "may animate" set to true. Returns the same array when nothing needs to change. */
	function withAnimationAllowed(args, where) {
		if (where.flag !== undefined) {
			if (args[where.flag] === true) return args
			const next = args.slice()
			next[where.flag] = true
			return next
		}
		const options = args[where.options]
		if (!isPlainObject(options) || options.canAnimate === true) return args
		const next = args.slice()
		next[where.options] = { ...options, canAnimate: true }
		return next
	}

	/** Wraps one function of a module so that `canAnimate` is true whenever the switch is on. */
	function allowAnimationIn(holder, name, where, cleanup) {
		const original = holder[name]
		if (typeof original !== 'function' || original.__alwaysAnimate) return false
		try {
			cleanup(valenced.patcher.instead(holder, name, function (args, callOriginal) {
				if (!setting('pictures')) return Reflect.apply(callOriginal, this, args)
				const next = withAnimationAllowed(args, where)
				countSeen('pictures', next !== args, name)
				return Reflect.apply(callOriginal, this, next)
			}))
			try { holder[name].__alwaysAnimate = true } catch (e) {}
			return true
		} catch (e) {
			reportProblem(`could not wrap ${name}`, e) // for example a function that cannot be replaced
			return false
		}
	}

	/** AvatarUtils can be reached as the module itself and as its `default` object. Both get the same treatment. */
	function holdersOf(modules) {
		const holders = []
		modules.forEach((mod) => {
			;[mod, mod && mod.default].forEach((holder) => { if (holder && typeof holder === 'object' && !holders.includes(holder)) holders.push(holder) })
		})
		return holders
	}
	const avatarHolders = [] // every AvatarUtils object that was found, for the self-check
	function allowPictureAnimations(cleanup) {
		watchModules(cleanup, (filters) => filters.withProps('getUserAvatarURL', 'getGuildIconURL'), (mod) => {
			holdersOf([mod]).forEach((holder) => {
				if (!avatarHolders.includes(holder)) avatarHolders.push(holder)
				Object.keys(PICTURE_FUNCTIONS).forEach((name) => allowAnimationIn(holder, name, PICTURE_FUNCTIONS[name], cleanup))
			})
			const wrapped = avatarHolders.reduce((total, holder) => total + Object.keys(PICTURE_FUNCTIONS).filter((name) => holder[name] && holder[name].__alwaysAnimate).length, 0)
			found.pictures = `AvatarUtils (${avatarHolders.length} place${avatarHolders.length === 1 ? '' : 's'}, ${wrapped} functions)`
		})
		if (!found.pictures) found.pictures = 'not found'
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Emoji, stickers and GIFs: three accessibility settings
	// ---------------------------------------------------------------------------------------------------
	/** `UserSettings.<name>` has `getSetting()` and `useSetting()`. Both are made to answer true while the switch is on. */
	const ACCESSIBILITY_SETTINGS = [
		{ name: 'AnimateEmoji', feature: 'emoji' },
		{ name: 'AnimateStickers', feature: 'stickers' },
		{ name: 'GifAutoPlay', feature: 'gifs' },
	]
	const accessibilityRoots = []
	const patchedSettings = new WeakSet()
	function allowAccessibilityAnimations(cleanup) {
		watchModules(cleanup, (filters) => filters.withProps('AnimateEmoji', 'AnimateStickers', 'GifAutoPlay'), (mod) => {
			const root = mod && (mod.AnimateEmoji ? mod : mod.default)
			if (!root) return
			if (!accessibilityRoots.includes(root)) accessibilityRoots.push(root)
			ACCESSIBILITY_SETTINGS.forEach(({ name, feature }) => {
				const target = root[name]
				if (!target) { found[feature] = found[feature] || 'not found'; return }
				if (patchedSettings.has(target)) return
				patchedSettings.add(target)
				const methods = ['getSetting', 'useSetting'].filter((method) => typeof target[method] === 'function')
				methods.forEach((method) => {
					cleanup(valenced.patcher.after(target, method, (result) => {
						if (!setting(feature)) return result
						countSeen(feature, result !== true)
						return true
					}))
				})
				found[feature] = `UserSettings.${name} (${methods.join(', ')})`
			})
		})
		ACCESSIBILITY_SETTINGS.forEach(({ feature }) => { if (!found[feature]) found[feature] = 'not found' })
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. Status emoji and 6. everything else: elements as they are made
	// ---------------------------------------------------------------------------------------------------
	const ANIMATION_PROPS = ['animate', 'canAnimate', 'shouldAnimate']

	/** The status emoji only animates when its own `emoji.animate` is true. */
	function animateStatusEmoji(element) {
		const props = element.props
		if (componentName(element) !== 'ActivityEmoji' || !isPlainObject(props.emoji)) return element
		if (props.emoji.animate === true) { countSeen('statusEmoji', false); return element }
		countSeen('statusEmoji', true)
		return valenced.react.React.cloneElement(element, { emoji: { ...props.emoji, animate: true } })
	}
	/** Any screen that was told not to animate is told to. */
	function animateEverything(element) {
		const props = element.props
		if (!isPlainObject(props) || typeof element.type === 'string') return element
		const switchedOff = ANIMATION_PROPS.filter((name) => props[name] === false)
		if (!switchedOff.length) return element
		countSeen('everything', true)
		const patch = Object.fromEntries(switchedOff.map((name) => [name, true]))
		return valenced.react.React.cloneElement(element, patch)
	}

	// A picture's address says if it is the still or the animated one: an animated picture has a hash that starts with
	// "a_" and, when asked for as animated, ends in .gif or .webp?animated=true. Discord's server list (GuildsBarGuild)
	// asks for the animated one only for the open server.
	const STILL_ADDRESS = /(\/a_[0-9a-f]{6,})\.(png|jpe?g|webp)(\?[^#]*)?$/i
	function animatedAddress(uri) {
		if (typeof uri !== 'string' || uri.indexOf('/a_') < 0 || !/discord(app)?\.(com|net)|discordapp/.test(uri)) return uri
		const m = uri.match(STILL_ADDRESS)
		if (!m) return uri
		const query = m[3] || ''
		if (/[?&]animated=true/.test(query)) return uri
		const head = uri.slice(0, m.index) + m[1]
		return m[2].toLowerCase() === 'webp' ? `${head}.webp${query ? `${query}&animated=true` : '?animated=true'}` : `${head}.gif${query}`
	}
	// Decorations: a preset decoration is .../avatar-decoration-presets/<asset>.png?size=..&passthrough=false and
	// passthrough=true is the animated one. A shop decoration ends in /static or /animated.
	function animatedDecoration(uri) {
		if (typeof uri !== 'string') return uri
		if (uri.indexOf('avatar-decoration-presets') >= 0 && /[?&]passthrough=false/.test(uri)) return uri.replace(/([?&]passthrough=)false/, '$1true')
		return uri.replace(/(\/media\/v1\/collectibles-shop\/[^?#]*\/)static(?=[?#]|$)/, '$1animated')
	}
	/**
	 * Discord's chat is drawn natively from a row of plain data: `createMessageContent` returns it, with the address
	 * of the author's picture (`avatarURL`) and decoration (`avatarDecorationURL`) already worked out. This is the
	 * last place to make both animated.
	 */
	const chatSeen = new WeakSet()
	let chatSample = '' // the first address pair that was changed, for the report
	let chatAvatarSample = '' // the first animated profile picture address that went to the chat
	const chatCounts = { rows: 0, animatedAvatars: 0, decorations: 0 }
	function animateChatRow(row) {
		if (!row || typeof row !== 'object') return row
		let changed = false
		if (typeof row.avatarURL === 'string') {
			let next = animatedAddress(row.avatarURL)
			if (setting('chatFormat2') === 'gif') next = asGif(next)
			if (next !== row.avatarURL) { row.avatarURL = next; changed = true }
		}
		if (typeof row.avatarDecorationURL === 'string') { const next = animatedDecoration(row.avatarDecorationURL); if (next !== row.avatarDecorationURL) { row.avatarDecorationURL = next; changed = true } }
		if (!chatSeen.has(row)) {
			const hasDecoration = typeof row.avatarDecorationURL === 'string' && row.avatarDecorationURL
			const animatedAvatar = typeof row.avatarURL === 'string' && /\/a_[0-9a-f]{6,}\./i.test(row.avatarURL)
			chatCounts.rows += 1
			if (animatedAvatar) { chatCounts.animatedAvatars += 1; if (!chatAvatarSample) chatAvatarSample = String(row.avatarURL).replace(/^https?:\/\//, '').slice(0, 90) }
			if (hasDecoration) chatCounts.decorations += 1
		}
		if (changed && !chatSample) chatSample = `${String(row.avatarURL || '').replace(/^https?:\/\//, '').slice(0, 80)} | ${String(row.avatarDecorationURL || '').replace(/^https?:\/\//, '').slice(-60)}`
		if (changed || !chatSeen.has(row)) { chatSeen.add(row); countSeen('chat', changed) }
		return row
	}
	function hookChatRows(cleanup) {
		// 1. `generateMessageRowData(...)` (MessageWithContent.tsx) returns { type, message: <the row data>, ... }. It is a
		//    named export, so it can be found by name, and the row data is in `.message`.
		const patchedRows = new WeakSet()
		watchModules(cleanup, (filters) => filters.withProps('generateMessageRowData'), (mod) => {
			;[mod, mod && mod.default].forEach((holder) => {
				if (!holder || (typeof holder !== 'object' && typeof holder !== 'function') || typeof holder.generateMessageRowData !== 'function' || patchedRows.has(holder)) return
				patchedRows.add(holder)
				cleanup(valenced.patcher.after(holder, 'generateMessageRowData', (result) => {
					if (!setting('chat')) return result
					try { if (result && typeof result === 'object') animateChatRow(result.message) } catch (e) { reportProblem('chat row', e) }
					return result
				}))
				found.chat = 'generateMessageRowData (the chat rows)'
			})
		})
		// 2. `createMessageContent` itself, a default export found by its name (the same row data, also used by reply previews).
		const patched = new WeakSet()
		watchModules(cleanup, (filters) => filters.withName('createMessageContent'), (mod) => {
			;[mod, mod && mod.default].forEach((holder) => {
				if (!holder || (typeof holder !== 'object' && typeof holder !== 'function')) return
				if (typeof holder.default !== 'function' || patched.has(holder) || (holder.default.name && holder.default.name !== 'createMessageContent')) return
				patched.add(holder)
				cleanup(valenced.patcher.after(holder, 'default', (result) => { if (!setting('chat')) return result; try { return animateChatRow(result) } catch (e) { reportProblem('chat row', e); return result } }))
				if (!found.chat || found.chat === 'not found') found.chat = 'createMessageContent (the chat rows)'
			})
		})
		if (!found.chat) found.chat = 'not found'
	}

	/** The same animated picture as a .gif address: the chat may play that kind where it ignores animated webp. */
	function asGif(uri) {
		if (typeof uri !== 'string' || uri.indexOf('/a_') < 0) return uri
		const m = uri.match(/(\/a_[0-9a-f]{6,})\.(png|jpe?g|webp)(\?[^#]*)?$/i)
		if (!m) return uri
		const query = (m[3] || '').replace(/([?&])animated=true&?/, '$1').replace(/[?&]$/, '')
		return `${uri.slice(0, m.index)}${m[1]}.gif${query}`
	}

	/** Rewrites the `source` of an image element when it points at the still version of an animated picture. */
	function animateAddresses(element) {
		const props = element.props
		const source = props && props.source
		if (!source || typeof source !== 'object') return element
		let changed = false
		const fix = (one) => {
			if (!one || typeof one !== 'object' || typeof one.uri !== 'string') return one
			const next = animatedAddress(one.uri)
			if (next === one.uri) return one
			changed = true
			return { ...one, uri: next }
		}
		const fixed = Array.isArray(source) ? source.map(fix) : fix(source)
		if (!changed) return element
		countSeen('addresses', true)
		return valenced.react.React.cloneElement(element, { source: fixed })
	}

	// "Reduce motion": `AccessibilityStore.useReducedMotion` is `GameModeStore.isThrottling || prefersReducedMotion`
	// (modules/a11y/AccessibilityStore.tsx). Rows of the chat are built with it (`createMessageContent` reads it for
	// attachments and embeds) and many screens read it. Both are getters on the store's prototype, so the store itself
	// gets its own getters in front of them, which answer "no" while the switch is on.
	const motionWas = { reduced: undefined, prefers: undefined, found: false, overridden: 0 }
	function descriptorOf(object, name) {
		for (let o = object; o; o = Object.getPrototypeOf(o)) { const d = Object.getOwnPropertyDescriptor(o, name); if (d) return d }
		return null
	}
	function ignoreReducedMotion(cleanup) {
		let store
		try { store = valenced.discord.flux.Stores.AccessibilityStore } catch (e) {}
		if (!store) { found.motion = 'not found'; return }
		const names = ['useReducedMotion', 'prefersReducedMotion']
		const own = {}
		names.forEach((name) => {
			const original = descriptorOf(store, name)
			if (!original) return
			own[name] = Object.getOwnPropertyDescriptor(store, name)
			const read = () => (original.get ? original.get.call(store) : original.value)
			try { motionWas[name === 'useReducedMotion' ? 'reduced' : 'prefers'] = read() } catch (e) {}
			try {
				Object.defineProperty(store, name, {
					configurable: true,
					enumerable: original.enumerable,
					get() {
						const real = read()
						if (!setting('motion')) return real
						if (real) countSeen('motion', true); else countSeen('motion', false)
						return false
					},
				})
				motionWas.found = true
			} catch (e) { reportProblem(`could not override ${name}`, e) }
		})
		found.motion = motionWas.found ? 'AccessibilityStore (useReducedMotion, prefersReducedMotion)' : 'not found'
		cleanup(() => { names.forEach((name) => { try { if (own[name]) Object.defineProperty(store, name, own[name]); else delete store[name] } catch (e) {} }) })
		try { if (typeof store.emitChange === 'function') store.emitChange() } catch (e) {}
	}

	// ---------------------------------------------------------------------------------------------------
	// The last stop in JavaScript: the chat rows as the JSON that goes to the native chat
	// ---------------------------------------------------------------------------------------------------
	// `NativeChatUtils.updateRows(chatRef, { rows, ... })` (modules/chat/native/NativeChatUtils.tsx) turns `rows` into JSON
	// and hands it to the native chat (`NativeChatModule.updateRows`). `rows` is a list of changes (INSERT, UPDATE...)
	// whose rows hold the message data that `createMessageContent` made. This looks at them just before they leave:
	//  - it records which fields a row really has (the report shows them), so it is known what the native chat is told;
	//  - it flips any switch in a row that is false and is about animation (animate..., autoPlay...), like "everything";
	//  - as an experiment (off by default) it adds animation flags the row does not have yet.
	const chatJson = { updates: 0, ops: 0, opKeys: new Set(), holderKeys: new Set(), samples: {}, flipped: 0, flippedKeys: new Set(), added: 0, depthPaths: new Set() }
	const ANIMATION_KEY = /anim|autoplay|auto_play|gifplay/i
	const AVATAR_SAMPLE_KEY = /avatar|anim|play|motion|gif|decor|nameplate/i
	const EXTRA_FLAGS = ['animateAvatar', 'animateAvatars', 'animatedAvatar', 'shouldAnimateAvatar', 'avatarAnimated', 'animateAvatarDecoration', 'animateDecoration', 'avatarDecorationAnimated', 'autoPlayAvatars']
	function visitChatRow(node, path, depth, seen) {
		if (!node || typeof node !== 'object' || depth > 5 || seen.count > 400) return
		seen.count += 1
		if (Array.isArray(node)) { node.slice(0, 20).forEach((child, i) => visitChatRow(child, `${path}[]`, depth + 1, seen)); return }
		if ('avatarURL' in node || 'avatarDecorationURL' in node) {
			chatJson.depthPaths.add(path)
			Object.keys(node).forEach((key) => {
				chatJson.holderKeys.add(key)
				if (AVATAR_SAMPLE_KEY.test(key) && !(key in chatJson.samples)) {
					const value = node[key]
					chatJson.samples[key] = typeof value === 'string' ? value.replace(/^https?:\/\//, '').slice(0, 70) : JSON.stringify(value) === undefined ? String(value) : String(JSON.stringify(value)).slice(0, 40)
				}
			})
			if (setting('chatFlip')) {
				Object.keys(node).forEach((key) => { if (ANIMATION_KEY.test(key) && node[key] === false) { node[key] = true; chatJson.flipped += 1; chatJson.flippedKeys.add(key) } })
			}
			if (setting('chatExtra')) {
				EXTRA_FLAGS.forEach((key) => { if (!(key in node)) { node[key] = true; chatJson.added += 1 } })
			}
		}
		Object.keys(node).forEach((key) => {
			const child = node[key]
			if (child && typeof child === 'object') visitChatRow(child, `${path}.${key}`, depth + 1, seen)
		})
	}
	function hookChatUpdates(cleanup) {
		const patched = new WeakSet()
		watchModules(cleanup, (filters) => filters.withProps('updateRows', 'scrollToBottom', 'clearRows'), (mod) => {
			;[mod, mod && mod.default].forEach((holder) => {
				if (!holder || (typeof holder !== 'object' && typeof holder !== 'function') || typeof holder.updateRows !== 'function' || patched.has(holder)) return
				patched.add(holder)
				cleanup(valenced.patcher.instead(holder, 'updateRows', function (args, original) {
					try {
						const update = args[1]
						const list = update && Array.isArray(update.rows) ? update.rows : null
						if (list) {
							chatJson.updates += 1
							list.slice(0, 60).forEach((op) => {
								chatJson.ops += 1
								if (op && typeof op === 'object') Object.keys(op).forEach((key) => chatJson.opKeys.add(key))
								visitChatRow(op, 'op', 0, { count: 0 })
							})
						}
					} catch (e) { reportProblem('chat json', e) }
					return Reflect.apply(original, this, args)
				}))
				found.chatJson = 'NativeChatUtils.updateRows (the rows as they go to the native chat)'
			})
		})
		if (!found.chatJson) found.chatJson = 'not found'
	}

	// ---------------------------------------------------------------------------------------------------
	// Animated PNG: NativeImageManagerModule.setFastImageApngEnabled
	// ---------------------------------------------------------------------------------------------------
	// Found with Chat Scout: the native module has `setFastImageApngEnabled`. In the decompiled app
	// (components_native/common/FastImageApngExperiment.tsx) it is called once with the result of the experiment
	// "2026-10-android-fastimage-apng", which is off by default. Avatar decorations are animated PNGs, and the
	// native image view only decodes animated PNGs when this is on. The call is wrapped so any later call by Discord
	// also says "true", and it is made now and again a few times.
	const apng = { found: false, calls: 0, discordAsked: [], lastSent: undefined, error: '' }
	function nativeImageManager() {
		try {
			const RN = valenced.react.ReactNative
			const mod = RN && RN.NativeModules && RN.NativeModules.NativeImageManagerModule
			if (mod && typeof mod.setFastImageApngEnabled === 'function') return mod
			const reg = RN && RN.TurboModuleRegistry && typeof RN.TurboModuleRegistry.get === 'function' ? RN.TurboModuleRegistry.get('NativeImageManagerModule') : null
			return reg && typeof reg.setFastImageApngEnabled === 'function' ? reg : null
		} catch (e) { return null }
	}
	let apngModule = null
	let sendingApng = false
	function sendApng() {
		if (!setting('apng')) return
		try {
			const mod = apngModule || nativeImageManager()
			if (!mod) return
			apngModule = mod
			sendingApng = true
			try { mod.setFastImageApngEnabled(true) } finally { sendingApng = false }
			apng.calls += 1
			apng.lastSent = true
		} catch (e) { apng.error = String((e && e.message) || e).slice(0, 80); reportProblem('apng', e) }
	}
	function hookApng(cleanup) {
		const mod = nativeImageManager()
		if (!mod) { found.apng = 'not found'; return }
		apngModule = mod
		apng.found = true
		found.apng = 'NativeImageManagerModule.setFastImageApngEnabled'
		try {
			cleanup(valenced.patcher.instead(mod, 'setFastImageApngEnabled', function (args, original) {
				if (sendingApng) return Reflect.apply(original, this, args)
				apng.discordAsked.push(args[0])
				if (apng.discordAsked.length > 6) apng.discordAsked.shift()
				if (setting('apng')) { apng.lastSent = true; countSeen('apng', args[0] !== true); return Reflect.apply(original, this, [true, ...args.slice(1)]) }
				return Reflect.apply(original, this, args)
			}))
		} catch (e) { reportProblem('could not wrap setFastImageApngEnabled', e) }
		sendApng()
	}

	/** Makes the pictures that are already on screen be drawn again, now that the plugin is in place. */
	function refreshPictures() {
		let count = 0
		try {
			const stores = valenced.discord.flux.Stores
			;['GuildStore', 'GuildMemberStore', 'UserStore', 'MessageStore', 'AccessibilityStore'].forEach((name) => {
				const store = stores && stores[name]
				if (store && typeof store.emitChange === 'function') { store.emitChange(); count += 1 }
			})
		} catch (e) { reportProblem('refresh', e) }
		refreshed.count += count ? 1 : 0
		refreshed.at = Date.now()
		return count
	}
	const refreshed = { count: 0, at: 0 }
	const PICTURE_SWITCHES = ['pictures', 'addresses', 'chat', 'apng', 'motion', 'everything']
	let refreshTimer
	/** After a switch changed, the pictures on screen are drawn again once things have settled. */
	function scheduleRefresh() {
		clearTimeout(refreshTimer)
		refreshTimer = setTimeout(refreshPictures, 300)
	}

	function animateElements(cleanup) {
		const finders = valenced.modules.finders
		const runtime = finders.lookupModule(finders.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		const onNewElement = (element) => {
			if (!element || !element.props) return element
			let result = element
			if (setting('addresses')) result = animateAddresses(result)
			if (setting('statusEmoji')) result = animateStatusEmoji(result)
			if (setting('everything')) result = animateEverything(result)
			return result
		}
		let hooked = 0
		;['jsx', 'jsxs'].forEach((name) => {
			if (runtime && typeof runtime[name] === 'function') { cleanup(valenced.patcher.after(runtime, name, onNewElement)); hooked += 1 }
		})
		found.addresses = hooked ? 'every picture address' : 'not found'
		found.statusEmoji = hooked ? 'every new screen element (ActivityEmoji)' : 'not found'
		found.everything = hooked ? 'every new screen element' : 'not found'
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. Self-check: asks Discord for a made-up animated picture and looks at the address it gives back
	// ---------------------------------------------------------------------------------------------------
	const FAKE_USER = { id: '123456789012345678', avatar: 'a_0123456789abcdef0123456789abcdef', discriminator: '0', username: 'check' }
	const FAKE_ICON = { id: '123456789012345678', icon: 'a_0123456789abcdef0123456789abcdef', size: 64, canAnimate: false }

	function addressOf(value) {
		if (typeof value === 'string') return value
		if (value && typeof value.uri === 'string') return value.uri
		if (Array.isArray(value)) return addressOf(value[0])
		return ''
	}
	/** @returns {{ label: string, ok: boolean, detail: string }[]} */
	function runSelfCheck() {
		selfCheckRunning = true
		try { return runSelfCheckNow() } finally { selfCheckRunning = false }
	}
	function runSelfCheckNow() {
		const results = []
		const finders = valenced.modules.finders
		lookAgain()
		const utils = avatarHolders[0]
		const check = (label, make) => {
			if (!utils) { results.push({ label, ok: false, detail: 'AvatarUtils was not found' }); return }
			try {
				const address = addressOf(make(utils))
				const animated = /\.gif(\?|$)|animated=true/.test(address)
				results.push({ label, ok: animated, detail: address ? address.replace(/^https?:\/\//, '').slice(0, 70) : 'no address came back' })
			} catch (e) { results.push({ label, ok: false, detail: `error: ${String((e && e.message) || e).slice(0, 60)}` }) }
		}
		check('A profile picture, asked for as "still"', (u) => u.getUserAvatarURL(FAKE_USER, false, 64))
		check('A server icon, asked for as "still"', (u) => u.getGuildIconURL({ ...FAKE_ICON }))
		results.push(...settingChecks())
		return results
	}
	function settingChecks() {
		const finders = valenced.modules.finders
		const root = accessibilityRoots[0]
		return ACCESSIBILITY_SETTINGS.map(({ name, feature }) => {
			const label = `Setting "${name}" reads`
			if (!root || !root[name] || typeof root[name].getSetting !== 'function') return { label, ok: false, detail: 'not found' }
			try {
				const value = root[name].getSetting()
				return { label, ok: value === true || !setting(feature), detail: String(value) + (setting(feature) ? '' : ' (this switch is off)') }
			} catch (e) { return { label, ok: false, detail: `error: ${String((e && e.message) || e).slice(0, 60)}` } }
		})
	}

	// ---------------------------------------------------------------------------------------------------
	// 7b. The native part (Kotlin, inside Discord): keeps animated profile pictures playing in the native chat
	// ---------------------------------------------------------------------------------------------------
	const nat = { info: {}, error: '' }
	function nativeCaller() {
		const n = valenced.modules && valenced.modules.native
		if (n && typeof n.callNativeMethod === 'function') return n.callNativeMethod
		if (valenced.native && typeof valenced.native.callNativeMethod === 'function') return valenced.native.callNativeMethod
		return null
	}
	const parseState = (text) => { const out = {}; String(text).split(';').forEach((part) => { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i)] = part.slice(i + 1) }); return out }
	async function nativeCall(name, args) {
		const fn = nativeCaller()
		if (!fn) throw new Error('The native part is not reachable. Restart Discord.')
		return parseState(await fn(`marklong.always-animate.${name}`, args || []))
	}
	async function nativeRefresh() {
		try { nat.info = await nativeCall('state'); nat.error = '' } catch (e) { nat.error = String((e && e.message) || e).slice(0, 100) }
		redrawSettings()
	}
	async function nativeSet(key, value) {
		try { nat.info = await nativeCall('set', [key, String(value)]); nat.error = '' } catch (e) { nat.error = String((e && e.message) || e).slice(0, 100); toast('Could not change that') }
		redrawSettings()
	}
	function nativeReportLines() {
		const i = nat.info
		if (nat.error && !Object.keys(i).length) return [`native chat part: ${nat.error}`]
		return [
			`native chat part: ${i.enabled === 'false' ? 'off' : i.running === 'true' ? 'running' : 'waiting'}; guard tripped ${i.guardTripped}; animated pictures seen ${i.animated}, restarted ${i.restarts}x; chat messages seen ${i.binds}, on screen ${i.attached}; hook: ${i.hook}${i.error ? `; error ${i.error}` : ''}`,
			`native ears: ${i.ears === 'false' ? 'off' : 'on'}; ${i.earViews} ear views seen, ${i.earViewsAnimated} played by Discord's loader; drawn by this plugin: ${i.earOverlays} now, ${i.earDecoded} pictures decoded; ${i.earApng || '-'}`,
			`native ear addresses: ${i.earsSeen || '-'}`,
			`native ear addresses after the mode: ${i.earsOut || '-'}`,
			`native ear files: ${i.earFiles || '-'}`,
		]
	}

	function buildReport() {
		const lines = ['Always Animate report', `version: ${VERSION}`]
		lines.push(`chat json: ${found.chatJson || 'not hooked'}; updates ${chatJson.updates}, change ops ${chatJson.ops}; flipped ${chatJson.flipped}${chatJson.flippedKeys.size ? ` (${[...chatJson.flippedKeys].join(', ')})` : ''}; added ${chatJson.added}`)
		lines.push(`chat json op keys: ${[...chatJson.opKeys].join(', ') || '-'}`)
		lines.push(`chat json row found at: ${[...chatJson.depthPaths].join(' | ') || '-'}`)
		lines.push(`chat json row fields (${chatJson.holderKeys.size}): ${[...chatJson.holderKeys].join(', ') || '-'}`)
		lines.push(`chat json avatar-related values: ${Object.keys(chatJson.samples).map((key) => `${key}=${chatJson.samples[key]}`).join(' ; ') || '-'}`)
		lines.push(`animated png: ${found.apng || 'not hooked'}; told the phone "on" ${apng.calls}x; Discord asked for: ${apng.discordAsked.length ? apng.discordAsked.join(', ') : 'nothing yet'}${apng.error ? `; error ${apng.error}` : ''}`)
		lines.push(`reduce motion before the plugin: Discord said ${motionWas.reduced}, phone/Discord setting ${motionWas.prefers}; answered no ${forced.motion} of ${seen.motion} times`)
		lines.push(`chat picture format: ${setting('chatFormat2')}; chat sample: ${chatSample || 'none yet'}`)
		lines.push(`chat rows seen ${chatCounts.rows}: with an animated profile picture ${chatCounts.animatedAvatars}, with a decoration ${chatCounts.decorations}; animated picture sample: ${chatAvatarSample || 'none yet'}`)
		lines.push(`pictures drawn again: ${refreshed.count}x${refreshed.at ? `, last ${new Date(refreshed.at).toLocaleTimeString()}` : ''}`)
		FEATURES.forEach((f) => lines.push(`${f.key}: ${setting(f.key) ? 'on' : 'off'}; ${found[f.key] || 'not hooked'}; Discord used it ${seen[f.key]} time(s), changed ${forced[f.key]}`))
		const top = Object.keys(perFunction).sort((a, b) => perFunction[b].seen - perFunction[a].seen).slice(0, 8)
		if (top.length) lines.push(`pictures by function (used/changed): ${top.map((n) => `${n} ${perFunction[n].seen}/${perFunction[n].changed}`).join(', ')}`)
		lines.push(...nativeReportLines())
		runSelfCheck().forEach((r) => lines.push(`check - ${r.label}: ${r.ok ? 'ok' : 'FAIL'} ${r.detail}`))
		if (problems.length) lines.push(`problems: ${problems.join(' | ')}`)
		return lines.join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	// ---------------------------------------------------------------------------------------------------
	// 8. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}
	function Pill({ text, color }) {
		const { View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(View, { style: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: `${color}33` } }, h(Text, { variant: 'text-xs/bold', style: { color } }, text))
	}
	function Radio({ title, value, items, onChange }) {
		const Design = valenced.discord.design.Design
		return h(Design.TableRadioGroup, { title, value, onChange }, items.map((item) => h(Design.TableRadioRow, { key: String(item.v), label: item.l, subLabel: item.s, value: item.v })))
	}
	const GREEN = '#23a55a'
	const RED = '#f23f43'
	const AMBER = '#f0b232'
	const GRAY = '#80848e'

	/** How a feature is doing: Off, Not found, Ready (hooked, not used yet), Used (nothing needed changing) or Working. */
	function featureState(feature) {
		if (!setting(feature)) return { text: 'Off', color: GRAY }
		if (!found[feature] || found[feature] === 'not found') return { text: 'Not found', color: RED }
		if (forced[feature] > 0) return { text: `Working · ${forced[feature]} of ${seen[feature]}`, color: GREEN }
		return seen[feature] > 0 ? { text: `Used ${seen[feature]} times, already animated`, color: GREEN } : { text: 'Ready, waiting for Discord to use it', color: AMBER }
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()

		const [, setRedraws] = React.useState(0)
		const [checks, setChecks] = React.useState(null)
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			nativeRefresh()
			const nativeTimer = setInterval(nativeRefresh, 2500)
			return () => { clearInterval(nativeTimer); screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const featureRow = (feature) => {
			const state = featureState(feature.key)
			return h(
				RN.View,
				{ key: feature.key, style: { gap: 6 } },
				h(Design.TableSwitchRow, { label: feature.title, subLabel: feature.blurb, value: !!setting(feature.key), onValueChange: (value) => { saveSettings({ [feature.key]: !!value }); if (PICTURE_SWITCHES.includes(feature.key)) scheduleRefresh() } }),
				h(RN.View, { style: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 6 } },
					h(Pill, { text: state.text, color: state.color }),
					found[feature.key] && h(Design.Text, { variant: 'text-xs/medium', color: 'text-muted', numberOfLines: 1, style: { flex: 1 } }, found[feature.key])),
			)
		}
		const onCount = FEATURES.filter((f) => setting(f.key)).length

		const nativeSection = () => {
			const i = nat.info
			const on = i.enabled !== 'false'
			const saver = Number(i.intervalMs || 400) >= 1000
			const status = nat.error && !Object.keys(i).length ? nat.error : !on ? 'Off' : i.running === 'true' ? `On. Keeping ${i.animated || 0} animated pictures playing` : 'Waiting to start (a few seconds after Discord opens)'
			const mode = String(i.earMode || '0')
			return h(RN.View, { key: 'native', style: { gap: 10 } },
				h(Design.Text, { variant: 'text-sm/semibold', color: 'text-muted' }, 'CHAT PHOTOS (NATIVE PART)'),
				h(Design.TableRowGroup, { title: '' },
					h(Design.TableRow, { key: 'nstatus', label: 'Status', subLabel: status }),
					h(Design.TableSwitchRow, { key: 'non', label: 'Keep profile pictures animated in chat', subLabel: 'Works inside Discord\'s own chat. Starts a few seconds after Discord opens', value: on, onValueChange: (v) => nativeSet('enabled', !!v) }),
					h(Design.TableSwitchRow, { key: 'nsaver', label: 'Battery saver', subLabel: 'Checks once a second instead of about twice a second', value: saver, onValueChange: (v) => nativeSet('intervalMs', v ? 1000 : 400) })),
				i.guardTripped === 'true' && h(RN.View, { key: 'nguard', style: { gap: 8 } },
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'The last start did not finish before Discord closed, so it waited.'),
					h(Design.Button, { text: 'Start now', variant: 'primary', size: 'sm', onPress: () => nativeSet('start', true) })),
				h(Design.TableRowGroup, { key: 'nears', title: '' },
					h(Design.TableSwitchRow, { key: 'nearson', label: 'Animate ears (avatar decorations) in chat', subLabel: 'Ears are animated PNGs, which Discord\'s chat cannot play. This downloads each one and draws it over the still ear', value: i.ears !== 'false', onValueChange: (v) => { nativeSet('ears', !!v); toast('Open the chat again') } }),
					i.earApng ? h(Design.TableRow, { key: 'nearinfo', label: 'Ears', subLabel: `${i.earOverlays || 0} animated now. ${i.earApng}` }) : null))
		}
		const working = FEATURES.filter((f) => setting(f.key) && forced[f.key] > 0).length

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				h(
					Card,
					null,
					h(Design.Text, { variant: 'heading-lg/bold' }, `Always Animate ${VERSION}`),
					h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `${onCount} of ${FEATURES.length} switches are on, ${working} already changed something. Pictures that were already on screen are drawn again after a switch changes or when you tap "Refresh the pictures on screen".`),
					h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Run the self-check', variant: 'primary', size: 'sm', onPress: () => setChecks(runSelfCheck()) })),
						h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport }))),
					h(Design.Button, { text: 'Refresh the pictures on screen', variant: 'secondary', size: 'sm', onPress: () => { sendApng(); const n = refreshPictures(); toast(n ? 'Pictures are drawn again. Server icons and pictures should animate now.' : 'Could not refresh. Switch server or restart Discord.') } }),
				),
				checks && h(
					Design.TableRowGroup,
					{ title: 'Self-check' },
					...checks.map((r, i) => h(Design.TableRow, { key: `check${i}`, label: `${r.ok ? '✓' : '✗'} ${r.label}`, subLabel: r.detail })),
					h(Design.TableRow, { key: 'checkNote', label: 'What this shows', subLabel: 'The plugin asks Discord for a made-up animated picture as "still". A ✓ means the address came back animated (.gif), so the plugin works.' }),
				),
				h(RN.View, { style: { gap: 4 } },
					h(Design.Text, { variant: 'text-sm/semibold', color: 'text-muted' }, 'WHAT ANIMATES'),
					h(Design.TableRowGroup, { title: '' }, ...FEATURES.slice(0, 9).map(featureRow))),
				nativeSection(),
				setting('chat') && h(Design.TableRowGroup, { key: 'chatJson', title: 'Chat rows (what the native chat is sent)' },
					h(Design.TableSwitchRow, { key: 'chatFlip', label: 'Switch on animation flags in chat rows', subLabel: 'Any animation switch in a row that is off is turned on. Nothing is added to the row', value: !!setting('chatFlip'), onValueChange: (value) => saveSettings({ chatFlip: !!value }) }),
					h(Design.TableSwitchRow, { key: 'chatExtra', label: 'Experiment: add animation flags to chat rows', subLabel: 'Adds nine made-up animation flags (animateAvatar and so on). If the native chat does not know a field it may refuse the row: turn this off if the chat breaks', value: !!setting('chatExtra'), onValueChange: (value) => { saveSettings({ chatExtra: !!value }); toast(value ? 'Open the chat again. Turn this off if it looks broken.' : 'Off') } }),
				),
				setting('chat') && h(Radio, { key: 'chatFormat2', title: 'Chat: kind of animated picture', value: setting('chatFormat2'), onChange: (v) => { saveSettings({ chatFormat2: v }); scheduleRefresh() }, items: [
					{ v: 'webp', l: 'Animated webp', s: 'What Discord uses for animated pictures' },
					{ v: 'gif', l: 'GIF', s: 'Try this if the chat does not play the webp. Only for profile pictures' },
				] }),
				h(Design.TableRowGroup, { title: 'Advanced' }, featureRow(FEATURES[9])),
				h(
					Design.TableRowGroup,
					{ title: 'Good to know' },
					h(Design.TableRow, { key: 'k1', label: 'Battery and data', subLabel: 'Animated pictures use more battery and more data than still ones. Turn off what you do not need.' }),
					h(Design.TableRow, { key: 'k2', label: 'Reduce Motion', subLabel: 'Your phone\'s Reduce Motion setting is not changed by this plugin.' }),
					problems.length > 0 && h(Design.TableRow, { key: 'problems', label: 'Problems', subLabel: problems.join(' · ') }),
				),
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 9. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			storage = api.jsonStorage
			const attempt = (what, step) => { try { step() } catch (e) { reportProblem(what, e) } }
			attempt('pictures', () => allowPictureAnimations(api.cleanup))
			attempt('emoji, stickers and GIFs', () => allowAccessibilityAnimations(api.cleanup))
			attempt('status emoji', () => animateElements(api.cleanup))
			attempt('chat rows', () => hookChatRows(api.cleanup))
			attempt('reduce motion', () => ignoreReducedMotion(api.cleanup))
			attempt('animated png', () => hookApng(api.cleanup))
			const apngTimers = [1000, 3000, 8000].map((ms) => setTimeout(() => { if (!apngModule) { try { hookApng(api.cleanup) } catch (e) {} } else sendApng() }, ms))
			api.cleanup(() => apngTimers.forEach(clearTimeout))
			attempt('chat json', () => hookChatUpdates(api.cleanup))
			const nativeLooks = [3000, 9000].map((ms) => setTimeout(nativeRefresh, ms))
			api.cleanup(() => nativeLooks.forEach(clearTimeout))
			// The server list and other screens were drawn before the plugin was in place: draw them again.
			const timers = [1500, 5000].map((ms) => setTimeout(refreshPictures, ms))
			// What was not found yet is looked for again a few times, and the pictures drawn again when it turns up.
			const looks = [1500, 4000, 10000, 25000].map((ms) => setTimeout(() => { const before = JSON.stringify(found); lookAgain(); if (JSON.stringify(found) !== before) scheduleRefresh() }, ms))
			api.cleanup(() => { screenListeners = []; timers.concat(looks).forEach(clearTimeout); clearTimeout(refreshTimer); watchers.length = 0 })
		},
	})
	return exports
})({})
