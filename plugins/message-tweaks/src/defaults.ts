import type { MessageTweaksStorage } from './types'

export const DEFAULTS: MessageTweaksStorage = {
	showHideButton: false,
	showLocalEditButton: false,
	hideLog: true,
	logDeleted: true,
	deletedLogMode: 'inline',
	logEdited: true,
	logOwnEdits: false,
	unspoilAll: true,
	preciseTimestamp: true,
	showUsername: true,
	showEditTrail: true,
	keepDeleted: true,
	deleteLogLimit: 50,
	translatorService: 'google',
	translatorTargetLang: 'en',
	translatorImmersive: true,
	translatorEnabled: true,
}
