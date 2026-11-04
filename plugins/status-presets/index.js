(function (exports) {
	/*
	 * Status Presets for Valenced
	 *
	 * Save a status as a preset (Online / Idle / Do Not Disturb / Invisible, plus a custom status with an emoji
	 * and a "clear after" time) and switch to it with one tap.
	 *
	 * How it works. The decompiled Discord app (Wumpus-Central/discord-mobile-datamining, version 354) stores
	 * your status as four "proto settings" in `discord_app/modules/user_settings/UserSettings.tsx`:
	 *
	 *     StatusSetting            "online" | "idle" | "dnd" | "invisible"
	 *     StatusExpiresAtSetting   milliseconds as text, "0" = never
	 *     StatusCreatedAtSetting   milliseconds as text
	 *     CustomStatusSetting      { text, emojiId, emojiName, expiresAtMs, createdAtMs } or undefined
	 *
	 * The presets are shown in the plugin settings, under the status picker of your account sheet (You tab, tap
	 * your avatar) and on the "Set your status" screen (`modules/custom_status/native/EditCustomStatusWithPreview.tsx`).
	 *
	 * Discord's own screens call `.updateSetting(value)` on these (see `modules/custom_status/setCustomStatus.tsx`
	 * and `modules/multi_account/setUserStatus.tsx`). This plugin calls the very same functions, so the result
	 * is saved and synced exactly like a status picked by hand.
	 *
	 * The file reads top to bottom:  1 Settings  2 Presets  3 Reading and writing the status  4 Applying a preset
	 *                                5 The status sheet and the "Set your status" screen  6 Report and self-check
	 *                                7 Settings screen  8 The plugin
	 * Keep `(function` as the first thing in this file: Valenced loads it as `return <file>`.
	 */

	const VERSION = '1.1.0'
	const INSTANCE = {}

	// ---------------------------------------------------------------------------------------------------
	// Small helpers
	// ---------------------------------------------------------------------------------------------------
	const stores = () => valenced.discord.flux.Stores
	const parseJson = (text, fallback) => {
		try { const value = JSON.parse(text); return value === undefined || value === null ? fallback : value } catch (e) { return fallback }
	}
	const toast = (text) => {
		try { valenced.discord.actions.ToastActionCreators.open('MARKLONG_STATUS_PRESETS', { text: String(text) }) } catch (e) {}
	}
	const buzz = () => {
		try { if (setting('buzz')) valenced.react.ReactNative.Vibration.vibrate(15) } catch (e) {}
	}
	/** Builds a React element with the JSX runtime, so the file needs no build step. */
	function h(type, props, ...children) {
		const runtime = valenced.react.ReactJSXRuntime
		const { key, ...rest } = props || {}
		if (children.length === 1) rest.children = children[0]
		else if (children.length > 1) rest.children = children
		return (children.length > 1 ? runtime.jsxs : runtime.jsx)(type, rest, key)
	}

	// ---------------------------------------------------------------------------------------------------
	// 1. Settings
	// ---------------------------------------------------------------------------------------------------
	const STARTER_PRESETS = [
		{ id: 'starter-available', name: 'Available', emoji: '🟢', text: '', status: 'online', custom: 'clear', clearAfter: 'never' },
		{ id: 'starter-busy', name: 'Busy', emoji: '⛔', text: 'Busy, I will reply later', status: 'dnd', custom: 'set', clearAfter: '1h' },
		{ id: 'starter-away', name: 'Away', emoji: '🚶', text: 'Away for a bit', status: 'idle', custom: 'set', clearAfter: '30m' },
		{ id: 'starter-sleeping', name: 'Sleeping', emoji: '😴', text: 'Sleeping', status: 'dnd', custom: 'set', clearAfter: '8h' },
		{ id: 'starter-gaming', name: 'Gaming', emoji: '🎮', text: 'In a game', status: 'dnd', custom: 'set', clearAfter: '4h' },
		{ id: 'starter-invisible', name: 'Invisible', emoji: '', text: '', status: 'invisible', custom: 'keep', clearAfter: 'never' },
		{ id: 'starter-clear', name: 'Clear custom status', emoji: '🧹', text: '', status: 'keep', custom: 'clear', clearAfter: 'never' },
	]
	const defaults = {
		presetsJson: JSON.stringify(STARTER_PRESETS),
		undoJson: '',
		inSheet: true, // show the presets under the status picker of your account sheet
		inEditor: true, // show the presets on the "Set your status" screen
		buzz: true,
	}

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
	// 2. Presets
	// ---------------------------------------------------------------------------------------------------
	const STATUSES = [
		{ v: 'keep', l: 'Keep my status', color: '#80848e' },
		{ v: 'online', l: 'Online', color: '#23a55a' },
		{ v: 'idle', l: 'Idle', color: '#f0b232' },
		{ v: 'dnd', l: 'Do Not Disturb', color: '#f23f43' },
		{ v: 'invisible', l: 'Invisible', color: '#80848e' },
	]
	const CUSTOM_MODES = [
		{ v: 'keep', l: 'Leave it as it is' },
		{ v: 'set', l: 'Set a custom status' },
		{ v: 'clear', l: 'Remove my custom status' },
	]
	const CLEAR_AFTER = [
		{ v: 'never', l: "Don't clear", ms: 0 },
		{ v: '15m', l: '15 minutes', ms: 15 * 60000 },
		{ v: '30m', l: '30 minutes', ms: 30 * 60000 },
		{ v: '1h', l: '1 hour', ms: 60 * 60000 },
		{ v: '2h', l: '2 hours', ms: 2 * 60 * 60000 },
		{ v: '4h', l: '4 hours', ms: 4 * 60 * 60000 },
		{ v: '8h', l: '8 hours', ms: 8 * 60 * 60000 },
		{ v: 'midnight', l: 'Until midnight', ms: 0 },
	]
	const EMOJI_CHOICES = ['😴', '🎮', '🍽️', '🚗', '💼', '📚', '🏃', '🎧', '🏠', '🚫', '💬', '🔴', '🟢', '🌙', '☕', '✈️', '🤒', '🎉', '📵', '🧘']
	const MAX_TEXT = 128
	const MAX_NAME = 32

	const statusInfo = (value) => STATUSES.find((s) => s.v === value) || STATUSES[0]
	const oneOf = (value, list, fallback) => (list.some((o) => o.v === value) ? value : fallback)
	const newId = () => `p${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`

	/** Makes any saved object a safe preset (unknown values fall back to harmless ones). */
	function cleanPreset(raw) {
		const p = raw && typeof raw === 'object' ? raw : {}
		return {
			id: typeof p.id === 'string' && p.id ? p.id : newId(),
			name: String(p.name == null ? '' : p.name).slice(0, MAX_NAME),
			emoji: String(p.emoji == null ? '' : p.emoji).slice(0, 64),
			text: String(p.text == null ? '' : p.text).slice(0, MAX_TEXT),
			status: oneOf(p.status, STATUSES, 'keep'),
			custom: oneOf(p.custom, CUSTOM_MODES, 'keep'),
			clearAfter: oneOf(p.clearAfter, CLEAR_AFTER, 'never'),
		}
	}
	function readPresets() {
		const saved = parseJson(setting('presetsJson'), null)
		const list = Array.isArray(saved) ? saved : parseJson(defaults.presetsJson, [])
		const seen = new Set()
		return list.map(cleanPreset).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
	}
	const writePresets = (list) => saveSettings({ presetsJson: JSON.stringify(list.map(cleanPreset)) })

	/** An emoji can be typed as 😴 or pasted as <:name:123456789012345678> for a server emoji. */
	function parseEmoji(raw) {
		const text = String(raw == null ? '' : raw).trim()
		if (!text) return null
		const custom = text.match(/^<?a?:([A-Za-z0-9_]{2,32}):(\d{15,20})>?$/)
		if (custom) return { id: custom[2], name: custom[1], custom: true }
		return { id: null, name: Array.from(text).slice(0, 8).join(''), custom: false }
	}
	const emojiText = (raw) => { const e = parseEmoji(raw); return e ? (e.custom ? `:${e.name}:` : e.name) : '' }

	const clearLabel = (value) => (CLEAR_AFTER.find((o) => o.v === value) || CLEAR_AFTER[0]).l
	/** The end time as Discord stores it: milliseconds as text, "0" for never. */
	function expiryFor(clearAfter, now) {
		if (clearAfter === 'midnight') { const end = new Date(now); end.setHours(24, 0, 0, 0); return String(end.getTime()) }
		const option = CLEAR_AFTER.find((o) => o.v === clearAfter)
		return option && option.ms > 0 ? String(now + option.ms) : '0'
	}
	function timeLabel(ms) {
		const date = new Date(Number(ms))
		if (!Number.isFinite(date.getTime())) return ''
		const sameDay = date.toDateString() === new Date().toDateString()
		const time = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
		return sameDay ? time : `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${time}`
	}

	/** One line for a list row: "Do Not Disturb · “Sleeping” · 8 hours". */
	function summary(p) {
		const parts = []
		if (p.status !== 'keep') parts.push(statusInfo(p.status).l)
		if (p.custom === 'set') parts.push(p.text ? `“${p.text}”` : emojiText(p.emoji) ? 'emoji only' : 'empty custom status')
		else if (p.custom === 'clear') parts.push('removes custom status')
		if ((p.status !== 'keep' && p.status !== 'online') || p.custom === 'set') parts.push(p.clearAfter === 'never' ? 'no end time' : clearLabel(p.clearAfter))
		return parts.length ? parts.join(' · ') : 'Changes nothing'
	}
	const titleOf = (p) => `${emojiText(p.emoji) && !/^:/.test(emojiText(p.emoji)) ? `${emojiText(p.emoji)} ` : ''}${p.name || 'Untitled'}`

	// ---------------------------------------------------------------------------------------------------
	// 3. Reading and writing the status
	// ---------------------------------------------------------------------------------------------------
	const found = { settings: 'not found', sheet: 0, editor: 0 }
	let cachedSettings
	/** The four settings from `UserSettings.tsx`, found by their names (they may sit on `.default`). */
	function settingsModules() {
		if (cachedSettings) return cachedSettings
		try {
			const finders = valenced.modules.finders
			const mod = finders.lookupModule(finders.filters.withProps('CustomStatusSetting', 'StatusSetting'))[0]
			const root = mod && (mod.StatusSetting ? mod : mod.default)
			if (root && root.StatusSetting && root.CustomStatusSetting) {
				cachedSettings = {
					StatusSetting: root.StatusSetting,
					StatusExpiresAtSetting: root.StatusExpiresAtSetting,
					StatusCreatedAtSetting: root.StatusCreatedAtSetting,
					CustomStatusSetting: root.CustomStatusSetting,
				}
				found.settings = 'found'
			}
		} catch (e) {}
		return cachedSettings || null
	}
	const readSetting = (s) => { try { return s && typeof s.getSetting === 'function' ? s.getSetting() : undefined } catch (e) { return undefined } }

	/** Your status right now: { status, expires, custom: { text, emojiName, emojiId, expiresAtMs } | null }. */
	function readNow() {
		const s = settingsModules()
		let status = s && readSetting(s.StatusSetting)
		if (typeof status !== 'string' || !status) {
			try { status = stores().SelfPresenceStore.getStatus() } catch (e) { status = 'online' }
		}
		const expiresRaw = s && readSetting(s.StatusExpiresAtSetting)
		const expires = expiresRaw && expiresRaw !== '0' && Number(expiresRaw) > Date.now() ? String(expiresRaw) : '0'
		const raw = s && readSetting(s.CustomStatusSetting)
		let custom = null
		if (raw && typeof raw === 'object' && (raw.text || raw.emojiName)) {
			const end = raw.expiresAtMs && raw.expiresAtMs !== '0' ? Number(raw.expiresAtMs) : 0
			if (!end || end > Date.now()) {
				custom = { text: String(raw.text || ''), emojiName: String(raw.emojiName || ''), emojiId: raw.emojiId && raw.emojiId !== '0' ? String(raw.emojiId) : '', expiresAtMs: end ? String(end) : '0' }
			}
		}
		return { status, expires, custom }
	}
	const customLine = (custom) => (custom ? `${custom.emojiName && !custom.emojiId ? `${custom.emojiName} ` : custom.emojiId ? `:${custom.emojiName}: ` : ''}${custom.text}`.trim() || 'Emoji only' : '')

	/** Calls one setting's `updateSetting`. The save to Discord happens in the background, so it is not awaited. */
	function write(settingObject, value, label) {
		if (!settingObject || typeof settingObject.updateSetting !== 'function') throw new Error(`${label} cannot be changed here`)
		const result = settingObject.updateSetting(value)
		if (result && typeof result.catch === 'function') result.catch((error) => addLog(`${label}: Discord refused (${(error && error.message) || error})`, false))
	}

	// ---------------------------------------------------------------------------------------------------
	// 4. Applying a preset
	// ---------------------------------------------------------------------------------------------------
	const log = []
	function addLog(text, ok) {
		log.unshift({ at: Date.now(), text, ok })
		if (log.length > 10) log.length = 10
		redrawSettings()
	}
	const lastApplied = { id: '', at: 0 }

	function writeState({ status, expires, custom }, now) {
		const s = settingsModules()
		if (status && status !== 'keep') {
			write(s.StatusSetting, status, 'Status')
			write(s.StatusExpiresAtSetting, status === 'online' ? '0' : expires || '0', 'Status end time')
			write(s.StatusCreatedAtSetting, String(now), 'Status start time')
		}
		if (custom === null) write(s.CustomStatusSetting, undefined, 'Custom status')
		else if (custom) write(s.CustomStatusSetting, custom, 'Custom status')
	}

	/** The custom status object Discord expects, from a preset (or null when there is nothing to show). */
	function customFromPreset(p, expiry, now) {
		const emoji = parseEmoji(p.emoji)
		if (!p.text.trim() && !emoji) return null
		return {
			text: p.text.trim(),
			expiresAtMs: expiry,
			emojiId: emoji && emoji.id ? emoji.id : '0',
			emojiName: emoji ? emoji.name : '',
			createdAtMs: String(now),
		}
	}

	/** Checks a moment later that Discord's own settings now show what was asked for. */
	function verifyLater(p, before) {
		setTimeout(() => {
			try {
				const now = readNow()
				const problems = []
				if (p.status !== 'keep' && now.status !== p.status) problems.push(`status is ${now.status}`)
				if (p.custom === 'set' && customFromPreset(p, '0', 0) && !now.custom) problems.push('custom status is not set')
				if (p.custom === 'clear' && now.custom) problems.push('custom status is still there')
				addLog(problems.length ? `${p.name}: asked, but ${problems.join('; ')}` : `${p.name}: applied`, !problems.length)
				if (problems.length) toast(`${p.name}: Discord has not confirmed yet`)
			} catch (e) { addLog(`${p.name}: could not check (${e && e.message})`, false) }
		}, 1200)
	}

	/** Applies a preset. `remember` keeps your old status so "Undo" can bring it back. */
	function applyPreset(preset, remember = true) {
		const p = cleanPreset(preset)
		const label = p.name || 'Preset'
		try {
			if (!settingsModules()) { toast('Could not find Discord’s status settings'); addLog(`${label}: status settings not found`, false); return false }
			if (p.status === 'keep' && p.custom === 'keep') { toast(`${label} changes nothing`); return false }
			const now = Date.now()
			const before = readNow()
			const expiry = expiryFor(p.clearAfter, now)
			if (remember) saveSettings({ undoJson: JSON.stringify({ name: label, at: now, ...before }) })
			writeState({
				status: p.status,
				expires: expiry,
				custom: p.custom === 'set' ? customFromPreset(p, expiry, now) : p.custom === 'clear' ? null : undefined,
			}, now)
			lastApplied.id = p.id
			lastApplied.at = now
			buzz()
			toast(`${label} is on`)
			addLog(`${label}: sent to Discord`, true)
			verifyLater(p, before)
			return true
		} catch (error) {
			toast(`Could not apply ${label}`)
			addLog(`${label}: ${(error && error.message) || error}`, false)
			return false
		}
	}

	function readUndo() {
		const saved = parseJson(setting('undoJson'), null)
		return saved && typeof saved === 'object' && typeof saved.status === 'string' ? saved : null
	}
	/** Puts back the status and custom status you had before the last preset. */
	function undoLastPreset() {
		const saved = readUndo()
		if (!saved) { toast('Nothing to undo'); return false }
		try {
			const now = Date.now()
			const stillRunning = (ms) => !ms || ms === '0' || Number(ms) > now
			const custom = saved.custom && stillRunning(saved.custom.expiresAtMs)
				? { text: saved.custom.text || '', expiresAtMs: saved.custom.expiresAtMs || '0', emojiId: saved.custom.emojiId || '0', emojiName: saved.custom.emojiName || '', createdAtMs: String(now) }
				: null
			writeState({ status: saved.status, expires: stillRunning(saved.expires) ? saved.expires : '0', custom }, now)
			saveSettings({ undoJson: '' })
			buzz()
			toast('Back to how it was')
			addLog(`Undo ${saved.name || 'preset'}: sent to Discord`, true)
			return true
		} catch (error) {
			toast('Could not undo')
			addLog(`Undo: ${(error && error.message) || error}`, false)
			return false
		}
	}

	/** Makes a preset from your status right now. */
	function presetFromNow() {
		const now = readNow()
		const emoji = now.custom && now.custom.emojiName ? (now.custom.emojiId ? `<:${now.custom.emojiName}:${now.custom.emojiId}>` : now.custom.emojiName) : ''
		return cleanPreset({
			id: newId(),
			name: now.custom && now.custom.text ? now.custom.text.slice(0, 20) : statusInfo(now.status).l,
			emoji,
			text: now.custom ? now.custom.text : '',
			status: now.status,
			custom: now.custom ? 'set' : 'clear',
			clearAfter: 'never',
		})
	}

	function isActive(p, now) {
		if (p.status === 'keep' && p.custom === 'keep') return false
		if (p.status !== 'keep' && now.status !== p.status) return false
		if (p.custom === 'clear') return !now.custom
		if (p.custom === 'set') {
			const emoji = parseEmoji(p.emoji)
			return !!now.custom && now.custom.text === p.text.trim() && now.custom.emojiName === (emoji ? emoji.name : '')
		}
		return true
	}

	// ---------------------------------------------------------------------------------------------------
	// 5. The status sheet and the "Set your status" screen
	// ---------------------------------------------------------------------------------------------------
	function SheetPresets() {
		const Design = valenced.discord.design.Design
		const presets = readPresets()
		const now = readNow()
		if (!presets.length) return null
		return h(
			Design.TableRowGroup,
			{ title: 'Status presets' },
			presets.map((p) => h(Design.TableRow, {
				key: p.id,
				label: titleOf(p),
				subLabel: isActive(p, now) ? `Active · ${summary(p)}` : summary(p),
				onPress: () => {
					try { valenced.discord.actions.ActionSheetActionCreators.hideAllActionSheets() } catch (e) {}
					setTimeout(() => applyPreset(p), 0)
				},
			})),
		)
	}

	function closeScreen() {
		try {
			const finders = valenced.modules.finders
			const modals = (valenced.discord.actions && valenced.discord.actions.ModalActionCreators) || finders.lookupModule(finders.filters.withProps('pushLazy', 'popAll'))[0]
			const target = modals && (typeof modals.pop === 'function' ? modals : modals.default)
			if (target && typeof target.pop === 'function') target.pop()
		} catch (e) {}
	}

	/** The presets as a group of rows on the "Set your status" screen. Tapping one applies it and closes the screen. */
	function EditorPresets() {
		const Design = valenced.discord.design.Design
		const presets = readPresets()
		const now = readNow()
		return h(
			Design.TableRowGroup,
			{ title: 'Status presets' },
			...presets.map((p) => h(Design.TableRow, {
				key: p.id,
				label: titleOf(p),
				subLabel: isActive(p, now) ? `Active · ${summary(p)}` : summary(p),
				onPress: () => {
					if (applyPreset(p)) setTimeout(closeScreen, 0)
				},
			})),
			h(Design.TableRow, {
				key: 'save-current',
				label: '＋ Save my current status as a preset',
				onPress: () => {
					writePresets([...readPresets(), presetFromNow()])
					toast('Saved. Open Status Presets in the plugin settings to rename it.')
				},
			}),
		)
	}

	/**
	 * True for the "Set your status" screen: a column of [preview, status box, "Clear at" row group, optional
	 * "Delete status" group]. The "Clear at" group holds one row with an arrow and a trailing value.
	 */
	function isStatusEditor(element) {
		const kids = element && element.props && element.props.children
		if (!Array.isArray(kids) || kids.length < 3 || kids.length > 4) return false
		const status = kids[1] && kids[1].props && kids[1].props.children
		if (!Array.isArray(status) || status.length !== 2) return false
		const group = kids[2] && kids[2].props
		if (!group || group.hasIcons !== false) return false
		const row = Array.isArray(group.children) ? group.children[0] : group.children
		return !!(row && row.props && row.props.arrow === true && row.props.trailing)
	}

	/** True for the block with the four status rows (online, idle, dnd, invisible) found by their keys. */
	function isStatusPicker(element) {
		const kids = element && element.props && element.props.children
		if (!Array.isArray(kids) || kids.length !== 2) return false
		const group = kids[1]
		const rows = group && group.props && group.props.children
		if (!Array.isArray(rows)) return false
		const keys = rows.map((row) => row && row.key)
		return keys.includes('dnd') && keys.includes('online') && keys.includes('idle')
	}

	function hookStatusSheet(cleanup) {
		const finders = valenced.modules.finders
		const runtime = finders.lookupModule(finders.filters.withProps('jsx', 'jsxs'))[0] || valenced.react.ReactJSXRuntime
		const onNewElement = (element) => {
			try {
				if (globalThis.__statusPresetsInstance !== INSTANCE) return element // an older copy of the plugin is still loaded
				if (!element || !element.props || element.props.__presetsAdded) return element
				const React = valenced.react.React
				if (isStatusPicker(element)) {
					found.sheet += 1
					if (!setting('inSheet')) return element
					return React.cloneElement(element, { __presetsAdded: true }, [...element.props.children, h(SheetPresets, { key: 'status-presets' })])
				}
				if (isStatusEditor(element)) {
					found.editor += 1
					if (!setting('inEditor')) return element
					const kids = element.props.children
					return React.cloneElement(element, { __presetsAdded: true }, [...kids.slice(0, 3), h(EditorPresets, { key: 'status-presets' }), ...kids.slice(3)])
				}
				return element
			} catch (e) { return element }
		}
		;['jsx', 'jsxs'].forEach((name) => {
			if (runtime && typeof runtime[name] === 'function') cleanup(valenced.patcher.after(runtime, name, onNewElement))
		})
	}

	// ---------------------------------------------------------------------------------------------------
	// 6. Report and self-check
	// ---------------------------------------------------------------------------------------------------
	function nowLine() {
		const now = readNow()
		return `${statusInfo(now.status).l}${now.expires !== '0' ? ` until ${timeLabel(now.expires)}` : ''}${now.custom ? ` · “${customLine(now.custom)}”${now.custom.expiresAtMs !== '0' ? ` until ${timeLabel(now.custom.expiresAtMs)}` : ''}` : ' · no custom status'}`
	}
	function buildReport() {
		const presets = readPresets()
		return [
			'Status Presets report',
			`version: ${VERSION}`,
			`presets: ${presets.length} (${presets.map((p) => p.name).join(', ') || '-'})`,
			`status settings: ${found.settings}`,
			`account sheet seen: ${found.sheet} time(s); presets there: ${setting('inSheet') ? 'on' : 'off'}`,
			`"Set your status" screen seen: ${found.editor} time(s); presets there: ${setting('inEditor') ? 'on' : 'off'}`,
			`my status now: ${nowLine()}`,
			`undo saved: ${readUndo() ? readUndo().name : 'no'}`,
			'last actions:',
			...(log.length ? log.map((l) => `  ${l.ok ? 'ok' : 'FAIL'} ${new Date(l.at).toLocaleTimeString()} ${l.text}`) : ['  none yet']),
		].join('\n')
	}
	function copyReport() {
		try {
			valenced.externals.ReactNativeClipboard.Clipboard.setString(buildReport())
			toast('Report copied. Paste it in the chat.')
		} catch (e) { toast('Could not copy') }
	}

	/** Checks the pieces. The round trip re-sends your own current status, so nothing visible changes. */
	function runSelfCheck(done) {
		const results = []
		const add = (ok, label, detail) => results.push({ ok, label, detail })
		const s = settingsModules()
		add(!!s, 'Found Discord’s status settings', s ? 'UserSettings: StatusSetting, StatusExpiresAtSetting, StatusCreatedAtSetting, CustomStatusSetting' : 'Without them nothing can be applied')
		if (s) {
			;['StatusSetting', 'StatusExpiresAtSetting', 'StatusCreatedAtSetting', 'CustomStatusSetting'].forEach((name) => {
				add(typeof s[name].updateSetting === 'function' && typeof s[name].getSetting === 'function', `${name} can be read and written`, '')
			})
		}
		const now = readNow()
		let presence
		try { presence = stores().SelfPresenceStore.getStatus() } catch (e) {}
		add(!presence || presence === now.status, 'Both ways of reading your status agree', `settings: ${now.status}; presence store: ${presence || 'not found'}`)
		add(found.sheet > 0, 'Account sheet found', found.sheet > 0 ? `seen ${found.sheet} time(s)` : 'Open your account sheet (You tab, tap your avatar) once, then run this again')
		add(found.editor > 0, '"Set your status" screen found', found.editor > 0 ? `seen ${found.editor} time(s)` : 'Open it once (tap your custom status), then run this again')
		const presets = readPresets()
		add(presets.length > 0, 'Presets saved', `${presets.length} preset(s)`)
		if (!s) return done(results)
		try {
			write(s.StatusSetting, now.status, 'Status')
			setTimeout(() => {
				const after = readNow()
				add(after.status === now.status, 'Round trip: Discord keeps what was written', `wrote ${now.status}, read back ${after.status}`)
				done(results)
			}, 600)
		} catch (error) {
			add(false, 'Round trip: Discord keeps what was written', (error && error.message) || String(error))
			done(results)
		}
	}

	// ---------------------------------------------------------------------------------------------------
	// 7. Settings screen
	// ---------------------------------------------------------------------------------------------------
	function Card({ children }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { borderRadius: 14, padding: 14, gap: 10, backgroundColor: '#2b2d31' } }, children)
	}
	function Dot({ color, size = 12 }) {
		const { View } = valenced.react.ReactNative
		return h(View, { style: { width: size, height: size, borderRadius: size / 2, backgroundColor: color } })
	}
	function Pill({ text, color }) {
		const { View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(View, { style: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: `${color}33` } }, h(Text, { variant: 'text-xs/bold', style: { color } }, text))
	}
	function Chip({ text, selected, onPress }) {
		const { Pressable, View } = valenced.react.ReactNative
		const { Text } = valenced.discord.design.Design
		return h(
			Pressable,
			{ onPress, accessibilityRole: 'button' },
			h(View, { style: { minWidth: 44, minHeight: 38, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: selected ? '#5865f2' : '#383a40' } },
				h(Text, { variant: 'text-md/semibold', style: { color: '#fff' } }, text)),
		)
	}
	/** A text box that keeps what you type while the screen redraws. */
	function Field({ label, description, value, placeholder, maxLength, onChange }) {
		const { React } = valenced.react
		const { TextInput } = valenced.discord.design.Design
		const [text, setText] = React.useState(value == null ? '' : String(value))
		React.useEffect(() => { if ((value == null ? '' : String(value)) !== text) setText(value == null ? '' : String(value)) }, [value])
		return h(TextInput, { label, description, placeholder, size: 'md', maxLength, value: text, onChange: (next) => { setText(next); onChange(next) } })
	}
	function Radio({ title, value, items, onChange }) {
		const Design = valenced.discord.design.Design
		return h(Design.TableRadioGroup, { title, value, onChange }, items.map((item) => h(Design.TableRadioRow, { key: String(item.v), label: item.l, value: item.v })))
	}

	/** The card at the top: your status right now, with a live update. */
	function NowCard({ onSaveCurrent }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [, setTick] = React.useState(0)
		React.useEffect(() => {
			const timer = setInterval(() => setTick((n) => n + 1), 2000)
			return () => clearInterval(timer)
		}, [])
		const now = readNow()
		const undo = readUndo()
		const info = statusInfo(now.status)
		return h(
			Card,
			null,
			h(Design.Text, { variant: 'text-xs/bold', color: 'text-muted' }, 'RIGHT NOW'),
			h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
				h(Dot, { color: info.color }),
				h(Design.Text, { variant: 'heading-lg/bold' }, info.l)),
			now.expires !== '0' && h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, `Ends ${timeLabel(now.expires)}`),
			h(Design.Text, { variant: 'text-md/medium' }, now.custom ? `“${customLine(now.custom)}”${now.custom.expiresAtMs !== '0' ? ` · until ${timeLabel(now.custom.expiresAtMs)}` : ''}` : 'No custom status'),
			h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
				h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Save as preset', variant: 'secondary', size: 'sm', onPress: onSaveCurrent })),
				h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: undo ? `Undo “${String(undo.name).slice(0, 14)}”` : 'Nothing to undo', variant: 'secondary', size: 'sm', disabled: !undo, onPress: undoLastPreset }))),
		)
	}

	function PresetList({ onEdit, onAdd }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const [editing, setEditing] = React.useState(false)
		const [sure, setSure] = React.useState(false)
		const presets = readPresets()
		const now = readNow()
		return h(
			RN.View,
			{ style: { gap: 12 } },
			h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' } },
				h(Design.Text, { variant: 'text-sm/semibold', color: 'text-muted' }, 'PRESETS'),
				h(RN.View, { style: { flexDirection: 'row', gap: 8 } },
					h(Chip, { text: 'Tap to apply', selected: !editing, onPress: () => setEditing(false) }),
					h(Chip, { text: 'Tap to edit', selected: editing, onPress: () => setEditing(true) }))),
			h(
				Design.TableRowGroup,
				{ title: '' },
				...(presets.length
					? presets.map((p) => h(Design.TableRow, {
						key: p.id,
						label: titleOf(p),
						subLabel: `${isActive(p, now) ? 'Active · ' : ''}${summary(p)}`,
						onPress: () => (editing ? onEdit(p.id) : applyPreset(p)),
					}))
					: [h(Design.TableRow, { key: 'none', label: 'No presets yet', subLabel: 'Add one below, or save your current status as a preset.' })]),
				h(Design.TableRow, { key: 'add', label: '＋ New preset', onPress: onAdd }),
			),
			h(Design.TableRow, {
				key: 'reset',
				label: sure ? 'Tap again to replace all presets with the starter ones' : 'Reset to starter presets',
				variant: 'danger',
				onPress: () => {
					if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return }
					setSure(false)
					writePresets(parseJson(defaults.presetsJson, []))
					toast('Starter presets are back')
				},
			}),
		)
	}

	/** Edit one preset. `draft` is a copy, nothing is saved until Save. */
	function EditPreset({ id, onBack }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		const existing = readPresets().find((p) => p.id === id)
		const [draft, setDraft] = React.useState(() => existing || cleanPreset({ id, name: '', status: 'online', custom: 'set', clearAfter: 'never' }))
		const [sure, setSure] = React.useState(false)
		const set = (key) => (value) => setDraft((d) => ({ ...d, [key]: value }))
		const isNew = !existing
		const info = statusInfo(draft.status)

		const save = (andBack = true) => {
			const next = cleanPreset({ ...draft, name: draft.name.trim() || (draft.text.trim().slice(0, 20)) || info.l })
			const list = readPresets()
			writePresets(list.some((p) => p.id === next.id) ? list.map((p) => (p.id === next.id ? next : p)) : [...list, next])
			toast(`Saved ${next.name}`)
			if (andBack) onBack()
		}
		const move = (delta) => {
			const list = readPresets()
			const index = list.findIndex((p) => p.id === draft.id)
			const target = index + delta
			if (index < 0 || target < 0 || target >= list.length) return
			const copy = list.slice()
			;[copy[index], copy[target]] = [copy[target], copy[index]]
			writePresets(copy)
		}
		const copyOf = () => {
			const copy = cleanPreset({ ...draft, id: newId(), name: `${draft.name || 'Preset'} copy`.slice(0, MAX_NAME) })
			writePresets([...readPresets(), copy])
			toast('Duplicated')
			onBack()
		}
		const remove = () => {
			if (!sure) { setSure(true); setTimeout(() => setSure(false), 4000); return }
			writePresets(readPresets().filter((p) => p.id !== draft.id))
			toast('Deleted')
			onBack()
		}
		const previewText = draft.custom === 'set' ? (draft.text || (emojiText(draft.emoji) ? '' : 'Your text')) : draft.custom === 'clear' ? 'Custom status removed' : 'Custom status stays as it is'

		return h(
			RN.View,
			{ style: { gap: 18 } },
			h(Design.TableRow, { key: 'back', label: '‹ All presets', onPress: onBack }),
			h(
				Card,
				null,
				h(Design.Text, { variant: 'text-xs/bold', color: 'text-muted' }, isNew ? 'NEW PRESET' : 'PREVIEW'),
				h(RN.View, { style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
					h(Dot, { color: info.color }),
					h(Design.Text, { variant: 'heading-lg/bold' }, `${draft.name || 'Untitled'}`)),
				h(Design.Text, { variant: 'text-md/medium' }, `${info.v === 'keep' ? 'Status stays as it is' : info.l}${draft.status !== 'keep' && draft.status !== 'online' && draft.clearAfter !== 'never' ? ` for ${clearLabel(draft.clearAfter).toLowerCase()}` : ''}`),
				h(Design.Text, { variant: 'text-md/medium', color: 'text-muted' }, `${draft.custom === 'set' && emojiText(draft.emoji) ? `${emojiText(draft.emoji)} ` : ''}${previewText}`),
			),
			h(Field, { key: 'name', label: 'Name', placeholder: 'Busy', maxLength: MAX_NAME, value: draft.name, onChange: set('name') }),
			h(Radio, { title: 'Online status', value: draft.status, items: STATUSES, onChange: set('status') }),
			h(Radio, { title: 'Custom status', value: draft.custom, items: CUSTOM_MODES, onChange: set('custom') }),
			draft.custom === 'set' && h(
				RN.View,
				{ key: 'customFields', style: { gap: 12 } },
				h(Field, { key: 'text', label: 'Text', placeholder: 'What are you up to?', maxLength: MAX_TEXT, value: draft.text, onChange: set('text') }),
				h(Field, { key: 'emoji', label: 'Emoji', description: 'Type or paste an emoji, or a server emoji like <:name:123456789012345678>. Leave empty for none.', placeholder: '😴', maxLength: 64, value: draft.emoji, onChange: set('emoji') }),
				h(RN.View, { style: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } },
					h(Chip, { key: 'none', text: 'No emoji', selected: !draft.emoji, onPress: () => set('emoji')('') }),
					...EMOJI_CHOICES.map((emoji) => h(Chip, { key: emoji, text: emoji, selected: draft.emoji === emoji, onPress: () => set('emoji')(emoji) }))),
			),
			(draft.custom === 'set' || draft.status === 'dnd' || draft.status === 'idle' || draft.status === 'invisible') && h(Radio, { title: 'Switch back after', value: draft.clearAfter, items: CLEAR_AFTER, onChange: set('clearAfter') }),
			h(
				RN.View,
				{ style: { gap: 10 } },
				h(Design.Button, { text: 'Save', variant: 'primary', onPress: () => save(true) }),
				h(Design.Button, { text: 'Apply now (without saving)', variant: 'secondary', onPress: () => applyPreset({ ...draft, name: draft.name || 'Preset' }) }),
				!isNew && h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↑ Move up', variant: 'secondary', size: 'sm', onPress: () => move(-1) })),
					h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: '↓ Move down', variant: 'secondary', size: 'sm', onPress: () => move(1) }))),
				!isNew && h(Design.Button, { text: 'Duplicate', variant: 'secondary', size: 'sm', onPress: copyOf }),
				!isNew && h(Design.Button, { text: sure ? 'Tap again to delete' : 'Delete', variant: 'destructive', size: 'sm', onPress: remove }),
			),
		)
	}

	function SettingsScreen({ api }) {
		const { React, ReactNative: RN } = valenced.react
		const Design = valenced.discord.design.Design
		storage = api.jsonStorage
		storage.use()

		const [, setRedraws] = React.useState(0)
		const [view, setView] = React.useState({ name: 'list' })
		const [checks, setChecks] = React.useState(null)
		React.useEffect(() => {
			const redraw = () => setRedraws((n) => n + 1)
			screenListeners.push(redraw)
			return () => { screenListeners = screenListeners.filter((l) => l !== redraw) }
		}, [])

		const addFromNow = () => {
			const preset = presetFromNow()
			writePresets([...readPresets(), preset])
			toast('Saved. Tap “edit” to rename it.')
			setView({ name: 'edit', id: preset.id })
		}

		return h(
			RN.ScrollView,
			{ style: { flex: 1 }, contentContainerStyle: { paddingBottom: 38 }, keyboardShouldPersistTaps: 'handled' },
			h(
				Design.Stack,
				{ style: { paddingVertical: 20, paddingHorizontal: 12 }, spacing: 22 },
				view.name === 'edit'
					? h(EditPreset, { key: view.id, id: view.id, onBack: () => setView({ name: 'list' }) })
					: [
						h(NowCard, { key: 'now', onSaveCurrent: addFromNow }),
						h(PresetList, { key: 'list', onEdit: (id) => setView({ name: 'edit', id }), onAdd: () => setView({ name: 'edit', id: newId() }) }),
						h(
							Design.TableRowGroup,
							{ key: 'options', title: 'Options' },
							h(Design.TableSwitchRow, { key: 'inSheet', label: 'Show presets in my account sheet', subLabel: 'Under the status picker (You tab, tap your avatar)', value: !!setting('inSheet'), onValueChange: (value) => saveSettings({ inSheet: !!value }) }),
							h(Design.TableSwitchRow, { key: 'inEditor', label: 'Show presets on the “Set your status” screen', subLabel: 'Between “Clear at” and “Delete status”. Tapping one applies it and closes the screen.', value: !!setting('inEditor'), onValueChange: (value) => saveSettings({ inEditor: !!value }) }),
							h(Design.TableSwitchRow, { key: 'buzz', label: 'Vibrate when a preset is applied', value: !!setting('buzz'), onValueChange: (value) => saveSettings({ buzz: !!value }) }),
						),
						h(
							Card,
							{ key: 'debug' },
							h(Design.Text, { variant: 'text-xs/bold', color: 'text-muted' }, `STATUS PRESETS ${VERSION}`),
							h(Design.Text, { variant: 'text-sm/medium', color: 'text-muted' }, 'Something not working? Run the self-check, then copy the report and send it.'),
							h(RN.View, { style: { flexDirection: 'row', gap: 10 } },
								h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Run the self-check', variant: 'primary', size: 'sm', onPress: () => { setChecks(null); runSelfCheck((results) => setChecks(results.slice())) } })),
								h(RN.View, { style: { flex: 1 } }, h(Design.Button, { text: 'Copy report', variant: 'secondary', size: 'sm', onPress: copyReport }))),
						),
						checks && h(
							Design.TableRowGroup,
							{ key: 'checks', title: 'Self-check' },
							...checks.map((r, i) => h(Design.TableRow, { key: `check${i}`, label: `${r.ok ? '✓' : '✗'} ${r.label}`, subLabel: r.detail || undefined })),
							h(Design.TableRow, { key: 'checkNote', label: 'About the round trip', subLabel: 'It writes your current status back to Discord and reads it again. Nothing visible changes.' }),
						),
						log.length > 0 && h(
							Design.TableRowGroup,
							{ key: 'log', title: 'Last actions' },
							...log.slice(0, 6).map((l, i) => h(Design.TableRow, { key: `log${i}`, label: `${l.ok ? '✓' : '✗'} ${l.text}`, subLabel: new Date(l.at).toLocaleTimeString() })),
						),
					],
			),
		)
	}

	// ---------------------------------------------------------------------------------------------------
	// 8. The plugin
	// ---------------------------------------------------------------------------------------------------
	Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' })
	exports.default = plugin({
		jsonStorage: { load: true, default: defaults },
		SettingsComponent: SettingsScreen,
		start(api) {
			storage = api.jsonStorage
			globalThis.__statusPresetsInstance = INSTANCE
			try { settingsModules() } catch (e) {}
			try { hookStatusSheet(api.cleanup) } catch (e) { addLog(`sheet hook: ${e && e.message}`, false) }
			api.cleanup(() => {
				screenListeners = []
				cachedSettings = undefined
				if (globalThis.__statusPresetsInstance === INSTANCE) globalThis.__statusPresetsInstance = undefined
			})
		},
	})
	return exports
})({})
