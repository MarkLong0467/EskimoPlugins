import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { setting } from './config'
import { VERSION } from './constants'
import { myStatus } from './discord'
import { readList } from './list'
import { banners, hooks, iconsSeen } from './state'
import { toast } from './toast'

/** A plain text report of the settings, what was found and what was done, for pasting into a chat. */
export function buildReport(): string {
	const list = readList()
	return [
		'Bypass Status report',
		`version: ${VERSION}`,
		`everyone: ${setting('everyone')}; list: ${list.users.length} people, ${list.channels.length} channels or chats, ${list.guilds.length} servers`,
		`my status now: ${myStatus()}`,
		`discord's notification function: ${hooks.notificationUtils}; hooked: ${hooks.patched.join(', ') || '-'}`,
		`messages let through Do Not Disturb: ${hooks.bypassed} (last author ends ...${hooks.last || '-'})`,
		`own banners shown: ${banners.shown}`,
		`icons seen in sheets: ${iconsSeen.join(', ')}`,
		hooks.error ? `problem: ${hooks.error}` : '',
	]
		.filter(Boolean)
		.join('\n')
}

/** Copies the report to the clipboard and says so. */
export function copyReport(): void {
	try {
		Clipboard.setString(buildReport())
		toast('Report copied. Paste it in the chat.')
	} catch {
		toast('Could not copy')
	}
}
