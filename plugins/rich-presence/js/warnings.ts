import { planNow } from './apply'
import { nextOccurrence, parseClock, parseDate } from './timers'
import { num, partyProblem } from './variables'
import type { Profile, RichPresenceSettings } from './types'

/** Something the person is doing that will not work, and which presence it is about. */
export interface Warning {
	id: string
	text: string
}

/** Whether a text is a web link. */
const isLink = (value: string) => /^https?:\/\//i.test(value.trim())

const filled = (value: unknown) => String(value ?? '').trim() !== ''

/**
 * Everything that is set up wrongly in the presences that are switched on, each in plain words with what to do. A switched-off
 * presence is left alone. The list screen and the editor show these, so a mistake is clear before anyone wonders why a
 * presence is missing.
 */
export function warnings(settings: RichPresenceSettings): Warning[] {
	const out: Warning[] = []
	const { why } = planNow(settings)
	const on = settings.profiles.filter(p => p.enabled)
	const name = (p: Profile) => p.label || p.name || p.id
	const add = (p: Profile, text: string) => out.push({ id: p.id, text })

	// The same Application ID typed into two presences: Discord shows them as one card.
	const typed = new Map<string, Profile>()
	for (const p of on) {
		const id = String(p.applicationId || '').trim()
		if (!id) continue
		const first = typed.get(id)
		if (first)
			add(
				p,
				`Has the same Application ID as "${name(first)}", so Discord shows them as one card. Clear this ID (one is made up) or use a different one.`,
			)
		else typed.set(id, p)
	}

	for (const p of on) {
		const standing = why.get(p.id)
		if (standing === 'second playing')
			add(
				p,
				'Discord shows only one Playing at a time. Change this one to Listening to, Watching or Competing in.',
			)
		if (standing === 'duplicate')
			add(
				p,
				'Is the same type, application and name as one above, so Discord counts it as one. Change its name or Application ID.',
			)
		if (standing === 'over the limit')
			add(
				p,
				`Is over the limit of ${settings.maxActive} at once, so it is not shown. Switch another off or lower what is shown.`,
			)
		if (standing === 'outside its schedule') continue
		if (p.kind === 'soundcloud') {
			const s = settings.soundcloud
			if (s.autoEnabled && (!filled(s.lfmUser) || !filled(s.lfmKey)))
				add(
					p,
					'Last.fm is on but the name or API key is missing, so nothing can be found.',
				)
			if (!s.autoEnabled && !s.current)
				add(p, 'Has no track yet. Paste a SoundCloud link or turn on Last.fm.')
			continue
		}
		if (standing === 'needs a name')
			add(p, 'Needs an Activity name (Basics page). Nothing shows without one.')
		const id = String(p.applicationId || '').trim()
		if (id && !/^\d{15,22}$/.test(id))
			add(
				p,
				'The Application ID should be a long number (about 18 digits). Copy it from discord.com/developers.',
			)
		if (Number(p.type) === 1 && !isLink(String(p.streamUrl || '')))
			add(
				p,
				'Streaming needs a Twitch or YouTube link in Stream link (Basics page).',
			)
		for (const [n, label, url] of [
			[1, p.button1Label, p.button1Url],
			[2, p.button2Label, p.button2Url],
		] as const) {
			if (filled(label) && !isLink(String(url || '')))
				add(
					p,
					`Button ${n} has a label but no link starting with https://, so it is not shown.`,
				)
			else if (!filled(label) && filled(url))
				add(p, `Button ${n} has a link but no label, so it is not shown.`)
		}
		if (filled(p.partyCurrent) !== filled(p.partyMax))
			add(
				p,
				'The group size needs both numbers (Group size section), or it is left out.',
			)
		const partyNote =
			partyProblem('current', p.partyCurrent, p.partyMax) ||
			partyProblem('max', p.partyCurrent, p.partyMax)
		if (partyNote && filled(p.partyCurrent) === filled(p.partyMax))
			add(p, `The group size is left out: ${partyNote}`)
		const mode = p.timestampMode
		const date = parseDate(p.timerDate)
		if ((mode === 'since' || mode === 'until') && date === undefined)
			add(
				p,
				'The timer needs a date and time such as 2026-12-25 18:30 (Timer page).',
			)
		else if (
			mode === 'until' &&
			date !== undefined &&
			nextOccurrence(date, p.timerRepeat, Date.now()) === undefined
		)
			add(
				p,
				'The date for "Until a date" has passed and it does not repeat, so there is no timer. Pick a later date or a repeat.',
			)
		else if (mode === 'since' && date !== undefined && date > Date.now())
			add(
				p,
				'The date for "Since a date" is still to come, so no timer shows until then.',
			)
		if (mode === 'countdown' && !(num(p.countdownMinutes) || 0))
			add(p, 'The countdown needs a number of minutes above 0 (Timer page).')
		if (
			mode === 'daily' &&
			(parseClock(p.dailyFrom) === undefined ||
				parseClock(p.dailyTo) === undefined)
		)
			add(
				p,
				'The daily timer needs both times, such as 9:00 and 17:00 (Timer page).',
			)
		if (
			mode === 'custom' &&
			parseDate(p.customStart) === undefined &&
			parseDate(p.customEnd) === undefined
		)
			add(
				p,
				'The start and end timer needs at least one valid date (Timer page).',
			)
		if (p.scheduleOn) {
			if (!p.scheduleDays.some(Boolean))
				add(
					p,
					'The schedule has no days turned on, so it never shows (When page).',
				)
			const from = parseClock(p.scheduleFrom)
			const to = parseClock(p.scheduleTo)
			if (
				filled(p.scheduleFrom) !== filled(p.scheduleTo) ||
				(filled(p.scheduleFrom) && (from === undefined || to === undefined))
			)
				add(
					p,
					'The schedule times are not both valid times such as 9:00 (When page).',
				)
		}
	}
	return out
}
