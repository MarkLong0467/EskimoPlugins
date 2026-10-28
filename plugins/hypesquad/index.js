(function (exports) {
	/*
	 * HypeSquad Switcher for Valenced.
	 * The plugin's settings page lists the three houses. Tapping one joins it, and the row for your
	 * current house shows "Current". There is also a row to leave HypeSquad.
	 * Shipped as written. Keep `(function` as the first thing in this file: Valenced loads it
	 * as `return <file>`.
	 */
	var TOAST = 'MARKLONG_HYPESQUAD'
	// house_id is what Discord's API calls them. The flag is how your profile says which one you are in.
	var HOUSES = [
		{ id: 1, name: 'Bravery', flag: 64 },
		{ id: 2, name: 'Brilliance', flag: 128 },
		{ id: 3, name: 'Balance', flag: 256 },
	]

	var optimistic // The house we just switched to, until Discord's profile data catches up.
	var busy = false
	var listeners = []

	function finders() { return valenced.modules.finders }
	function store(name) { return valenced.discord.flux.Stores[name] }
	function toast(text) {
		try { valenced.discord.actions.ToastActionCreators.open(TOAST, { text: text }) } catch (e) {}
	}
	function notify() {
		listeners.forEach(function (listener) { listener() })
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

	// ---- Which house you are in ----------------------------------------------------------------
	function houseFromProfile() {
		var user = store('UserStore') && store('UserStore').getCurrentUser()
		var flags = (user && (user.publicFlags != null ? user.publicFlags : user.flags)) || 0
		for (var i = 0; i < HOUSES.length; i++) if (flags & HOUSES[i].flag) return HOUSES[i].id
		return 0
	}

	/** The house you are in: 1, 2 or 3, or 0 for none. */
	function currentHouse() {
		var real = houseFromProfile()
		if (optimistic !== undefined && real === optimistic) optimistic = undefined
		return optimistic !== undefined ? optimistic : real
	}

	/** Redraws whatever calls it when your house changes. */
	function useHouse() {
		var React = valenced.react.React
		var tick = React.useState(0)
		React.useEffect(function () {
			var update = function () { tick[1](function (n) { return n + 1 }) }
			listeners.push(update)
			var users = store('UserStore')
			if (users && users.addChangeListener) users.addChangeListener(update)
			return function () {
				listeners = listeners.filter(function (l) { return l !== update })
				if (users && users.removeChangeListener) users.removeChangeListener(update)
			}
		}, [])
		return currentHouse()
	}

	function houseName(id) {
		var house = HOUSES.filter(function (x) { return x.id === id })[0]
		return house ? house.name : 'none'
	}

	// ---- Switching -----------------------------------------------------------------------------
	var TIMEOUT_MS = 15000

	/** Discord's own server connection: the module with HTTPResponseError, as Valenced's Quoter finds it. */
	function discordHttp() {
		var f = finders()
		return f.lookupModule(f.filters.withProps('HTTPResponseError', 'get'))[0] || f.lookupModule(f.filters.withProps('get', 'post', 'del', 'patch'))[0]
	}

	function withTimeout(promise) {
		return new Promise(function (resolve, reject) {
			var timer = setTimeout(function () { reject({ timedOut: true }) }, TIMEOUT_MS)
			Promise.resolve(promise).then(
				function (value) { clearTimeout(timer); resolve(value) },
				function (error) { clearTimeout(timer); reject(error) },
			)
		})
	}

	/** Whether an error came from Discord answering, as opposed to the call itself breaking. */
	function isAnswer(error) {
		return !!error && (error.status != null || error.body != null || (error.response && error.response.status != null))
	}

	/** Sends the request through Discord's own connection, or straight to the API with your token. */
	async function request(method, path, body) {
		var http = discordHttp()
		var call = method === 'DELETE' ? (http && (http.del || http.delete)) : http && http.post
		if (call) {
			try {
				return await withTimeout(call.call(http, body ? { url: path, body: body } : { url: path }))
			} catch (error) {
				if (isAnswer(error) || (error && error.timedOut)) throw error
			}
		}
		var f = finders()
		var auth = f.lookupModule(f.filters.withProps('getToken'))[0]
		var token = auth && auth.getToken && auth.getToken()
		if (!token) throw { message: 'Could not find a way to reach Discord.' }
		var res = await withTimeout(
			fetch('https://discord.com/api/v9' + path, {
				method: method,
				headers: { Authorization: token, 'Content-Type': 'application/json' },
				body: body ? JSON.stringify(body) : undefined,
			}),
		)
		if (!res.ok) {
			var parsed = {}
			try { parsed = await res.json() } catch (e) {}
			throw { status: res.status, body: parsed }
		}
		return res
	}

	function explain(error) {
		if (error && error.timedOut) return 'Discord took too long to answer. Try again.'
		var status = error && (error.status != null ? error.status : error.response && error.response.status)
		var body = error && error.body
		if (typeof body === 'string') { try { body = JSON.parse(body) } catch (e) { body = undefined } }
		var message = body && body.message
		if (body && body.captcha_key) return 'Discord wants a captcha for this change, which a plugin cannot do. Try again later.'
		if (status === 429) return 'Discord says slow down. Try again in a minute.'
		if (message) return message + (status ? ' (' + status + ')' : '')
		if (status) return 'Discord said no (' + status + ').'
		return (error && error.message) || 'Could not change your HypeSquad. Try again.'
	}

	async function change(houseId) {
		if (busy) return toast('Still working on the last change.')
		if (currentHouse() === houseId) return toast(houseId ? 'You are already in HypeSquad ' + houseName(houseId) + '.' : 'You are not in a HypeSquad house.')
		busy = true
		toast(houseId ? 'Joining HypeSquad ' + houseName(houseId) + '...' : 'Leaving HypeSquad...')
		try {
			if (houseId) await request('POST', '/hypesquad/online', { house_id: houseId })
			else await request('DELETE', '/hypesquad/online')
			optimistic = houseId
			notify()
			toast(houseId ? 'You are now in HypeSquad ' + houseName(houseId) + '.' : 'You left HypeSquad.')
		} catch (error) {
			toast(explain(error))
		} finally {
			busy = false
		}
	}

	// ---- Settings ------------------------------------------------------------------------------
	function SettingsComponent() {
		var Design = valenced.discord.design.Design
		var RN = valenced.react.ReactNative
		var current = useHouse()
		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 } },
			h(
				Design.Stack,
				{ style: { paddingVertical: 24, paddingHorizontal: 12 }, spacing: 24 },
				h(
					Design.TableRowGroup,
					{ title: 'HypeSquad' },
					HOUSES.map(function (house) {
						return h(Design.TableRow, {
							key: house.id,
							label: house.name,
							subLabel: current === house.id ? 'Current' : undefined,
							onPress: function () { change(house.id) },
						})
					}),
					current !== 0 ? h(Design.TableRow, { key: 'leave', label: 'Leave HypeSquad', variant: 'danger', onPress: function () { change(0) } }) : null,
				),
			),
		)
	}

	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		SettingsComponent: SettingsComponent,
		start: function (api) {
			api.cleanup(function () {
				optimistic = undefined
				busy = false
			})
		},
	})
	return exports
})({})
