const pad = (n: number) => n.toString().padStart(2, '0')
const MONTHS = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
]

/** Discord-style absolute timestamp: "Sep 18, 2026, 3:04:05 PM". */
export function formatExactTimestamp(date: Date): string {
	const hours = date.getHours()
	const hour12 = hours % 12 || 12
	const ampm = hours < 12 ? 'AM' : 'PM'
	return (
		`${MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}, ` +
		`${hour12}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${ampm}`
	)
}
