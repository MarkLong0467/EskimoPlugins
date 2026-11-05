import { Stores } from '@valenced/discord/flux'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'

/** One of Discord's Flux stores by name, described by the type the caller gives. Nothing if Discord has no such store. */
export function store<T>(name: string): T | undefined {
	return Stores[name] as unknown as T | undefined
}

/** The first Discord module that has all the given properties, described by the type the caller gives. */
export function findByProps<T>(...props: string[]): T | undefined {
	return lookupModule(
		(withProps as (...names: string[]) => ReturnType<typeof withProps>)(
			...props,
		),
	)[0] as unknown as T | undefined
}
