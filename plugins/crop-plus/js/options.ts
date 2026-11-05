import { setting } from './config'
import { dims } from './format'
import type { CropOptions, CropResult } from './types'

/** Whether this crop is one the plugin should work on. Discord's "Edit image" crop is the free-style one. */
export function inScope(options: CropOptions | undefined): boolean {
	if (!setting('enabled')) return false
	return setting('scope') === 'everywhere' || !!options?.freeStyleCropEnabled
}

/**
 * The options for the cropper: Discord's, changed by the settings. A copy: the object Discord passed is not touched.
 *
 * @param options Discord's options.
 * @param previous The result of an earlier pass when this is a later one. Then the picture to crop is that result
 *   and the starting shape follows its size instead of the original's.
 * @param pass The number of this crop, used in the title.
 */
export function tuneOptions(
	options: CropOptions,
	previous: CropResult | null,
	pass?: number,
): CropOptions {
	const next: CropOptions = { ...options }
	if (previous) {
		next.path = previous.path
		next.uri = undefined
		next.width = previous.width || undefined
		next.height = previous.height || undefined
	}
	if (previous && pass && setting('titles'))
		next.cropperToolbarTitle = `Crop ${pass} · ${dims(previous)}`
	if (setting('freeStyle')) next.freeStyleCropEnabled = true

	const ratio = setting('ratio')
	if (ratio === 'free') {
		next.width = undefined
		next.height = undefined
	} else if (ratio !== 'discord') {
		const [w, h] = String(ratio).split(':').map(Number)
		if (w > 0 && h > 0) {
			next.width = w * 1000
			next.height = h * 1000
		}
	}

	next.showCropGuidelines = !!setting('guidelines')
	next.showCropFrame = !!setting('frame')
	next.enableRotationGesture = !!setting('rotation')
	next.hideBottomControls = !setting('bottomControls')

	const maxWidth = Number(setting('maxWidth')) || 0
	const maxHeight = Number(setting('maxHeight')) || 0
	if (maxWidth > 0) next.compressImageMaxWidth = maxWidth
	if (maxHeight > 0) next.compressImageMaxHeight = maxHeight
	const quality = Number(setting('quality')) || 100
	if (quality < 100) next.compressImageQuality = quality / 100
	return next
}

/** The options without the colors and texts (`cropper...`), and with long strings cut short, for the report. */
export function plainOptions(
	options: CropOptions | undefined,
): Record<string, unknown> {
	const keep: Record<string, unknown> = {}
	for (const key of Object.keys(options || {})) {
		if (/^cropper/.test(key)) continue
		const value = options?.[key]
		keep[key] =
			typeof value === 'string' && value.length > 60
				? `${value.slice(0, 40)}...`
				: value
	}
	return keep
}
