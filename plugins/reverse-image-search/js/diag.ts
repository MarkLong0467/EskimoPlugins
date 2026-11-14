import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'

/** Which of the two menus got "Search Image", and how often it was used. */
export const stats = {
	/** The menu you get when you hold a picture in chat. */
	messageMenu: 'not opened yet',
	/** The menu of Discord's picture viewer. */
	viewerMenu: 'not found yet',
	added: 0,
	searches: 0,
}

/** What this plugin tells the settings screen's "Copy logs" and "Run self-check". Addresses are left out. */
export const diag = createDiagnostics('Reverse Image Search', {
	credit: [
		'Made by MarkLong0467 (https://github.com/MarkLong0467)',
		'After ReverseImageSearch for Equicord by Ven and Nuckyz (https://equicord.org/plugins/ReverseImageSearch)',
	],
	extra: () => [
		`message menu: ${stats.messageMenu}`,
		`viewer menu: ${stats.viewerMenu}`,
		`"Search Image" added ${stats.added} times, searches opened: ${stats.searches}`,
	],
})
