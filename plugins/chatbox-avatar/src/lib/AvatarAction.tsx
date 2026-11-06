import { Pressable } from 'react-native'
import { DEFAULTS } from '../defaults'
import { getStorage } from '../lib/state'
import {
	forceLoadLazySheets,
	getAvatar,
	getChannelStore,
	getHapticFeedbackTypes,
	getSelectedChannelStore,
	getSelfPresenceStore,
	getTriggerHapticFeedback,
	getUserStore,
	isComponentType,
	openAccountSheet,
	openUserProfileSheet,
	resolveColor,
} from './modules'
import type { ChatboxAvatarStorage } from '../types'

export default function AvatarAction() {
	const { React } = valenced.react
	const { useReRender } = valenced.utils.react

	const forceUpdate = useReRender()

	React.useEffect(() => {
		const stores = [
			getUserStore(),
			getSelfPresenceStore(),
			getSelectedChannelStore(),
			getChannelStore(),
		].filter(Boolean)
		for (const store of stores) store.addChangeListener(forceUpdate)
		return () => {
			for (const store of stores) store.removeChangeListener(forceUpdate)
		}
	}, [forceUpdate])

	const jsonStorage = getStorage()
	const s: ChatboxAvatarStorage = { ...DEFAULTS, ...(jsonStorage?.use() ?? {}) }

	const self = getUserStore()?.getCurrentUser?.()
	const status = getSelfPresenceStore()?.getStatus?.()
	const channelId = getSelectedChannelStore()?.getCurrentlySelectedChannelId?.()
	const channel = getChannelStore()?.getChannel?.(channelId)
	const avatarModule = getAvatar()
	const Avatar = avatarModule?.default ?? avatarModule

	if (!self || !Avatar || !isComponentType(Avatar)) {
		return null
	}

	const isDm = channel?.type === 1 || channel?.type === 3
	if (isDm && !s.showInDms) {
		return null
	}

	const guildId = s.profileType === 'server' ? channel?.guild_id : undefined
	const profileChannelId =
		s.profileType === 'server' ? (channel?.id ?? channelId) : undefined

	const openProfile = () => {
		try {
			forceLoadLazySheets()
			openUserProfileSheet(self.id, profileChannelId)
		} catch {}
	}

	const handlePress = () => {
		if (s.pressAction === 'server') {
			openAccountSheet()
		} else {
			openProfile()
		}
	}

	const handleLongPress = () => {
		try {
			const types = getHapticFeedbackTypes()
			getTriggerHapticFeedback()?.(types?.SOFT)
		} catch {}
		if (s.longPressAction === 'server') {
			openAccountSheet()
		} else {
			openProfile()
		}
	}

	const hitSlop = Math.max(0, (48 - 36) / 2)

	return (
		<Pressable
			onPress={handlePress}
			onLongPress={handleLongPress}
			delayLongPress={500}
			hitSlop={hitSlop}
			accessibilityRole="button"
			style={{
				justifyContent: 'center',
				alignItems: 'center',
				marginHorizontal: 4,
			}}
		>
			<Avatar
				user={self}
				guildId={guildId}
				status={s.showStatusCutout ? status : undefined}
				statusStyle={
					s.showStatusCutout
						? { backgroundColor: resolveColor('BACKGROUND_SURFACE_HIGH') }
						: undefined
				}
				avatarDecoration={self?.avatarDecoration}
				animate={true}
			/>
		</Pressable>
	)
}
