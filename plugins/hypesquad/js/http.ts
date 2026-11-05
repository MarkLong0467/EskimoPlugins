import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { TIMEOUT_MS } from './constants'
import type { DiscordHttp, RequestError } from './types'

/** Discord's own server connection: the module with `HTTPResponseError`, found the way Valenced's Quoter finds it. */
function discordHttp(): DiscordHttp | undefined {
	return (
		(lookupModule(withProps('HTTPResponseError', 'get'))[0] as
			| DiscordHttp
			| undefined) ||
		(lookupModule(withProps('get', 'post', 'del', 'patch'))[0] as
			| DiscordHttp
			| undefined)
	)
}

/** Rejects with `{ timedOut: true }` if the promise takes longer than `TIMEOUT_MS`. */
function withTimeout<T>(promise: PromiseLike<T> | T): Promise<T> {
	return new Promise((resolve, reject) => {
		const timer = setTimeout(
			() => reject({ timedOut: true } satisfies RequestError),
			TIMEOUT_MS,
		)
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

/** Whether an error came from Discord answering (it has a status or a body), as opposed to the call itself breaking. */
function isAnswer(error: RequestError | undefined | null): boolean {
	return (
		!!error &&
		(error.status != null ||
			error.body != null ||
			(error.response != null && error.response.status != null))
	)
}

/**
 * Sends a request to Discord's API.
 *
 * It goes through Discord's own connection when that can be found, which adds the right headers by itself. If the
 * connection is missing, or breaks without Discord having answered, the request is sent straight to the API with the
 * account's token instead.
 *
 * @param method `POST` to join a house, `DELETE` to leave.
 * @param path The API path, for example `/hypesquad/online`.
 * @param body The JSON body, if the call has one.
 * @throws `{ timedOut: true }` when it takes too long, `{ status, body }` when Discord answers with an error, or
 * `{ message }` when there is no way to reach Discord at all.
 */
export async function request(
	method: 'POST' | 'DELETE',
	path: string,
	body?: object,
): Promise<unknown> {
	const http = discordHttp()
	const call =
		method === 'DELETE' ? http && (http.del || http.delete) : http?.post

	if (call) {
		try {
			return await withTimeout(
				call.call(http, body ? { url: path, body } : { url: path }),
			)
		} catch (error) {
			if (
				isAnswer(error as RequestError) ||
				(error as RequestError | undefined)?.timedOut
			)
				throw error
			// The connection itself broke: fall through to the direct request.
		}
	}

	const auth = lookupModule(withProps('getToken'))[0] as
		| { getToken?(): string }
		| undefined
	const token = auth?.getToken?.()
	if (!token)
		throw {
			message: 'Could not find a way to reach Discord.',
		} satisfies RequestError

	const response = await withTimeout(
		fetch(`https://discord.com/api/v9${path}`, {
			method,
			headers: { Authorization: token, 'Content-Type': 'application/json' },
			body: body ? JSON.stringify(body) : undefined,
		}),
	)
	if (!response.ok) {
		let parsed: unknown = {}
		try {
			parsed = await response.json()
		} catch {
			// The error answer had no JSON body.
		}
		throw { status: response.status, body: parsed } satisfies RequestError
	}
	return response
}
