import { MAX_SLOWMODE_SECONDS } from './constants'

/**
 * The slowmode choices this plugin puts in Discord's picker, in seconds, from smallest to largest:
 * - every second from 0 (off) to 1 minute,
 * - every minute from 2 minutes to 1 hour,
 * - every hour from 2 hours to 6 hours.
 *
 * Discord itself offers only a handful of values. The longest it accepts is 6 hours.
 */
export function extendedValues(): number[] {
	const values: number[] = []
	for (let seconds = 0; seconds <= 60; seconds++) values.push(seconds)
	for (let seconds = 120; seconds <= 3600; seconds += 60) values.push(seconds)
	for (let seconds = 7200; seconds <= MAX_SLOWMODE_SECONDS; seconds += 3600)
		values.push(seconds)
	return values
}

/** A short label for a number of seconds: `45s`, `5m` or `2h`. Used to list the choices on the settings screen. */
export function describe(seconds: number): string {
	if (seconds < 60) return `${seconds}s`
	if (seconds < 3600) return `${seconds / 60}m`
	return `${seconds / 3600}h`
}
