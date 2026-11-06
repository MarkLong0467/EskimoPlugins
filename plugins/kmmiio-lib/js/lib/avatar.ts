import { createModuleGetter, resolveComponent } from './modules'

const avatar = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps(
		'default',
		'AvatarSizes',
		'getStatusSize',
	),
	exports => resolveComponent(exports),
)

export function getAvatar(): any {
	return avatar()
}
