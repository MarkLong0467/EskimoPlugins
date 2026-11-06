declare module '@valenced/modules/native' {
	export interface NativeMethods {
		'bubbles.hook': [[], void]
		'bubbles.unhook': [[], void]
		'bubbles.configure': [
			[
				avatarRadius: number | undefined,
				bubbleRadius: number | undefined,
				bubbleColor: string | null,
			],
			void,
		]
		'declutter.configure': [
			[
				hideAvatarDecorations: boolean | undefined,
				hideServerTags: boolean | undefined,
			],
			void,
		]
		'mediasession.getCurrentMediaInfo': [[], Record<string, any> | null]
		'mediasession.sendMediaCommand': [
			[action: string, ...params: any[]],
			boolean,
		]
		'mediasession.isAvailable': [[], boolean]
		'mediasession.openNotificationListenerSettings': [[], boolean]
		'mediasession.getNotificationListenerStatus': [[], boolean]
		'mediasession.isCompanionInstalled': [[], boolean]
		'mediasession.isCompanionListenerEnabled': [[], boolean]
		'mediasession.installCompanion': [[], boolean]
		'mediasession.getCompanionVersion': [[], number]
	}
}

export {}
