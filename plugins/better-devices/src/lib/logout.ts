import { getAuthSessionsActionCreators, getSessionsStore } from './modules'

export type LogoutResult = {
	ok: boolean
	removed: number
	failed: number
	/** True when at least one logout was blocked by a server-side 2FA challenge. */
	mfa: boolean
}

function isMfaChallenge(body: any): boolean {
	return (
		body != null &&
		typeof body === 'object' &&
		body.mfa === true &&
		typeof body.token === 'string'
	)
}

async function requestLogout(
	creators: any,
	hash: string | string[],
): Promise<{ mfa: boolean; removed: boolean }> {
	try {
		const body = await creators.logOutSessions(hash)
		if (isMfaChallenge(body)) return { mfa: true, removed: false }
		return { mfa: false, removed: true }
	} catch {
		return { mfa: false, removed: false }
	}
}

function refreshSessions(creators: any): void {
	try {
		void creators?.fetchAuthSessions?.()
	} catch {
		// ignore
	}
}

/**
 * Logs out a single session. On 2FA-enabled accounts the server answers with an
 * MFA challenge instead of logging out; we surface that honestly rather than
 * pretending the session was revoked.
 */
export async function logOutSession(hash: string): Promise<LogoutResult> {
	const creators = getAuthSessionsActionCreators()
	if (typeof creators?.logOutSessions !== 'function') {
		return { ok: false, removed: 0, failed: 1, mfa: false }
	}
	const { mfa, removed } = await requestLogout(creators, hash)
	refreshSessions(creators)
	return {
		ok: !mfa && removed,
		removed: removed ? 1 : 0,
		failed: mfa || !removed ? 1 : 0,
		mfa,
	}
}

/**
 * Logs out every session that is not the current device, one request per
 * session. Each hash is treated independently so a single failing session
 * never blocks the rest; the API copy is refreshed afterwards so the Devices
 * screen updates right away.
 *
 * Note: on 2FA-enabled accounts Discord rejects every revocation (bulk or
 * single) until the owner supplies an authenticator code, so `mfa` is set and
 * nothing is removed.
 */
export async function logOutOtherSessions(): Promise<LogoutResult> {
	const creators = getAuthSessionsActionCreators()
	const store = getSessionsStore()

	let hashes: string[] = []
	try {
		hashes = (store?.getSessions?.() ?? [])
			.filter((s: any) => s?.id_hash && !s.current)
			.map((s: any) => s.id_hash)
	} catch {
		hashes = []
	}

	if (typeof creators?.logOutSessions !== 'function' || hashes.length === 0) {
		return { ok: false, removed: 0, failed: hashes.length, mfa: false }
	}

	let removed = 0
	let failed = 0
	let mfa = false
	for (const hash of hashes) {
		const result = await requestLogout(creators, hash)
		if (result.mfa) {
			mfa = true
			failed++
		} else if (result.removed) {
			removed++
		} else {
			failed++
		}
	}

	// Only when every single call was rejected try the bulk request once —
	// some accounts allow the consolidated revocation but not individual ones.
	if (removed === 0 && failed > 0) {
		const bulk = await requestLogout(creators, hashes)
		if (bulk.removed) {
			removed = hashes.length
			failed = 0
		}
		mfa = mfa || bulk.mfa
	}

	refreshSessions(creators)
	return { ok: failed === 0 && !mfa, removed, failed, mfa }
}

/** Logs out the chosen sessions, one request each. */
export async function logOutSelectedSessions(hashes: string[]): Promise<void> {
	const creators = getAuthSessionsActionCreators()
	if (typeof creators?.logOutSessions !== 'function' || hashes.length === 0)
		return
	for (const hash of hashes) {
		try {
			await requestLogout(creators, hash)
		} catch {
			// keep going
		}
	}
	refreshSessions(creators)
}
