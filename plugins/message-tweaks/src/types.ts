export interface MessageTrail {
	versions: string[]
	current: string
}

export interface MessageTweaksStorage {
	showHideButton: boolean
	showLocalEditButton: boolean
	hideLog: boolean
	logDeleted: boolean
	deletedLogMode: 'inline' | 'toast'
	logEdited: boolean
	logOwnEdits: boolean
	unspoilAll: boolean
	preciseTimestamp: boolean
	showUsername: boolean
	showEditTrail: boolean
	keepDeleted: boolean
	deleteLogLimit: number
	translatorService: 'google' | 'deepl'
	translatorTargetLang: string
	translatorImmersive: boolean
	translatorEnabled: boolean
	persisted?: { hidden: Record<string, Record<string, string>> }
}
