/**
 * Turns settings into text that is safe to paste in a chat: secrets are hidden, long values are cut short and links lose
 * their login and query part.
 */

/** Names of settings that hold something private. */
const SECRET_KEY =
	/token|secret|pass(word|code|key)?\b|passkey|api[-_ ]?key|apikey|auth|cookie|session|bearer|webhook|hash|credential|username|user[-_ ]?name|\buser\b|\bsk\b/i

/** The most characters of one value. */
const MAX_VALUE = 160

/** The most characters of the whole report section. */
const MAX_TOTAL = 4000

/** How deep objects are shown. */
const MAX_DEPTH = 5

/** A link without its login and its query. */
function cleanUrl(value: string): string {
	return value
		.replace(/^(https?:\/\/)[^/@\s]*@/i, '$1')
		.replace(/\?[^\s#]*/, '?…')
}

/** Copies a value with the private parts replaced. */
function scrub(value: unknown, depth: number, key?: string): unknown {
	if (key && SECRET_KEY.test(key)) {
		return value === '' || value == null ? value : '«hidden»'
	}
	if (typeof value === 'string') {
		const clean = /^https?:\/\//i.test(value) ? cleanUrl(value) : value
		return clean.length > MAX_VALUE
			? `${clean.slice(0, MAX_VALUE)}… (${clean.length} characters)`
			: clean
	}
	if (typeof value === 'function') return '[function]'
	if (value === null || typeof value !== 'object') return value
	if (depth >= MAX_DEPTH)
		return Array.isArray(value) ? `[${value.length} items]` : '{…}'
	if (Array.isArray(value)) {
		const items = value.slice(0, 20).map(v => scrub(v, depth + 1))
		return value.length > 20 ? [...items, `… ${value.length - 20} more`] : items
	}
	const out: Record<string, unknown> = {}
	for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
		out[k] = scrub(v, depth + 1, k)
	}
	return out
}

/** The settings as indented text with secrets hidden. */
export function redact(settings: unknown): string {
	try {
		const text = JSON.stringify(scrub(settings, 0), null, 1) ?? 'undefined'
		return text.length > MAX_TOTAL
			? `${text.slice(0, MAX_TOTAL)}\n… cut (${text.length} characters)`
			: text
	} catch {
		return 'not readable'
	}
}
