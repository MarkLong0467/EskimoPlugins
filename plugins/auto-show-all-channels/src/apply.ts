import { remember } from './config'
import { diag } from './diag'
import {
	allGuilds,
	getGuild,
	hidesChannels,
	isCommunity,
	optInActions,
	toast,
} from './discord'
import { state } from './state'
import type { HistoryEntry, Outcome } from './config'

/** How long after turning it on the plugin checks that Discord took it (milliseconds). */
const VERIFY_DELAY_MS = 1500

/** How long to wait between servers when doing all of them, so Discord is not asked too fast (milliseconds). */
const BETWEEN_MS = 600

/** What happened across a number of servers. */
export interface Summary {
	changed: number
	already: number
	skipped: number
	failed: number
}

/**
 * Makes one server show all of its channels.
 *
 * "Show All Channels" in Discord's server menu is a switch that turns the server's opt-in mode off. This does what the
 * switch does: `setGuildOptIn(guildId, false)`. Only community servers have the option, so any other server is left alone.
 *
 * @param guildId The server.
 * @param how Whether it is a server you just joined, or part of "all my servers". It goes in the history.
 * @returns What happened. `not loaded` means Discord does not have the server yet, so nothing was changed or remembered.
 */
export function showAllIn(guildId: string, how: HistoryEntry['how']): Outcome {
	const guild = getGuild(guildId)
	if (!guild) return 'not loaded'

	let outcome: Outcome
	if (!isCommunity(guild)) outcome = 'not a community server'
	else if (!hidesChannels(guildId)) outcome = 'already on'
	else {
		const actions = optInActions()
		// Discord loads this function late, so it may turn up a moment from now: nothing is recorded and it is tried again.
		if (!actions) return 'not loaded'
		try {
			actions.setGuildOptIn(guildId, false, 'auto_show_all_channels')
			outcome = 'turned on'
		} catch (error) {
			diag.fail('setGuildOptIn', error)
			outcome = 'failed'
		}
	}

	const entry: HistoryEntry = {
		id: guildId,
		name: guild.name ?? guildId,
		outcome,
		at: Date.now(),
		how,
	}
	remember(entry)
	if (outcome === 'turned on') state.turnedOn++
	else if (outcome === 'already on') state.alreadyOn++
	else if (outcome === 'failed') state.failed++
	else state.skipped++
	// The server's name is not put in the log, so a report can be shared.
	diag.log(
		'server',
		`${outcome} (${how})`,
		outcome === 'failed' ? 'error' : 'info',
	)

	if (outcome === 'turned on') {
		if (how === 'joined') toast(`Show All Channels is on in ${entry.name}`)
		setTimeout(() => {
			// Discord saves the setting in the background, so it is looked at again a moment later.
			if (hidesChannels(guildId)) {
				state.turnedOn--
				state.failed++
				remember({ ...entry, outcome: 'failed', at: Date.now() })
				diag.log('verify', 'Discord still hides channels in a server', 'warn')
			}
		}, VERIFY_DELAY_MS)
	}
	return outcome
}

/** The community servers that still hide channels from you. */
export function serversToFix() {
	return allGuilds().filter(g => isCommunity(g) && hidesChannels(g.id))
}

/**
 * Turns on Show All Channels in every community server that hides channels, one after another.
 *
 * @param onProgress Called after each server with how many are done and how many there are.
 */
export async function showAllInAll(
	onProgress?: (done: number, total: number) => void,
): Promise<Summary> {
	const targets = serversToFix()
	const summary: Summary = { changed: 0, already: 0, skipped: 0, failed: 0 }
	let done = 0
	for (const guild of targets) {
		const outcome = showAllIn(guild.id, 'all servers')
		if (outcome === 'turned on') summary.changed++
		else if (outcome === 'already on') summary.already++
		else if (outcome === 'failed') summary.failed++
		else summary.skipped++
		done++
		onProgress?.(done, targets.length)
		if (done < targets.length)
			await new Promise(resolve => setTimeout(resolve, BETWEEN_MS))
	}
	toast(
		targets.length
			? `Show All Channels turned on in ${summary.changed} server(s)${summary.failed ? `, ${summary.failed} failed` : ''}`
			: 'Every server already shows all its channels',
	)
	diag.log(
		'all servers',
		`${summary.changed} changed, ${summary.failed} failed, ${targets.length} tried`,
	)
	return summary
}
