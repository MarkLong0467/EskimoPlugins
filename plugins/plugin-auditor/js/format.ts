import type { VtVerdict } from './types'

/** How long ago a time was, in words. */
export function ago(at: number, now = Date.now()): string {
	if (!at) return 'never'
	const seconds = Math.max(0, Math.round((now - at) / 1000))
	if (seconds < 10) return 'just now'
	if (seconds < 60) return `${seconds} s ago`
	const minutes = Math.round(seconds / 60)
	if (minutes < 60) return `${minutes} min ago`
	const hours = Math.round(minutes / 60)
	if (hours < 48) return `${hours} h ago`
	return `${Math.round(hours / 24)} days ago`
}

/** A size in characters as a short text. */
export function sizeText(chars: number): string {
	if (chars < 1024) return `${chars} B`
	if (chars < 1024 * 1024)
		return `${(chars / 1024).toFixed(chars < 10240 ? 1 : 0)} KB`
	return `${(chars / 1024 / 1024).toFixed(1)} MB`
}

/** A count with its noun, as `1 plugin` or `3 plugins`. */
export function plural(count: number, noun: string): string {
	return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/** What a VirusTotal answer says, in one line, and how bad it is. */
export function verdictLine(verdict: VtVerdict): {
	text: string
	level: 'bad' | 'warn' | 'good' | 'unknown'
} {
	if (verdict.state === 'unknown')
		return { text: 'VirusTotal has never seen this', level: 'unknown' }
	const clean = verdict.harmless + verdict.undetected
	if (verdict.malicious > 0)
		return {
			text: `${verdict.malicious} engine${verdict.malicious === 1 ? '' : 's'} call it malicious`,
			level: 'bad',
		}
	if (verdict.suspicious > 0)
		return {
			text: `${verdict.suspicious} engine${verdict.suspicious === 1 ? '' : 's'} call it suspicious`,
			level: 'warn',
		}
	return { text: `No engine flagged it (${clean} checked)`, level: 'good' }
}
