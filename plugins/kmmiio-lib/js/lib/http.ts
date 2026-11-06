import { createModuleGetter } from './modules'

export const getHTTPUtils = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('getAPIBaseURL', 'get', 'post'),
	exports => exports,
)

const fetchBasicGuildFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('fetchBasicGuild'),
	exports => exports?.fetchBasicGuild,
)

const requestMembersByIdFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('requestMembersById'),
	exports => exports?.requestMembersById,
)

const assetManagerFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('getAssetIds', 'fetchAssetIds'),
	exports => exports,
)

const activityActionFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('SET_ACTIVITY'),
	exports => exports,
)

export function getFetchBasicGuild(): any {
	return fetchBasicGuildFn()
}
export function getRequestMembersById(): any {
	return requestMembersByIdFn()
}
export function getAssetManager(): any {
	return assetManagerFn()
}
export function primeActivityModule(): any {
	return activityActionFn()
}
