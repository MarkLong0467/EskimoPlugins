import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { TIMEOUT_MS } from './constants'
import type { DiscordHttp } from './types'

/**
 * Discord's own server connection: the module with `HTTPResponseError`, found the way Valenced's Quoter finds it. It adds
 * the right headers by itself, so the plugin never touches your login token.
 */
export function discordHttp(): DiscordHttp | undefined {
	try {
		return (
			(lookupModule(withProps('HTTPResponseError', 'get'))[0] as
				| DiscordHttp
				| undefined) ||
			(lookupModule(withProps('get', 'post', 'del', 'patch'))[0] as
				| DiscordHttp
				| undefined)
		)
	} catch {
		return undefined
	}
}

/** Rejects if the promise takes longer than `TIMEOUT_MS`. */
export function withTimeout<T>(promise: PromiseLike<T> | T): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(() => reject(new Error('Timed out')), TIMEOUT_MS)
		Promise.resolve(promise).then(
			value => {
				clearTimeout(timer)
				resolve(value)
			},
			error => {
				clearTimeout(timer)
				reject(error)
			},
		)
	})
}

/** A short text for an error that Discord answered with, or a plain one. */
export function describeError(error: unknown): string {
	const e = error as
		| {
				status?: number
				message?: string
				body?: { message?: string; code?: number }
		  }
		| undefined
	const status = e?.status ? `HTTP ${e.status}` : ''
	const message = e?.body?.message || e?.message || ''
	return [status, message].filter(Boolean).join(': ') || String(error)
}
