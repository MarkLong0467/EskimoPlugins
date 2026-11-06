import { getSettings } from './state'

export function isSnowflake(value: string): boolean {
	return /^\d{15,20}$/.test(value)
}

export function describeError(err: unknown): string {
	try {
		const e = err as any
		if (e?.status) {
			if (e.status === 501)
				return "Name resolution isn't configured on the AltMaster server yet."
			if (e.status === 502) return "AltMaster couldn't reach Discord."
			if (e.status === 429)
				return 'Discord is rate-limiting the AltMaster server. Try again in a minute.'
		}
		if (e?.data?.error && typeof e.data.error === 'string')
			return String(e.data.error)
		if (typeof e?.message === 'string' && e.message.length > 0)
			return String(e.message)
	} catch {}
	return 'Could not reach AltMaster. Try again later.'
}

async function request(path: string, init?: RequestInit): Promise<any> {
	const base = (getSettings().baseUrl || '').trim().replace(/\/+$/, '')
	if (!base) {
		const err: any = new Error(
			'AltMaster server URL is not set. Open the plugin settings.',
		)
		err.status = 0
		throw err
	}

	let res: Response
	try {
		res = await fetch(`${base}${path}`, {
			...init,
			headers: {
				'content-type': 'application/json',
				...(init?.headers ?? {}),
			},
		})
	} catch {
		const err: any = new Error('Could not reach AltMaster.')
		err.status = 0
		throw err
	}

	let data: any = null
	try {
		data = await res.json()
	} catch {}

	if (!res.ok) {
		const err: any = new Error(data?.error ?? `Request failed (${res.status})`)
		err.status = res.status
		err.data = data
		throw err
	}
	return data
}

export interface AltEntry {
	id: number
	mainId: string
	altId: string
	warning: string | null
	createdAt: number
}

export interface CheckResult {
	userId: string
	entries: AltEntry[]
}

export function checkUser(userId: string): Promise<CheckResult> {
	return request(`/api/user/${encodeURIComponent(userId)}`)
}

export interface ReportPayload {
	mainId: string
	altId: string
	warning?: string
	reporterId?: string
}

export function reportAlt(payload: ReportPayload): Promise<any> {
	return request('/api/reports', {
		method: 'POST',
		body: JSON.stringify(payload),
	})
}

export function appealEntry(
	entryId: number,
	payload: { userId: string; reason: string },
): Promise<any> {
	return request(`/api/alts/${entryId}/appeals`, {
		method: 'POST',
		body: JSON.stringify(payload),
	})
}

export interface ResolvedUser {
	id: string
	username: string
	displayName: string
	avatar?: string | null
}

export async function resolveUser(
	userId: string,
): Promise<ResolvedUser | null> {
	try {
		return await request(`/api/discord/users/${userId}`)
	} catch {
		return null
	}
}
