import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'
import { current, found, GROUP_PREFIX } from './data'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". Names and ids are left out. */
export const diag = createDiagnostics('I Remember You', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'After IRememberYou for Equicord by zoodogood, keircn and tt (https://equicord.org/plugins/IRememberYou)',
	],
	extra: () => {
		const live = current?.usersCollection ?? {}
		const size = (key: string) => Object.keys(live[key]?.users ?? {}).length
		const keys = Object.keys(live)
		return [
			`running: ${current ? 'yes' : 'no'}`,
			`friends group: ${size('friends')}, dm group: ${size('dm')}, group DMs: ${keys.filter(k => k.startsWith(GROUP_PREFIX)).length}, servers: ${keys.filter(k => k !== 'dm' && k !== 'friends' && !k.startsWith(GROUP_PREFIX)).length}`,
			...Object.entries(found).map(([name, text]) => `${name}: ${text}`),
		]
	},
	settings: () => {
		const data = store.get('data')
		return {
			groups: Object.keys(data).length,
			people: Object.values(data).reduce(
				(sum, group) => sum + Object.keys(group.users).length,
				0,
			),
		}
	},
})
