const PREFIX = '[MESSAGE-TWEAKS]'

export function dbg(tag: string, message: string, data?: any): void {
	try {
		const detail = data === undefined ? '' : ` ${safeStringify(data)}`
		console.warn(`${PREFIX}[${tag}] ${message}${detail}`)
	} catch {}
}

export function dbgError(tag: string, message: string, err?: any): void {
	try {
		let detail = ''
		if (err != null) {
			const msg =
				err?.message ??
				err?.description ??
				err?.toString?.() ??
				JSON.stringify(err)
			const stack = typeof err?.stack === 'string' ? `\n${err.stack}` : ''
			detail = ` ${String(msg)}${stack}`
		}
		console.warn(`${PREFIX}[${tag}] ${message}${detail}`)
	} catch {}
}

function safeStringify(value: any): string {
	try {
		if (value instanceof Error) {
			return `${value.message ?? ''}${value.stack ? `\n${value.stack}` : ''}`
		}
		const s = JSON.stringify(value)
		return s === undefined ? String(value) : s
	} catch {
		try {
			return String(value)
		} catch {
			return ''
		}
	}
}
