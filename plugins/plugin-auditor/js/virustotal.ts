/**
 * A small VirusTotal (API v3) client.
 *
 * - A look-up by SHA-256 sends only the hash, never the code. VirusTotal answers if it has seen exactly that file.
 * - An upload sends the whole plugin file. VirusTotal shares uploads with security companies, so the app asks first.
 * - A domain look-up sends only the domain name.
 *
 * A free key may make 4 requests a minute and 500 a day, so requests are spaced out. Every answer is turned into a
 * {@link VtVerdict}, and every failure into a plain reason, so the screens never see a raw response.
 */

import { base64Url, utf8 } from './hash'
import type { VtVerdict } from './types'

const API = 'https://www.virustotal.com/api/v3'

/** The time between requests on a free key, with a little room (milliseconds). */
const FREE_GAP_MS = 16_000

/** The time between requests on a key with a higher limit (milliseconds). */
const FAST_GAP_MS = 900

/** How long one request may take (milliseconds). */
const TIMEOUT_MS = 25_000

/** How long an upload is followed before giving up (milliseconds). */
const ANALYSIS_WAIT_MS = 4 * 60_000

/** The largest file uploaded. VirusTotal takes 32 MB through this call. */
export const MAX_UPLOAD_BYTES = 30 * 1024 * 1024

/** Why a request did not give an answer. */
export type VtFailure =
	| 'no-key'
	| 'key'
	| 'rate'
	| 'network'
	| 'http'
	| 'answer'
	| 'too-big'

/** The answer to one request. */
export type VtResult =
	| { ok: true; verdict: VtVerdict }
	| { ok: false; reason: VtFailure; message: string; status?: number }

/** One request, kept for the debug report. */
export interface VtLogEntry {
	at: number
	what: string
	status: number | string
	ms: number
}

/** The last requests, newest last. */
const log: VtLogEntry[] = []

/** The last requests, for the debug report. */
export function vtLog(): readonly VtLogEntry[] {
	return log
}

/** Settings a request needs. */
export interface VtOptions {
	key: string
	/** The key has a higher limit than the free one. */
	fast: boolean
}

let lastRequestAt = 0

/** Waits so that requests are not closer together than the key allows. */
async function pace(fast: boolean): Promise<void> {
	const gap = fast ? FAST_GAP_MS : FREE_GAP_MS
	const wait = lastRequestAt + gap - Date.now()
	lastRequestAt = Math.max(Date.now(), lastRequestAt + gap)
	if (wait > 0) await new Promise<void>(resolve => setTimeout(resolve, wait))
}

/** Stops waiting for requests that have not been sent yet. */
export function resetPacing(): void {
	lastRequestAt = 0
}

/** `fetch` that gives up after a while. */
async function timed(url: string, init: RequestInit): Promise<Response> {
	let timer: ReturnType<typeof setTimeout> | undefined
	try {
		return await Promise.race([
			fetch(url, init),
			new Promise<never>((_, reject) => {
				timer = setTimeout(() => reject(new Error('timed out')), TIMEOUT_MS)
			}),
		])
	} finally {
		if (timer) clearTimeout(timer)
	}
}

/** The parts of a VirusTotal object this file reads. */
interface Attributes {
	last_analysis_stats?: Stats
	stats?: Stats
	last_analysis_date?: number
	last_analysis_results?: Record<
		string,
		{ category?: string; result?: string | null }
	>
	results?: Record<string, { category?: string; result?: string | null }>
	status?: string
}

interface Stats {
	malicious?: number
	suspicious?: number
	harmless?: number
	undetected?: number
}

/** Turns what VirusTotal said into a verdict. */
function toVerdict(attributes: Attributes): VtVerdict {
	const stats = attributes.last_analysis_stats ?? attributes.stats ?? {}
	const results = attributes.last_analysis_results ?? attributes.results ?? {}
	const flagged: string[] = []
	for (const [engine, result] of Object.entries(results)) {
		if (result.category === 'malicious' || result.category === 'suspicious')
			flagged.push(result.result ? `${engine}: ${result.result}` : engine)
	}
	return {
		state: 'found',
		malicious: stats.malicious ?? 0,
		suspicious: stats.suspicious ?? 0,
		harmless: stats.harmless ?? 0,
		undetected: stats.undetected ?? 0,
		flagged: flagged.slice(0, 10),
		analysedAt: (attributes.last_analysis_date ?? 0) * 1000,
		checkedAt: Date.now(),
	}
}

/** The verdict for something VirusTotal does not know. */
function unknownVerdict(): VtVerdict {
	return {
		state: 'unknown',
		malicious: 0,
		suspicious: 0,
		harmless: 0,
		undetected: 0,
		flagged: [],
		analysedAt: 0,
		checkedAt: Date.now(),
	}
}

/**
 * Sends one request and turns the response into a result. Never throws.
 *
 * @param what Names the request in the debug report. Never holds the key.
 * @param path The path after the API address.
 * @param options The key and how fast to go.
 * @param init Method, headers and body.
 * @param read Turns the answer's JSON into a verdict.
 */
async function request(
	what: string,
	path: string,
	options: VtOptions,
	init: RequestInit,
	read: (json: { data?: { id?: string; attributes?: Attributes } }) => VtResult,
): Promise<VtResult> {
	if (!options.key)
		return { ok: false, reason: 'no-key', message: 'No VirusTotal key' }
	await pace(options.fast)
	const started = Date.now()
	try {
		const response = await timed(`${API}${path}`, {
			...init,
			headers: {
				'x-apikey': options.key,
				accept: 'application/json',
				...(init.headers as Record<string, string>),
			},
		})
		log.push({
			at: started,
			what,
			status: response.status,
			ms: Date.now() - started,
		})
		if (log.length > 40) log.splice(0, log.length - 40)
		if (response.status === 404) return { ok: true, verdict: unknownVerdict() }
		if (response.status === 401 || response.status === 403)
			return {
				ok: false,
				reason: 'key',
				message: 'VirusTotal did not accept the key',
				status: response.status,
			}
		if (response.status === 429)
			return {
				ok: false,
				reason: 'rate',
				message:
					'VirusTotal says too many requests: wait a minute, or check your daily limit',
				status: response.status,
			}
		if (!response.ok)
			return {
				ok: false,
				reason: 'http',
				message: `VirusTotal answered ${response.status}`,
				status: response.status,
			}
		const json = (await response.json()) as {
			data?: { id?: string; attributes?: Attributes }
		}
		return read(json)
	} catch (error) {
		log.push({ at: started, what, status: 'failed', ms: Date.now() - started })
		return {
			ok: false,
			reason: 'network',
			message: error instanceof Error ? error.message : String(error),
		}
	}
}

/** Asks VirusTotal about a file by its SHA-256. Sends the hash only. */
export function lookupFile(
	sha256: string,
	options: VtOptions,
): Promise<VtResult> {
	return request(
		'file lookup',
		`/files/${sha256}`,
		options,
		{ method: 'GET' },
		json =>
			json.data?.attributes
				? { ok: true, verdict: toVerdict(json.data.attributes) }
				: {
						ok: false,
						reason: 'answer',
						message: 'VirusTotal gave an answer without a report',
					},
	)
}

/** Asks VirusTotal about a domain. Sends the domain only. */
export function lookupDomain(
	host: string,
	options: VtOptions,
): Promise<VtResult> {
	return request(
		'domain lookup',
		`/domains/${encodeURIComponent(host)}`,
		options,
		{ method: 'GET' },
		json =>
			json.data?.attributes
				? { ok: true, verdict: toVerdict(json.data.attributes) }
				: {
						ok: false,
						reason: 'answer',
						message: 'VirusTotal gave an answer without a report',
					},
	)
}

/** Checks that a key works without using a lookup that matters. */
export async function testKey(options: VtOptions): Promise<VtResult> {
	return request('key test', '/users/me', options, { method: 'GET' }, () => ({
		ok: true,
		verdict: unknownVerdict(),
	}))
}

/** The id of a URL in VirusTotal, for the "open on VirusTotal" links. */
export function urlId(url: string): string {
	return base64Url(url)
}

/** The page on VirusTotal's site for a file. Opens without a key. */
export function fileLink(sha256: string): string {
	return `https://www.virustotal.com/gui/file/${sha256}`
}

/** The page on VirusTotal's site for a domain. */
export function domainLink(host: string): string {
	return `https://www.virustotal.com/gui/domain/${encodeURIComponent(host)}`
}

/** The search for a file on Hybrid Analysis, a second opinion. Opens without a key. */
export function hybridLink(sha256: string): string {
	return `https://www.hybrid-analysis.com/search?query=${sha256}`
}

/** Builds the body of a file upload by hand: React Native cannot make a file out of text. */
function multipart(name: string, text: string, boundary: string): string {
	return [
		`--${boundary}`,
		`Content-Disposition: form-data; name="file"; filename="${name.replace(/[^\w.-]/g, '_')}.js"`,
		'Content-Type: application/javascript',
		'',
		text,
		`--${boundary}--`,
		'',
	].join('\r\n')
}

/**
 * Uploads a plugin's code to VirusTotal, waits for the scan and gives the result.
 *
 * Only call this after the user agreed: the file is shared with VirusTotal's partners.
 *
 * @param name The plugin's id, used as the file name.
 * @param code The plugin's code.
 * @param sha256 The code's SHA-256, to fetch the report with when the scan is done.
 * @param options The key and how fast to go.
 * @param progress Called with a line to show while waiting.
 */
export async function uploadFile(
	name: string,
	code: string,
	sha256: string,
	options: VtOptions,
	progress: (text: string) => void,
): Promise<VtResult> {
	if (utf8(code).length > MAX_UPLOAD_BYTES)
		return { ok: false, reason: 'too-big', message: 'The file is over 30 MB' }
	const boundary = `----auditor${Date.now().toString(16)}${Math.floor(Math.random() * 1e9).toString(16)}`
	progress('Uploading…')
	let analysisId = ''
	const sent = await request(
		'file upload',
		'/files',
		options,
		{
			method: 'POST',
			headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
			body: multipart(name, code, boundary),
		},
		json => {
			if (json.data?.id) {
				analysisId = json.data.id
				return { ok: true, verdict: unknownVerdict() }
			}
			return {
				ok: false,
				reason: 'answer',
				message: 'VirusTotal did not return an analysis id',
			}
		},
	)
	if (!sent.ok) return sent

	const until = Date.now() + ANALYSIS_WAIT_MS
	while (Date.now() < until) {
		progress('Scanning with VirusTotal…')
		let status = ''
		const polled = await request(
			'analysis poll',
			`/analyses/${encodeURIComponent(analysisId)}`,
			options,
			{ method: 'GET' },
			json => {
				status = json.data?.attributes?.status ?? ''
				return { ok: true, verdict: unknownVerdict() }
			},
		)
		if (!polled.ok) return polled
		if (status === 'completed') return lookupFile(sha256, options)
	}
	return {
		ok: false,
		reason: 'network',
		message:
			'VirusTotal is still scanning. Try "Check" again in a few minutes.',
	}
}
