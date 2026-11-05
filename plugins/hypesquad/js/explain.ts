import type { RequestError } from './types'

/**
 * Turns a failed request into a sentence for a toast.
 *
 * In order: a timeout, a captcha demand (which a plugin cannot solve), rate limiting (429), Discord's own message
 * with the status, a bare status, and finally the error's message or a general sentence.
 */
export function explain(error: RequestError | null | undefined): string {
	if (error?.timedOut) return 'Discord took too long to answer. Try again.'

	const status =
		error && (error.status != null ? error.status : error.response?.status)
	let body = error?.body
	if (typeof body === 'string') {
		try {
			body = JSON.parse(body)
		} catch {
			body = undefined
		}
	}
	const answer = body as
		| { message?: string; captcha_key?: unknown }
		| undefined
		| null

	if (answer?.captcha_key)
		return 'Discord wants a captcha for this change, which a plugin cannot do. Try again later.'
	if (status === 429) return 'Discord says slow down. Try again in a minute.'
	if (answer?.message) return answer.message + (status ? ` (${status})` : '')
	if (status) return `Discord said no (${status}).`
	return error?.message || 'Could not change your HypeSquad. Try again.'
}
