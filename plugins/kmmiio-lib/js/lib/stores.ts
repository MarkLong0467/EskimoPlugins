import { createStoreGetter } from './modules'

export const getUserStore = createStoreGetter('UserStore')
export const getSelfPresenceStore = createStoreGetter('SelfPresenceStore')
export const getSelectedChannelStore = createStoreGetter('SelectedChannelStore')
export const getChannelStore = createStoreGetter('ChannelStore')
export const getGuildStore = createStoreGetter('GuildStore')
export const getGuildRoleStore = createStoreGetter('GuildRoleStore')
export const getGuildChannelStore = createStoreGetter('GuildChannelStore')
export const getGuildMemberCountStore = createStoreGetter(
	'GuildMemberCountStore',
)
export const getGuildHeaderCountsStore = createStoreGetter(
	'GuildHeaderCountsStore',
)
export const getBasicGuildStore = createStoreGetter('BasicGuildStore')
export const getGuildMemberStore = createStoreGetter('GuildMemberStore')
export const getRelationshipStore = createStoreGetter('RelationshipStore')
export const getMessageStore = createStoreGetter('MessageStore')
export const getMessageReactionsStore = createStoreGetter(
	'MessageReactionsStore',
)
