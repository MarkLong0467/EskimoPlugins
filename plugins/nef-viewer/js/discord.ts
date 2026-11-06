import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/** The first Discord module that has all the given properties, described by the type the caller gives. */
export function findByProps<T>(...props: string[]): T | undefined {
	return lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () => ActionSheetActionCreators

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}
