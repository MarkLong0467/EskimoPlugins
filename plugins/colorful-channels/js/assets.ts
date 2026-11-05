import { AssetsRegistry } from '@valenced/assets'

/**
 * Finds the asset id in an icon's `source`. Discord passes it in several shapes: a number, an array whose first item
 * is one, or an object with an `original` or `default` number.
 */
export function assetId(source: unknown): number | undefined {
	let value = source
	if (Array.isArray(value)) value = value[0]
	if (typeof value === 'number') return value
	if (value && typeof value === 'object') {
		const object = value as { original?: unknown; default?: unknown }
		if (typeof object.original === 'number') return object.original
		if (typeof object.default === 'number') return object.default
	}
	return undefined
}

/** The name Discord registered an icon under (for example `ic_channel_text_lock`), or nothing if it has none. */
export function assetName(source: unknown): string | undefined {
	const id = assetId(source)
	if (id === undefined) return undefined
	const registry = AssetsRegistry as unknown as {
		getAssetByID(id: number): { name?: string } | undefined
	}
	return registry.getAssetByID(id)?.name
}
