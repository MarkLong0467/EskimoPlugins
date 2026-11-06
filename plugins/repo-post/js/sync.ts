import { AppState } from 'react-native'
import { saveSettings, setting, subscribe } from './config'
import {
	BACKOFF_MS,
	CHECK_MS,
	FIRST_CHECK_MS,
	LIMIT_NITRO,
	LIMIT_NORMAL,
	NITRO_PREMIUM_TYPE,
	RECHECK_MS,
} from './constants'
import { diag } from './diag'
import { currentUser, toast } from './discord'
import { describeError, discordHttp, withTimeout } from './http'
import { cleanPostData, fingerprint, isPostData, render } from './post'
import type { ApiMessage, PostData, Rendered, SyncResult } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** Whether an update is being made right now, so two never run at once. */
let busy = false

/** What the last sync did, for the settings screen. */
let last: SyncResult | null = null

/** The list as it was last fetched, for the settings screen and the report. */
let lastData: PostData | null = null

/** What the last render made, for the report. */
let lastRendered: Rendered | null = null

/** Until when the plugin waits after a failure before trying on its own again. */
let nextTryAt = 0

/** Who wants to know when something changes. */
const listeners = new Set<() => void>()

/** Calls `fn` whenever a sync finishes. Returns what stops it. */
export function onResult(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}

function changed(): void {
	for (const fn of [...listeners]) {
		try {
			fn()
		} catch {
			// A screen that is gone must not stop the others.
		}
	}
}

/** What the last sync did. */
export const lastResult = (): SyncResult | null => last

/** The list as it was last fetched. */
export const lastList = (): PostData | null => lastData

/** What the last render made. */
export const lastRender = (): Rendered | null => lastRendered

/** Whether an update is running. */
export const isBusy = (): boolean => busy

/** How many characters the post may have: the choice in the settings, or Discord's limit for your account. */
export function limitNow(): number {
	const choice = setting('limit')
	if (choice === '4000') return LIMIT_NITRO
	if (choice === '2000') return LIMIT_NORMAL
	return currentUser()?.premiumType === NITRO_PREMIUM_TYPE
		? LIMIT_NITRO
		: LIMIT_NORMAL
}

/** The part of Discord's ids (a snowflake) this plugin accepts. */
const SNOWFLAKE = /^\d{15,25}$/

/** What still has to be set before the post can be edited (as a phrase), or nothing if it is all set. */
export function missingSetup(): string | null {
	if (!String(setting('postUrl') || '').trim())
		return 'the address of your list'
	if (!SNOWFLAKE.test(String(setting('channelId') || '')))
		return 'the thread id'
	if (!SNOWFLAKE.test(String(setting('messageId') || '')))
		return 'the message id'
	return null
}

/** Fetches `post.json`. The address gets the minute on it, so a cached copy is not used for long. */
export async function loadPost(): Promise<PostData> {
	const base = String(setting('postUrl') || '').trim()
	if (!base) throw new Error('No address for the list')
	const url = `${base}${base.includes('?') ? '&' : '?'}t=${Math.floor(Date.now() / 60_000)}`
	const response = await withTimeout(fetch(url))
	if (!response.ok) throw new Error(`The list answered HTTP ${response.status}`)
	const data: unknown = await response.json()
	if (!isPostData(data)) throw new Error('The list is not in the expected form')
	lastData = cleanPostData(data)
	return lastData
}

/** Makes the text of the post from a list, with the settings as they are now. */
export function renderNow(data: PostData): Rendered {
	lastRendered = render(data, {
		versions: !!setting('versions'),
		limit: limitNow(),
	})
	return lastRendered
}

/** A fingerprint of what the post should be, including which message it is for. */
function wantedHash(text: string): string {
	return fingerprint(`${setting('channelId')}/${setting('messageId')}\n${text}`)
}

/** The message the settings point to, read through Discord's own connection. */
async function readMessage(): Promise<ApiMessage | undefined> {
	const http = discordHttp()
	if (!http?.get) throw new Error('Could not find Discord’s server connection')
	const channel = String(setting('channelId'))
	const message = String(setting('messageId'))
	const answer = await withTimeout(
		http.get({
			url: `/channels/${channel}/messages?around=${message}&limit=5`,
		}),
	)
	const list = answer?.body
	return Array.isArray(list)
		? (list as ApiMessage[]).find(m => m.id === message)
		: undefined
}

/** Replaces the text of the message. */
async function editMessage(content: string): Promise<void> {
	const http = discordHttp()
	if (!http?.patch)
		throw new Error('Could not find Discord’s server connection')
	await withTimeout(
		http.patch({
			url: `/channels/${setting('channelId')}/messages/${setting('messageId')}`,
			body: { content },
		}),
	)
}

/** Notes a result, shows it to the screens, and starts the wait after a failure. */
function finish(result: SyncResult): SyncResult {
	last = result
	if (result.status === 'error') nextTryAt = Date.now() + BACKOFF_MS
	diag.log(
		'sync',
		`${result.status}: ${result.detail}`,
		result.status === 'error' ? 'error' : 'info',
	)
	changed()
	return result
}

/**
 * Makes the post match the list: fetches the list, makes the text, reads the post and edits it if it differs.
 *
 * The post is only edited if it is yours, so a wrong message id can never change somebody else's message (Discord would
 * refuse anyway).
 */
export async function sync(): Promise<SyncResult> {
	if (busy)
		return { status: 'error', detail: 'Already updating', at: Date.now() }
	const missing = missingSetup()
	if (missing)
		return finish({
			status: 'error',
			detail: `Set ${missing} first`,
			at: Date.now(),
		})
	busy = true
	changed()
	try {
		const data = await loadPost()
		const rendered = renderNow(data)
		if (!rendered.fits)
			return finish({
				status: 'error',
				detail: `The list is too long for ${rendered.limit} characters even without descriptions`,
				at: Date.now(),
			})
		const message = await readMessage()
		if (!message)
			return finish({
				status: 'error',
				detail: 'Could not find the post. Check the thread and message ids',
				at: Date.now(),
			})
		const me = currentUser()?.id
		if (!me || message.author?.id !== me)
			return finish({
				status: 'error',
				detail:
					'That post was not written by this account, so it is left alone',
				at: Date.now(),
			})
		const hash = wantedHash(rendered.text)
		if ((message.content ?? '').trim() === rendered.text.trim()) {
			saveSettings({ syncedHash: hash, syncedAt: Date.now() })
			return finish({
				status: 'same',
				detail: `The post already matches (${data.plugins.length} plugins)`,
				at: Date.now(),
			})
		}
		const before = message.content ?? ''
		await editMessage(rendered.text)
		saveSettings({
			syncedHash: hash,
			syncedAt: Date.now(),
			previousText: before,
		})
		toast(`Repo post updated (${data.plugins.length} plugins)`)
		return finish({
			status: 'updated',
			detail: `Post edited: ${data.plugins.length} plugins, ${rendered.text.length} of ${rendered.limit} characters${rendered.level === 'full' ? '' : `, descriptions ${rendered.level}`}`,
			at: Date.now(),
		})
	} catch (error) {
		return finish({
			status: 'error',
			detail: describeError(error),
			at: Date.now(),
		})
	} finally {
		busy = false
		changed()
	}
}

/**
 * Puts back what the post said before the last change. Automatic updates are turned off, or the next one would undo it.
 */
export async function restorePrevious(): Promise<SyncResult> {
	const before = String(setting('previousText') || '')
	if (!before)
		return { status: 'error', detail: 'Nothing to restore', at: Date.now() }
	if (busy)
		return { status: 'error', detail: 'Already updating', at: Date.now() }
	busy = true
	changed()
	try {
		await editMessage(before)
		saveSettings({ auto: false, syncedHash: '', previousText: '' })
		toast('Previous text restored. Automatic updates are off')
		return finish({
			status: 'updated',
			detail:
				'The previous text was put back and automatic updates were turned off',
			at: Date.now(),
		})
	} catch (error) {
		return finish({
			status: 'error',
			detail: describeError(error),
			at: Date.now(),
		})
	} finally {
		busy = false
		changed()
	}
}

/**
 * One look: if automatic updates are on and the post is not known to match the list, update it.
 *
 * The list is a small file, so it is fetched each time. Discord is only asked when the text changed, or after
 * `RECHECK_MS` in case the post was edited by hand.
 */
export async function look(): Promise<void> {
	if (!setting('auto') || missingSetup() || busy || Date.now() < nextTryAt)
		return
	try {
		const data = await loadPost()
		const rendered = renderNow(data)
		const fresh =
			wantedHash(rendered.text) === setting('syncedHash') &&
			Date.now() - Number(setting('syncedAt')) < RECHECK_MS
		if (fresh) return
		await sync()
	} catch (error) {
		// The list could not be fetched (no network, say): try again at the next look.
		diag.log('look', describeError(error), 'warn')
	}
}

/**
 * Starts looking now and then: soon after Discord opens, every few minutes, every time the app comes to the front, and
 * when a setting is saved.
 */
export function startSync(cleanup: Cleanup): void {
	const run = () => {
		look().catch(error => diag.fail('look', error))
	}
	const interval = setInterval(run, CHECK_MS)
	const first = setTimeout(run, FIRST_CHECK_MS)
	const subscription = AppState.addEventListener('change', state => {
		if (state === 'active') run()
	})
	// Saving is asynchronous, so the look waits a moment for the new setting to be there. What an update itself saves
	// (when it matched the post) does not need another look.
	let pending: ReturnType<typeof setTimeout> | undefined
	const stopSettings = subscribe(() => {
		if (busy) return
		nextTryAt = 0
		clearTimeout(pending)
		pending = setTimeout(run, 500)
	})
	cleanup(() => {
		clearInterval(interval)
		clearTimeout(first)
		clearTimeout(pending)
		subscription?.remove?.()
		stopSettings()
		listeners.clear()
		busy = false
		last = null
		lastData = null
		lastRendered = null
		nextTryAt = 0
	})
}
