export type PressAction = 'profile' | 'server'

export type LongPressAction = 'profile' | 'server'

export type ProfileType = 'server' | 'main'

export type Position = 'before_actions' | 'after_actions' | 'near_send'

export interface ChatboxAvatarStorage {
	pressAction: PressAction
	longPressAction: LongPressAction
	showStatusCutout: boolean
	profileType: ProfileType
	showInDms: boolean
	position: Position
}
