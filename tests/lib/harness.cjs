'use strict'

/**
 * A fake Valenced runtime for testing the *built* plugin bundles.
 *
 * Plugins are compiled by `valenced-plugin build`, which turns every `@valenced/*` import into a property access on
 * the global `valenced` object and `react` / `react-native` into `valenced.react.React` / `valenced.react.ReactNative`.
 * This harness provides those globals, so a bundle can be loaded, started, driven and inspected in plain Node.
 *
 * What is real and what is fake:
 * - The patcher (`before`, `after`, `instead`) and the module finders really work, so a plugin patches fake modules
 *   exactly as it would patch Discord's.
 * - Flux, toasts, action sheets, the design system and React Native are recorders or stand-ins.
 * - `mount()` is a small React renderer: function components, hooks, state and effects work, so settings screens can
 *   be rendered and tapped. It does not draw anything.
 *
 * Nothing here talks to a phone. A passing test shows the logic is right against Discord's documented shapes, not
 * that Discord itself behaves the same way.
 */

const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const ROOT = path.join(__dirname, '..', '..')

// ---------------------------------------------------------------------------------------------------------------
// Small test framework
// ---------------------------------------------------------------------------------------------------------------

/**
 * Creates a tiny test reporter. `check` prints one line per assertion and `done` sets the exit code.
 * Plugin tests share this so every test file reads and reports the same way.
 */
function createReporter(title) {
	let failed = 0
	let passed = 0
	console.log(`\n${title}`)
	return {
		/** Records one assertion. `extra` is printed only when the assertion fails. */
		check(name, ok, extra) {
			if (ok) passed += 1
			else failed += 1
			const detail = !ok && extra !== undefined ? `  -> ${safeJson(extra)}` : ''
			console.log(`${ok ? 'ok   ' : 'FAIL '}${name}${detail}`)
		},
		/** Prints the summary and ends the process with a non-zero code when anything failed. */
		done() {
			console.log(failed ? `\n${failed} FAILED, ${passed} passed` : `\nall ${passed} passed`)
			process.exit(failed ? 1 : 0)
		},
	}
}

function safeJson(value) {
	try {
		return JSON.stringify(value)
	} catch {
		return String(value)
	}
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// ---------------------------------------------------------------------------------------------------------------
// A minimal React: hooks, state and effects, enough to render and tap plugin settings screens
// ---------------------------------------------------------------------------------------------------------------

/**
 * Creates a React stand-in together with the renderer that drives it. Hooks keep their state per component
 * position in the tree, so re-rendering after a state change gives the component its old state back.
 */
function createReact(extras = false) {
	/** Component instances keyed by their position in the tree. */
	const instances = new Map()
	let current = null
	let root = null
	let renderRequested = false

	function requestRender() {
		renderRequested = true
	}

	function useSlot(init) {
		const slot = current.cursor++
		if (!(slot in current.hooks)) current.hooks[slot] = init()
		return current.hooks[slot]
	}

	function depsChanged(a, b) {
		if (!a || !b || a.length !== b.length) return true
		return a.some((value, index) => !Object.is(value, b[index]))
	}

	const React = {
		Fragment: Symbol.for('react.fragment'),
		createElement(type, props, ...children) {
			const { key, ...rest } = props ?? {}
			const kids = children.length === 1 ? children[0] : children.length ? children : rest.children
			return { type, props: { ...rest, ...(kids !== undefined ? { children: kids } : {}) }, key }
		},
		cloneElement(element, props, ...children) {
			const { key, ...rest } = props ?? {}
			const next = { ...element, props: { ...element.props, ...rest } }
			if (children.length) next.props.children = children.length === 1 ? children[0] : children
			if (key !== undefined) next.key = key
			return next
		},
		createContext(defaultValue) {
			const context = { _value: defaultValue, Provider: null }
			context.Provider = { $$context: context }
			return context
		},
		memo: component => component,
		forwardRef: render => ({ $$render: render }),
		Component: class Component {
			constructor(props) {
				this.props = props
			}
		},
		// Only when a test asks for them (`reactExtras`): a plugin that checks for these functions takes another path when they exist.
		...(extras
			? {
					isValidElement: element => !!element && typeof element === 'object' && 'type' in element && 'props' in element,
					useSyncExternalStore(subscribe, getSnapshot) {
						const owner = current
						const slot = useSlot(() => ({ subscribed: false }))
						if (!slot.subscribed) {
							slot.subscribed = true
							subscribe(() => {
								if (owner) requestRender()
							})
						}
						return getSnapshot()
					},
				}
			: {}),
		useState(initial) {
			const owner = current
			const slot = useSlot(() => ({ value: typeof initial === 'function' ? initial() : initial }))
			return [
				slot.value,
				next => {
					const value = typeof next === 'function' ? next(slot.value) : next
					if (Object.is(value, slot.value)) return
					slot.value = value
					if (owner) requestRender()
				},
			]
		},
		useReducer(reducer, initial, init) {
			const slot = useSlot(() => ({ value: init ? init(initial) : initial }))
			return [
				slot.value,
				action => {
					slot.value = reducer(slot.value, action)
					requestRender()
				},
			]
		},
		useRef(initial) {
			return useSlot(() => ({ current: initial }))
		},
		useMemo(factory, deps) {
			const slot = useSlot(() => ({ deps: undefined, value: undefined, ran: false }))
			if (!slot.ran || depsChanged(slot.deps, deps)) {
				slot.value = factory()
				slot.deps = deps
				slot.ran = true
			}
			return slot.value
		},
		useCallback(callback, deps) {
			return React.useMemo(() => callback, deps)
		},
		useEffect(effect, deps) {
			const slot = useSlot(() => ({ deps: undefined, cleanup: undefined, ran: false }))
			if (!slot.ran || depsChanged(slot.deps, deps)) {
				current.pendingEffects.push(() => {
					if (typeof slot.cleanup === 'function') slot.cleanup()
					slot.cleanup = effect()
				})
				slot.deps = deps
				slot.ran = true
			}
			current.effectSlots.push(slot)
		},
		useLayoutEffect(effect, deps) {
			React.useEffect(effect, deps)
		},
		useContext(context) {
			return context._value
		},
		useId() {
			return useSlot(() => ({ id: `id-${instances.size}-${current.cursor}` })).id
		},
	}

	/** Turns an element into a plain tree `{ type, props, children }`, expanding function components. */
	function expand(node, position) {
		if (node === null || node === undefined || typeof node === 'boolean') return null
		if (typeof node === 'string' || typeof node === 'number') return String(node)
		if (Array.isArray(node)) {
			return node.flatMap((child, index) => expand(child, `${position}[${child?.key ?? index}]`) ?? [])
		}
		const { type, props } = node
		if (type === React.Fragment) return expand(props.children, position)
		if (type && type.$$context) {
			type.$$context._value = props.value
			return expand(props.children, position)
		}
		// A class component is made once per position and asked to render; it has no hooks, only props and state.
		const isClass = typeof type === 'function' && type.prototype && typeof type.prototype.render === 'function'
		const component = isClass ? props0 => { const made = new type(props0); made.props = props0; return made.render() } : typeof type === 'function' ? type : type?.$$render ? props0 => type.$$render(props0, null) : null
		if (component) {
			const where = `${position}/${component.displayName || component.name || 'Component'}${node.key != null ? `:${node.key}` : ''}`
			let instance = instances.get(where)
			if (!instance) {
				instance = { hooks: [], cursor: 0, pendingEffects: [], effectSlots: [] }
				instances.set(where, instance)
			}
			instance.cursor = 0
			instance.pendingEffects = []
			instance.effectSlots = []
			const previous = current
			current = instance
			let output
			try {
				output = component(props)
			} finally {
				current = previous
			}
			rendered.push(instance)
			return expand(output, where)
		}
		const children = expand(props.children, `${position}/${typeof type === 'string' ? type : 'host'}`)
		return { type, props, children: children === null ? [] : Array.isArray(children) ? children : [children] }
	}

	let rendered = []

	function renderRoot() {
		rendered = []
		renderRequested = false
		const tree = expand(root, 'root')
		const toRun = rendered.flatMap(instance => instance.pendingEffects)
		for (const effect of toRun) effect()
		return tree
	}

	/**
	 * Renders an element and keeps it mounted. `settle()` re-renders until nothing asks for another render,
	 * which is what happens after a tap changes state. Read the latest tree from `view.tree`.
	 */
	function mount(element) {
		root = element
		const view = {
			tree: null,
			async settle() {
				for (let round = 0; round < 25; round += 1) {
					view.tree = renderRoot()
					await sleep(0)
					if (!renderRequested) break
				}
				return view.tree
			},
			/** Replaces the root element (for example, new props) and renders again. */
			async update(next) {
				root = next
				return view.settle()
			},
			unmount() {
				for (const instance of instances.values()) {
					for (const slot of instance.effectSlots) if (typeof slot.cleanup === 'function') slot.cleanup()
				}
				instances.clear()
			},
		}
		view.tree = renderRoot()
		return view
	}

	return { React, mount }
}

// ---------------------------------------------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------------------------------------------

/** Depth-first list of every element in a rendered tree. */
function allNodes(tree) {
	const out = []
	const visit = node => {
		if (!node || typeof node === 'string') return
		if (Array.isArray(node)) return node.forEach(visit)
		out.push(node)
		visit(node.children)
	}
	visit(tree)
	return out
}

/** First element whose props match `match` (an object of expected values, or a predicate). */
function findNode(tree, match) {
	const test = typeof match === 'function' ? match : node => Object.entries(match).every(([key, value]) => node.props?.[key] === value)
	return allNodes(tree).find(test) ?? null
}

/** Every element whose props match. */
function findNodes(tree, match) {
	const test = typeof match === 'function' ? match : node => Object.entries(match).every(([key, value]) => node.props?.[key] === value)
	return allNodes(tree).filter(test)
}

/** All the text inside a tree, joined with spaces. */
function textOf(tree) {
	const parts = []
	const visit = node => {
		if (node === null || node === undefined) return
		if (typeof node === 'string') return parts.push(node)
		if (Array.isArray(node)) return node.forEach(visit)
		for (const key of ['label', 'subLabel', 'title', 'description', 'placeholder']) {
			if (typeof node.props?.[key] === 'string') parts.push(node.props[key])
		}
		visit(node.children)
	}
	visit(tree)
	return parts.join(' ')
}

// ---------------------------------------------------------------------------------------------------------------
// Patcher: the real behaviour of before / after / instead, with several hooks per function
// ---------------------------------------------------------------------------------------------------------------

/**
 * Implements `before`, `after` and `instead` like Valenced's patcher:
 * - `before(parent, key, args => args)` can change the arguments,
 * - `instead(parent, key, function (args, original) {...})` replaces the call and keeps `this`,
 * - `after(parent, key, result => result)` can change the result.
 * Each returns an unpatch function; the original is restored when the last hook is removed.
 */
function createPatcher() {
	const slots = new WeakMap()

	function slotFor(parent, key) {
		let perParent = slots.get(parent)
		if (!perParent) slots.set(parent, (perParent = new Map()))
		let slot = perParent.get(key)
		if (!slot) {
			const original = parent[key]
			slot = { original, before: [], instead: [], after: [] }
			slot.wrapper = function (...args) {
				let nextArgs = args
				for (const hook of slot.before) nextArgs = hook(nextArgs) ?? nextArgs
				// The newest instead hook is outermost; each one can call down to the previous one.
				const call = (index, callArgs) => {
					if (index < 0) return slot.original.apply(this, callArgs)
					const original = function (...inner) {
						return call(index - 1, inner)
					}
					return slot.instead[index].call(this, callArgs, original)
				}
				let result = call(slot.instead.length - 1, nextArgs)
				for (const hook of slot.after) result = hook(result) ?? result
				return result
			}
			parent[key] = slot.wrapper
			perParent.set(key, slot)
		}
		return { slot, perParent }
	}

	function add(kind) {
		return (parent, key, hook) => {
			if (typeof parent?.[key] !== 'function') throw new TypeError(`Cannot patch ${String(key)}: it is not a function`)
			const { slot, perParent } = slotFor(parent, key)
			slot[kind].push(hook)
			return () => {
				const index = slot[kind].indexOf(hook)
				if (index < 0) return false
				slot[kind].splice(index, 1)
				if (!slot.before.length && !slot.instead.length && !slot.after.length) {
					if (parent[key] === slot.wrapper) parent[key] = slot.original
					perParent.delete(key)
				}
				return true
			}
		}
	}

	return { before: add('before'), after: add('after'), instead: add('instead') }
}

// ---------------------------------------------------------------------------------------------------------------
// Module finders: a registry of fake Discord modules and the filters that search it
// ---------------------------------------------------------------------------------------------------------------

/** Creates the finders. `loadModule` simulates Discord loading another module later. */
function createFinders() {
	const loaded = []
	const subscribers = []

	const exportsOf = mod => [mod, mod?.default].filter(value => value && typeof value === 'object' || typeof value === 'function')

	const filters = {
		withProps: (...names) => ({ test: mod => exportsOf(mod).some(e => names.every(name => name in e)) }),
		withoutProps: (...names) => ({ test: mod => exportsOf(mod).every(e => names.every(name => !(name in e))) }),
		withSingleProp: name => ({ test: mod => exportsOf(mod).some(e => Object.keys(e).length === 1 && name in e) }),
		withName: name => ({ test: mod => exportsOf(mod).some(e => e?.name === name || e?.displayName === name) }),
		withStoreName: name => ({ test: mod => exportsOf(mod).some(e => e?.getName?.() === name || e?.displayName === name) }),
		namespaceOnly: filter => ({ test: mod => filter.test(mod) }),
		withDependencies: filter => filter,
		allOf: (...list) => ({ test: mod => list.every(f => f.test(mod)) }),
		anyOf: (...list) => ({ test: mod => list.some(f => f.test(mod)) }),
		/** Like Valenced's: `createFilterGenerator(test, key, scope)(...args)` makes a filter that runs `test(args, id, exports)`. */
		createFilterGenerator: test => (...args) => ({ test: mod => exportsOf(mod).some(exports => !!test(args, 0, exports)) }),
		FilterScopes: { Uninitialized: 'uninitialized', Initialized: 'initialized', All: 'all' },
	}

	const matches = (filter, mod) => {
		if (typeof filter === 'function') return !!filter(mod)
		return !!filter?.test?.(mod)
	}

	return {
		filters,
		lookupModule(filter) {
			const index = loaded.findIndex(entry => matches(filter, entry.exports))
			return index < 0 ? [] : [loaded[index].exports, loaded[index].id]
		},
		*lookupModules(filter) {
			for (const entry of loaded) if (matches(filter, entry.exports)) yield [entry.exports, entry.id]
		},
		/** Calls back for modules already loaded (after an event loop) and for modules loaded later. */
		getModules(filter, callback) {
			let active = true
			// Each module is reported to a subscriber once, whether it was loaded before or after subscribing.
			const delivered = new Set()
			const subscriber = {
				filter,
				active: () => active,
				callback: (exports, id) => {
					if (delivered.has(exports)) return
					delivered.add(exports)
					callback(exports, id)
				},
			}
			subscribers.push(subscriber)
			setImmediate(() => {
				if (!active) return
				for (const entry of [...loaded]) if (matches(filter, entry.exports)) subscriber.callback(entry.exports, entry.id)
			})
			return () => {
				active = false
			}
		},
		/** Calls back only for modules loaded after this call. */
		waitForModules(filter, callback) {
			let active = true
			subscribers.push({ filter, callback, active: () => active, onlyLater: true })
			return () => {
				active = false
			}
		},
		/** Test control: pretend Discord loaded a module. Returns its id. */
		loadModule(exports, id = loaded.length + 1) {
			loaded.push({ id, exports })
			for (const subscriber of subscribers) {
				if (subscriber.active() && matches(subscriber.filter, exports)) subscriber.callback(exports, id)
			}
			return id
		},
		/** Test control: how many getModules / waitForModules subscriptions are still active. */
		activeSubscriptions: () => subscribers.filter(subscriber => subscriber.active()).length,
	}
}

// ---------------------------------------------------------------------------------------------------------------
// JSON storage
// ---------------------------------------------------------------------------------------------------------------

function deepMerge(base, patch) {
	if (patch === null || typeof patch !== 'object' || Array.isArray(patch)) return patch
	const out = { ...(base && typeof base === 'object' ? base : {}) }
	for (const [key, value] of Object.entries(patch)) out[key] = deepMerge(out[key], value)
	return out
}

// ---------------------------------------------------------------------------------------------------------------
// The runtime
// ---------------------------------------------------------------------------------------------------------------

/** Like React Native's `StyleSheet.flatten`: merges a style, or a nested array of styles, into one object. */
function flatten(style) {
	if (Array.isArray(style)) return style.reduce((merged, item) => ({ ...merged, ...(flatten(item) ?? {}) }), {})
	return style || undefined
}

/** Returns a Proxy that answers any property with a recording function. Used for Discord action creators. */
function recorder(log, label) {
	return new Proxy(
		{},
		{
			get: (target, name) => {
				if (name === 'then') return undefined
				if (!(name in target)) target[name] = (...args) => log.push({ label, name: String(name), args })
				return target[name]
			},
		},
	)
}

/**
 * Builds the fake `valenced` global.
 *
 * @param {object} [options]
 * @param {object} [options.stores] Fake Flux stores, for example `{ UserStore: { getCurrentUser: () => ({}) } }`.
 * @param {object} [options.overrides] Deep-merged over the defaults, to add or replace any part of `valenced`.
 * @param {boolean} [options.loopback] When true, `Dispatcher.dispatch(action)` also runs the action through the handlers
 * plugins registered with `onFluxEventDispatched`, as Discord's own Flux would. The action is still recorded.
 */
function createRuntime(options = {}) {
	const react = createReact(!!options.reactExtras)
	const patcher = createPatcher()
	const finders = createFinders()

	const log = {
		/** Every call to an action creator (toasts, action sheets, alerts, modals). */
		actions: [],
		/** Every Flux action passed to `Dispatcher.dispatch`. */
		dispatched: [],
		/** Everything passed to console.warn / console.error by the plugin. */
		warnings: [],
	}

	const fluxHandlers = new Map()
	const stores = { ...(options.stores ?? {}) }

	const nativeModules = new Proxy(
		{},
		{
			get: () => undefined,
		},
	)

	const valenced = {
		patcher,
		modules: {
			finders: { ...finders, filters: finders.filters },
			native: { getNativeModule: name => nativeModules[name], fs: {} },
		},
		react: {
			React: react.React,
			ReactNative: new Proxy(
				{
					StyleSheet: { create: styles => styles, flatten, hairlineWidth: 1 },
					Platform: { OS: 'android', select: choices => choices.android ?? choices.default },
					AppState: { addEventListener: () => ({ remove() {} }), currentState: 'active' },
					Alert: { alert: () => {} },
					Linking: { openURL: async url => { (globalThis.__opened ??= []).push(url) } },
				Share: { share: async () => {} },
				useWindowDimensions: () => ({ width: 400, height: 800 }),
				PanResponder: { create: config => ({ config, panHandlers: { onMoveShouldSetResponder: () => true, onResponderRelease: () => {} } }) },
					Dimensions: { get: () => ({ width: 400, height: 800, scale: 2, fontScale: 1 }) },
					Keyboard: { dismiss() {} },
					Vibration: { vibrate() {} },
				},
				{ get: (target, name) => (name in target ? target[name] : String(name)) },
			),
			// Valenced's `beforeJSX(type, fn)`: `fn` gets `[type, props, key]` of every element of `type` and returns the args to use.
			jsxRuntime: {
				beforeJSX(type, fn) {
					const runtime = globalThis.valenced.react.ReactJSXRuntime
					const undo = ['jsx', 'jsxs'].map(name => {
						const original = runtime[name]
						runtime[name] = (t, p, k) => (t === type ? original(...(fn([t, p, k]) ?? [t, p, k])) : original(t, p, k))
						return () => { runtime[name] = original }
					})
					return () => undo.reverse().forEach(fn => fn())
				},
			},
			ReactJSXRuntime: {
				Fragment: react.React.Fragment,
				jsx: (type, props, key) => ({ type, props: props ?? {}, key }),
				jsxs: (type, props, key) => ({ type, props: props ?? {}, key }),
			},
		},
		discord: {
			flux: {
				Stores: stores,
				onFluxEventDispatched(type, handler) {
					if (!fluxHandlers.has(type)) fluxHandlers.set(type, new Set())
					fluxHandlers.get(type).add(handler)
					return () => fluxHandlers.get(type).delete(handler)
				},
			},
			common: {
				flux: {
					Dispatcher: {
						dispatch: action => {
							log.dispatched.push(action)
							if (options.loopback) fire(action.type, action)
						},
						subscribe() {},
						unsubscribe() {},
					},
				},
				tokens: { Tokens: { default: { colors: new Proxy({}, { get: (target, name) => `#${String(name)}` }) } } },
				constants: {},
				logger: { Logger: class {} },
				utils: {},
			},
			actions: {
				ToastActionCreators: recorder(log.actions, 'toast'),
				ActionSheetActionCreators: recorder(log.actions, 'actionSheet'),
				AlertActionCreators: recorder(log.actions, 'alert'),
				ModalActionCreators: recorder(log.actions, 'modal'),
			},
			// `import { Design } from '@valenced/discord/design'` becomes `valenced.discord.design.Design`.
			// Every component on it is a marker string ("Design.TableRow") that a rendered tree can be searched for.
			design: {
				Design: new Proxy(
					{ createStyles: styles => () => styles },
					{ get: (target, name) => (name in target ? target[name] : `Design.${String(name)}`) },
				),
			},
			native: {},
			modules: { settings: {} },
		},
		externals: {
			ReactNativeClipboard: { Clipboard: { getString: async () => '', setString() {} } },
			ReactNavigation: { ReactNavigationNative: { useNavigation: () => ({ navigate() {}, setOptions() {}, goBack() {} }) } },
		},
		plugins: { constants: { pluginStorageDirFor: id => `/storage/${id}`, pluginDistDirFor: id => `/dist/${id}` } },
		utils: {},
		// Asset lookups answer with the asset's name, so a test can see which icon was asked for.
		assets: { getAssetIdByName: name => name },
		// Components imported as defaults (`import Page from '@valenced/components/Page'`) are marker strings too.
		components: { Page: 'Page', FormSwitch: 'FormSwitch', SearchInput: 'SearchInput', TableRowAssetIcon: 'TableRowAssetIcon' },
	}

	if (options.overrides) mergeInto(valenced, options.overrides)

	/** Test control: sends a Flux event through the handlers plugins registered, like Discord dispatching it. */
	function fire(type, payload) {
		let result = payload
		for (const handler of fluxHandlers.get(type) ?? []) result = handler(result) ?? result
		return result
	}

	/** Creates a fake JSON storage. `use()` works as a hook inside `mount()`. */
	function makeStorage(initial = {}) {
		const listeners = new Set()
		const storage = {
			loaded: true,
			cache: initial,
			async get() {
				return storage.cache
			},
			async set(value, replace) {
				storage.cache = replace ? value : deepMerge(storage.cache, value)
				for (const listener of listeners) listener(value, replace ? 1 : 0)
			},
			subscribe(callback) {
				listeners.add(callback)
				return () => listeners.delete(callback)
			},
			use() {
				const [, bump] = react.React.useState(0)
				react.React.useEffect(() => storage.subscribe(() => bump(n => n + 1)), [])
				return storage.cache
			},
			async exists() {
				return true
			},
			async delete() {
				storage.cache = {}
				return true
			},
		}
		return storage
	}

	return {
		valenced,
		log,
		stores,
		finders,
		fire,
		makeStorage,
		mount: react.mount,
		React: react.React,
		/** Installs `valenced` and `plugin` as globals, which is where built bundles look for them. */
		install() {
			globalThis.valenced = valenced
			globalThis.plugin = definition => definition
			return this
		},
	}
}

function mergeInto(target, source) {
	for (const [key, value] of Object.entries(source)) {
		if (value && typeof value === 'object' && !Array.isArray(value) && target[key] && typeof target[key] === 'object') mergeInto(target[key], value)
		else target[key] = value
	}
}

// ---------------------------------------------------------------------------------------------------------------
// Loading and starting plugins
// ---------------------------------------------------------------------------------------------------------------

/**
 * Finds a plugin's bundle and reads it as text, without running it. For tests that run the bundle themselves against
 * their own fake Discord. `BUNDLE_DIR` works as described for `loadPlugin`.
 *
 * @param {string} name The plugin's folder name.
 * @returns {{ file: string, source: string }}
 */
function readBundleSource(name) {
	const base = process.env.BUNDLE_DIR ? path.resolve(process.env.BUNDLE_DIR) : path.join(ROOT, 'plugins')
	const candidates = [path.join(base, name, 'build', 'js', 'index.js')]
	// A plugin that ships a ready-made bundle (not yet converted to TypeScript) has `index.js` in its folder.
	candidates.push(path.join(base, name, 'index.js'))
	const file = candidates.find(candidate => fs.existsSync(candidate))
	if (!file) throw new Error(`No build for "${name}". Run: bun run build:dev ${name}`)
	return { file, source: fs.readFileSync(file, 'utf8') }
}

/**
 * Loads a built plugin bundle. Build it first with `bun run build:dev <name>` (the test runner does this).
 *
 * Setting `BUNDLE_DIR` loads `<BUNDLE_DIR>/<name>/build/js/index.js` (or `<BUNDLE_DIR>/<name>/index.js` for a plugin
 * that was shipped as a ready-made bundle) instead of the one in this repository. Running the same test file against
 * two builds of one plugin shows whether a rewrite behaves the same as the version it replaced.
 *
 * @param {string} name The plugin's folder name, for example `split-large-messages`.
 * @returns {{ definition: object, exports: object, source: string }}
 */
function loadPlugin(name) {
	const { file, source } = readBundleSource(name)
	const exports = vm.runInThisContext(source, { filename: file })
	if (!exports || !exports.default) throw new Error(`"${name}" did not export a plugin definition`)
	return { definition: exports.default, exports, source }
}

/**
 * Runs a plugin's lifecycle the way Valenced does: `preInit`, `init`, `start`, in order, with the scoped `api`.
 * `stop()` runs the plugin's own `stop` and then every registered cleanup in reverse order.
 *
 * @param {object} definition The object the bundle passed to `plugin()`.
 * @param {object} runtime From `createRuntime()`.
 * @param {object} [options]
 * @param {object} [options.storage] A storage from `runtime.makeStorage()`. Defaults to an empty one.
 */
async function startPlugin(definition, runtime, options = {}) {
	const cleanups = []
	const errors = []
	/** What the plugin asked the loader to do through `api.plugin`. */
	const requests = { reload: 0, disable: 0, stop: 0 }
	const storage = options.storage ?? runtime.makeStorage(definition.jsonStorage?.default ?? {})
	const api = {
		cleanup: (...fns) => cleanups.push(...fns),
		decorate: () => {},
		jsonStorage: storage,
		logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
		plugin: {
			reportError: error => errors.push(error),
			disable: () => requests.disable++,
			stop: () => requests.stop++,
			requireReload: () => requests.reload++,
		},
		unscoped: runtime.valenced,
	}
	if (definition.preInit) await definition.preInit(api)
	if (definition.init) await definition.init(api)
	if (definition.start) await definition.start(api)
	return {
		api,
		storage,
		errors,
		requests,
		cleanups,
		async stop() {
			if (definition.stop) await definition.stop(api)
			for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
			cleanups.length = 0
		},
	}
}

module.exports = {
	ROOT,
	createReporter,
	createRuntime,
	loadPlugin,
	readBundleSource,
	startPlugin,
	findNode,
	findNodes,
	allNodes,
	textOf,
	sleep,
}
