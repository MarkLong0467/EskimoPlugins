import { lazy } from './modules'

const byDefaultName = lazy(() =>
	valenced.modules.finders.filters.createFilterGenerator<[name: string]>(
		([name], _id, exports: any) =>
			typeof exports?.default === 'function' && exports.default.name === name,
		([name]) => `kmmiio.defaultName(${name})`,
		valenced.modules.finders.filters.FilterScopes.Initialized,
	),
)

const byProps = lazy(() =>
	valenced.modules.finders.filters.createFilterGenerator<[props: string[]]>(
		([props], _id, exports: any) =>
			exports != null &&
			(typeof exports === 'object' || typeof exports === 'function') &&
			props.every(prop => prop in exports),
		([props]) => `kmmiio.props(${props.join(',')})`,
		valenced.modules.finders.filters.FilterScopes.Initialized,
	),
)

const byDisplayName = lazy(() =>
	valenced.modules.finders.filters.createFilterGenerator<[name: string]>(
		([name], _id, exports: any) =>
			exports?.type?.displayName === name ||
			exports?.name === name ||
			exports?.default?.type?.displayName === name ||
			exports?.default?.name === name,
		([name]) => `kmmiio.displayName(${name})`,
		valenced.modules.finders.filters.FilterScopes.Initialized,
	),
)

const byProfileFrameComponent = lazy(() =>
	valenced.modules.finders.filters.createFilterGenerator<[]>(
		(_args, _id, exports: any) =>
			typeof exports?.default === 'function' &&
			exports.default.name === 'ProfileFrame' &&
			!('fromServer' in exports.default),
		() => `kmmiio.profileFrameComponent`,
		valenced.modules.finders.filters.FilterScopes.Initialized,
	),
)

export function getDefaultNameFilter(name: string) {
	return byDefaultName()(name)
}
export function getPropsFilter(...props: string[]) {
	return byProps()(props)
}
export function getDisplayNameFilter(name: string) {
	return byDisplayName()(name)
}
export function getProfileFrameComponentFilter() {
	return byProfileFrameComponent()()
}
