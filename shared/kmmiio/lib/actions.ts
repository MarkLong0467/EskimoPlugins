import { createModuleGetter } from './modules'

const hapticsFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('triggerHapticFeedback'),
	exports =>
		typeof exports?.triggerHapticFeedback === 'function'
			? exports.triggerHapticFeedback
			: undefined,
)

const hapticsTypes = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps('triggerHapticFeedback'),
	exports => exports?.HapticFeedbackTypes ?? exports?.default,
)

export function getTriggerHapticFeedback(): any {
	return hapticsFn()
}
export function getHapticFeedbackTypes(): any {
	return hapticsTypes()
}

export function getActionSheetActionCreators(): any {
	try {
		return (valenced as any).discord?.actions?.ActionSheetActionCreators
	} catch {
		return undefined
	}
}
