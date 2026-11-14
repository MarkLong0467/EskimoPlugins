import { getAssetIdByName } from '@valenced/assets'
import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import type { ComponentType } from 'react'

/** The first Discord module that has all the given properties. */
export function findByProps<T>(...props: string[]): T | undefined {
	return lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined
}

/** Discord's action sheet functions (open and close the bottom sheets). */
export const sheets = () =>
	ActionSheetActionCreators as unknown as {
		openLazy(importer: unknown, key: string, props?: unknown): unknown
		hideActionSheet(key?: string): void
		hideAllActionSheets(): void
	}

/** Closes every sheet that is open. */
export function hideSheets(): void {
	try {
		sheets().hideAllActionSheets()
	} catch {
		// No sheet was open.
	}
}

/** One of Discord's icons, by the name of its component (`MagnifyingGlassIcon`). */
export function iconComponent(name: string): ComponentType | undefined {
	try {
		const icon = findByProps<Record<string, unknown>>(name)?.[name]
		return typeof icon === 'function' || (icon && typeof icon === 'object')
			? (icon as ComponentType)
			: undefined
	} catch {
		return undefined
	}
}

/** The id of one of Discord's icons by name, or nothing if there is no such icon. */
export function asset(name: string): number | undefined {
	const id = getAssetIdByName(name)
	return id == null ? undefined : id
}

/** Equicord's SearchIcon and OpenExternalIcon, as Discord's phone app names them. */
export const SEARCH_ICON = 'MagnifyingGlassIcon'
export const EXTERNAL_ICON = 'WindowLaunchIcon'
