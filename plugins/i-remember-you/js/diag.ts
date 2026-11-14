import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { store } from './config'

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". Names and ids are left out. */
export const diag = createDiagnostics('I Remember You', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'After IRememberYou for Equicord by zoodogood, keircn and tt (https://equicord.org/plugins/IRememberYou)',
	],
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
