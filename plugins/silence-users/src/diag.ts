import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { silenceMessage } from './filter'
import { state } from './state'
import { setting } from './store'
import type { Settings } from './store'

const hookText = (hook: string): string =>
	hook === 'registered'
		? 'registered'
		: hook === 'failed'
			? 'FAILED to register'
			: 'not registered yet'

/** The settings for the report. The people are counted, never listed. */
function reportedSettings(): Record<string, unknown> {
	const keys: Array<keyof Settings> = [
		'silenceAll',
		'silenceEveryone',
		'silenceRoles',
		'command',
	]
	const out: Record<string, unknown> = {}
	for (const key of keys) out[key] = setting(key)
	out.silencedPeople = setting('users').length
	out.invalidEntries = setting('users').filter(
		id => !/^\d{15,21}$/.test(id),
	).length
	return out
}

/** Runs the filter on a made-up message and says whether it did what it should. */
function dryRun(): { ok: boolean; detail: string } {
	try {
		const message: Record<string, unknown> = {
			author: { id: '111111111111111111' },
			mentions: [{ id: '222222222222222222' }],
			mention_roles: ['333333333333333333'],
			mention_everyone: true,
		}
		const outcome = silenceMessage(
			message,
			{
				users: new Set(['111111111111111111']),
				all: false,
				everyone: false,
				roles: false,
			},
			'222222222222222222',
		)
		const empty =
			Array.isArray(message.mentions) &&
			message.mentions.length === 0 &&
			Array.isArray(message.mention_roles) &&
			message.mention_roles.length === 0 &&
			message.mention_everyone === false
		const other: Record<string, unknown> = {
			author: { id: '999999999999999999' },
			mentions: [{ id: '222222222222222222' }],
		}
		silenceMessage(
			other,
			{
				users: new Set(['111111111111111111']),
				all: false,
				everyone: false,
				roles: false,
			},
			'222222222222222222',
		)
		const untouched =
			Array.isArray(other.mentions) && other.mentions.length === 1
		const ok = empty && outcome.changed && outcome.direct && untouched
		return {
			ok,
			detail: ok
				? 'A made-up message from a silenced person lost its pings; one from someone else kept them'
				: 'The filter did not behave: please send the report',
		}
	} catch (error) {
		return {
			ok: false,
			detail: `The filter threw: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and settings. It never has anyone's id, name or picture, and never a message.
 */
export const diag = createDiagnostics('Silence Users', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'Port of SilenceUsers for Equicord by dka (GPL-3.0)',
	],
	settings: reportedSettings,
	extra: () => [
		`Hook in Discord's events (MESSAGE_CREATE, MESSAGE_UPDATE, NOTIFICATION_CREATE): ${hookText(state.hook)}`,
		`Messages seen: ${state.created} created, ${state.updated} edited; from someone silenced: ${state.fromSilenced}`,
		`Pings taken out: direct ${state.clearedDirect}, @everyone/@here ${state.clearedEveryone}, roles ${state.clearedRoles}`,
		`Notification events seen: ${state.notifications}; stopped: ${state.notificationsBlocked}`,
		`Your own id readable: ${state.meKnown ? 'yes' : 'no'}; errors while handling events: ${state.failures}`,
		`What the last message looked like: ${state.shape || 'no message seen yet'}`,
		`Command: module ${state.commandModule ? 'found' : 'not found yet'}; patch ${hookText(state.commandHook)}; Discord asked for its commands ${state.listCalls} time(s) and /silence was in the answer ${state.listWithOurs} time(s); run ${state.commandRuns} time(s)`,
		`People who pinged you since the plugin started (shown in the settings): ${state.recent.length}`,
		`Last thing that happened: ${state.last || 'nothing yet'}`,
	],
	checks: () => {
		const test = dryRun()
		return [
			{
				ok: state.hook === 'registered',
				label: 'The hook in Discord’s events is in place',
				detail:
					state.hook === 'failed'
						? 'Valenced could not register the patches'
						: 'The plugin has not finished starting',
			},
			{
				ok: test.ok,
				label: 'The filter takes pings out of a message',
				detail: test.detail,
			},
			{
				ok: state.created + state.updated > 0,
				label: 'Messages are reaching the plugin',
				detail:
					'None yet. Open a chat or wait for a message. If it stays at zero, Discord changed how it sends messages',
			},
			{
				ok:
					state.created + state.updated === 0 ||
					/mentions list/.test(state.shape),
				label: 'Messages still have a list of mentions',
				detail: `The last message looked like this: ${state.shape || 'none'}. Without it nothing can be taken out`,
			},
			{
				ok: state.meKnown || state.created === 0,
				label: 'Your own id can be read',
				detail:
					'Without it direct pings cannot be counted, but they are still taken out',
			},
			{
				ok: state.failures === 0,
				label: 'Handling events never threw an error',
				detail: `${state.failures} error(s). Press Copy logs and send the report`,
			},
			{
				ok: !setting('command') || state.commandHook === 'registered',
				label: '/silence was added to the / menu',
				detail:
					state.commandHook === 'failed'
						? 'The list was found but could not be changed'
						: 'Open the / menu in a chat once',
			},
			{
				ok:
					!setting('command') ||
					state.listCalls === 0 ||
					state.listWithOurs > 0,
				label: 'Discord’s answer included /silence',
				detail:
					'If this fails, Discord changed how it asks for built-in commands',
			},
			{
				ok: setting('users').every(id => /^\d{15,21}$/.test(id)),
				label: 'Every silenced person has a valid id',
				detail:
					'An id that is not 15 to 21 digits can never match anyone. Remove it in the settings',
			},
		]
	},
})
