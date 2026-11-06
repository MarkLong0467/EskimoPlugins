/** What the native picker resolves to; `portal.ts` reads `base64`. */
export type PickedImage = {
	base64?: string
	data?: string
	originalMd5?: string
	/** Discord returns either a path or a `{ uri }` object depending on platform. */
	uri?: string | { uri?: string; [key: string]: unknown }
	fileName?: string
	type?: string
	mimeType?: string
	width?: number
	height?: number
	[key: string]: unknown
}

type OpenImagePicker = (options: {
	size: number
}) => Promise<PickedImage | undefined>

/**
 * Dependents of `utils/native/UploadUtils`, pinned by export names verified not to
 * be minified. Ordered rarest-first: a rare anchor yields a small match set, which
 * keeps the forced initialisation cheap.
 *
 * `ImageConversionDecision` is imported only by upload/media code, so it drags in a
 * handful of modules. `PremiumUtils` is common — roughly 150 dependents on the
 * build this was written against — but it is the one that reliably resolves, since
 * by the time anyone reaches an upload button the client is fully booted and those
 * modules are initialised anyway, which makes `initialize: true` nearly free.
 */
const ANCHORS = ['shouldConvertToJPG', 'getPremiumBranding']

/**
 * Ceiling on how many modules one anchor may force-load. The scan stops at the
 * first verified match, so this only bounds the pathological case.
 */
const MAX_INITIALIZE = 400

const PICKER_EXPORTS = ['openImagePicker', 'openImagePickerUnhandled']

let cached: OpenImagePicker | undefined
let override: (() => OpenImagePicker | undefined) | undefined

/** Pull `openImagePicker` out of a namespace, bound to its owner. */
function pickerFrom(namespace: any): OpenImagePicker | undefined {
	if (!namespace) return undefined
	if (typeof namespace.openImagePicker === 'function') {
		return namespace.openImagePicker.bind(namespace)
	}
	const inner = namespace.default
	if (inner && typeof inner.openImagePicker === 'function') {
		return inner.openImagePicker.bind(inner)
	}
	return undefined
}

function findAnchor(name: string): number | null {
	try {
		const { filters, lookupModule } = valenced.modules.finders
		const found = lookupModule(filters.withProps(name))
		return typeof found?.[1] === 'number' ? found[1] : null
	} catch {
		return null
	}
}

function scan(): OpenImagePicker | undefined {
	const { filters, lookupModules } = valenced.modules.finders

	for (const anchor of ANCHORS) {
		const id = findAnchor(anchor)
		if (id === null) continue

		try {
			const dependents = filters.withDependencies(
				filters.withDependencies.unordered([id]),
			)
			let scanned = 0
			for (const [namespace] of lookupModules(dependents, {
				initialize: true,
				returnNamespace: true,
			})) {
				if (++scanned > MAX_INITIALIZE) break
				const picker = pickerFrom(namespace)
				if (picker) {
					console.log(
						'[CustomRPC] image picker resolved',
						JSON.stringify({ anchor, id, scanned }),
					)
					return picker
				}
			}
		} catch {}
	}

	console.log(
		'[CustomRPC] image picker unavailable',
		JSON.stringify({ anchors: ANCHORS }),
	)
	return undefined
}

function resolve(): OpenImagePicker | undefined {
	const fromOverride = override?.()
	if (fromOverride) return fromOverride
	if (cached) return cached

	// Already-loaded case: free, and skips the scan entirely.
	try {
		const { filters, lookupModule } = valenced.modules.finders
		for (const name of PICKER_EXPORTS) {
			const picker = pickerFrom(lookupModule(filters.withProps(name))?.[0])
			if (picker) {
				cached = picker
				return picker
			}
		}
	} catch {}

	cached = scan()
	return cached
}

/** Whether a picker is available, to tell a cancellation apart from a failure. */
export function isImagePickerAvailable(): boolean {
	return !!resolve()
}

/** Escape hatch for the shared kmmiio lib, which may bundle its own picker. */
export function setImagePickerOverride(
	getter: (() => OpenImagePicker | undefined) | undefined,
): void {
	override = getter
}

/**
 * Open Discord's native image picker. Resolves to `undefined` when the user
 * cancels or no picker could be resolved; the picker shows its own toasts for
 * cancellations and permission denials.
 */
export async function pickImage(size = 512): Promise<PickedImage | undefined> {
	const openImagePicker = resolve()
	if (!openImagePicker) return undefined

	try {
		return (await openImagePicker({ size })) ?? undefined
	} catch {
		return undefined
	}
}
