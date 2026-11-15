/**
 * Words in braces that are filled in when a message is sent, so a saved or scheduled message stays up to date:
 * `{date}`, `{time}`, `{t:R}` (a Discord timestamp that every reader sees in their own time) and `{random:a|b|c}`.
 */

/** The words, for the help text. */
export const VARIABLES: { word: string; means: string }[] = [
	{ word: '{date}', means: 'today, as 2026-11-15' },
	{ word: '{time}', means: 'the time, as 14:05' },
	{ word: '{unix}', means: 'the time in seconds since 1970' },
	{
		word: '{t:R}',
		means: 'Discord timestamp "in 5 minutes" (also t, T, d, D, f, F)',
	},
	{ word: '{t+1h:R}', means: 'the same, an hour from now (m, h, d, w)' },
	{ word: '{random:a|b|c}', means: 'one of the choices' },
	{ word: '{webhook}', means: 'the name of the webhook it is sent with' },
]

const two = (n: number) => (n < 10 ? `0${n}` : String(n))

const UNITS: Record<string, number> = { m: 60, h: 3600, d: 86_400, w: 604_800 }

/** Fills in the words of a text. */
export function fill(
	text: string,
	context: { now?: number; webhook?: string } = {},
): string {
	if (!text?.includes('{')) return text
	const now = context.now ?? Date.now()
	const date = new Date(now)
	const unix = Math.floor(now / 1000)
	return text.replace(
		/\{([a-z]+)(?:([+-]\d+[mhdw]))?(?::([^{}]*))?\}/gi,
		(
			whole,
			word: string,
			shift: string | undefined,
			arg: string | undefined,
		) => {
			switch (word.toLowerCase()) {
				case 'date':
					return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`
				case 'time':
					return `${two(date.getHours())}:${two(date.getMinutes())}`
				case 'unix':
					return String(unix)
				case 't': {
					let at = unix
					if (shift) {
						const amount = Number.parseInt(shift, 10)
						at += amount * (UNITS[shift.slice(-1)] ?? 0)
					}
					const style = arg && /^[tTdDfFR]$/.test(arg) ? `:${arg}` : ''
					return `<t:${at}${style}>`
				}
				case 'random': {
					const choices = (arg ?? '').split('|')
					return choices[Math.floor(Math.random() * choices.length)] ?? ''
				}
				case 'webhook':
					return context.webhook ?? whole
				default:
					return whole
			}
		},
	)
}
