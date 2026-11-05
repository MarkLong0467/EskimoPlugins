import { askAgain } from './ask'
import { setting } from './config'
import { AUTO_DELAY_MS, CANCELLED, REOPEN_DELAY_MS } from './constants'
import { dims, longestSide, sizeText, sleep, toast } from './format'
import { plainOptions, tuneOptions } from './options'
import { addLog, run, stats } from './state'
import type { CropOptions, CropperHolder, CropResult } from './types'

/** An error like the one the cropper throws when the person cancels, so Discord treats it as a normal cancel. */
function cancelError(): Error {
	const error = new Error('User cancelled image selection') as Error & {
		code?: string
	}
	error.code = CANCELLED
	return error
}

/** One pass of the cropper. A cancel is returned as null, not thrown. */
async function onePass(
	holder: CropperHolder,
	original: CropperHolder['openCropper'],
	options: CropOptions,
): Promise<CropResult | null> {
	try {
		return await Reflect.apply(original, holder, [options])
	} catch (error) {
		if ((error as { code?: string } | undefined)?.code === CANCELLED)
			return null
		throw error
	}
}

/** Deletes the picture of one pass. */
function cleanOne(holder: CropperHolder, result: CropResult | undefined): void {
	try {
		if (result?.path && typeof holder.cleanSingle === 'function')
			holder.cleanSingle(result.path)
	} catch {
		// A leftover picture in the cache does no harm.
	}
}

/** Deletes the pictures of all passes except `keep`. */
function cleanAll(
	holder: CropperHolder,
	stack: CropResult[],
	keep: CropResult | null,
): void {
	for (const result of stack) if (result !== keep) cleanOne(holder, result)
}

/** Said once per start of Discord, when the first crop opens. */
function showTip(): void {
	if (run.tipShown || !setting('tips') || !setting('again')) return
	run.tipShown = true
	toast(
		setting('mode') === 'auto'
			? 'Crop Plus: pick an area and tap the check mark. The cropper opens again on the result. Tap the X when it is small enough. Tip: pinch to zoom in first.'
			: 'Crop Plus: pick an area and tap the check mark. A sheet then offers to crop smaller. Tip: pinch to zoom in first.',
	)
}

/** Whether the sheet should be shown after this pass. */
function wantsAnother(
	result: CropResult,
	passes: number,
	limit: number,
): boolean {
	if (!setting('again')) {
		stats.skipped += 1
		return false
	}
	if (passes >= limit) {
		addLog(`Stopped after ${limit} crops (the limit in the settings)`)
		return false
	}
	const above = Number(setting('askAbove')) || 0
	const longest = longestSide(result)
	if (above > 0 && longest > 0 && longest <= above) {
		stats.skipped += 1
		return false
	}
	return true
}

/**
 * Runs the cropper, and again on its result while the person asks for it.
 *
 * Each pass is a crop of the result of the pass before, so the passes add up. After a pass either a sheet asks what to
 * do (mode `ask`) or the cropper opens again at once (mode `auto`) until the picture is small enough, the limit of
 * passes is reached, or the person cancels (which keeps the last result). Cancelling the very first pass is a real
 * cancel and is passed on to Discord.
 *
 * @param holder The module that has `openCropper`.
 * @param original The cropper itself.
 * @param args What Discord called the cropper with; the first is its options.
 * @returns The last pass, in the form Discord expects (`path`, `width`, `height`, `mime`, `size`, `cropRect`).
 */
export async function cropWithPasses(
	holder: CropperHolder,
	original: CropperHolder['openCropper'],
	args: unknown[],
): Promise<CropResult> {
	const options = (args[0] as CropOptions | undefined) || {}
	const stack: CropResult[] = [] // results of the passes so far; stack[0] is the first pass
	const limit = Math.max(1, Number(setting('maxPasses')) || 1)
	run.lastOptions = plainOptions(tuneOptions(options, null))
	run.lastResults = []
	stats.crops += 1

	let crop = true // false after "go back": the sheet is shown again for the earlier result
	for (;;) {
		if (crop) {
			if (!stack.length) showTip()
			const result = await onePass(
				holder,
				original,
				tuneOptions(
					options,
					stack.length ? stack[stack.length - 1] : null,
					stack.length + 1,
				),
			)
			if (!result) {
				// Cancelled. On the first pass that is a real cancel. Later it means "keep what I had".
				if (!stack.length) {
					stats.cancelled += 1
					addLog('Crop cancelled')
					throw cancelError()
				}
				addLog('Cancelled the extra crop, kept the last result')
				break
			}
			stats.passes += 1
			if (stack.length) stats.extra += 1
			stack.push(result)
			run.lastResults.push(`${dims(result)} ${sizeText(result.size)}`.trim())
			if (
				Number(setting('quality')) < 100 ||
				Number(setting('maxWidth')) > 0 ||
				Number(setting('maxHeight')) > 0
			)
				stats.shrunk += 1
		}

		if (crop && setting('again') && setting('mode') === 'auto') {
			// No sheet: open the cropper again at once until the picture is small enough. Cancelling the cropper keeps the last result.
			const last = stack[stack.length - 1]
			const longest = longestSide(last)
			if (longest > 0 && longest <= (Number(setting('targetPx')) || 256)) {
				addLog(`Small enough: ${dims(last)}`)
				break
			}
			if (stack.length >= limit) {
				addLog(`Stopped after ${limit} crops (the limit in the settings)`)
				break
			}
			toast(
				`Crop ${stack.length + 1}: now ${dims(last)}. Pick a smaller part, or Cancel to keep this.`,
			)
			await sleep(AUTO_DELAY_MS)
			continue
		}

		if (crop && !wantsAnother(stack[stack.length - 1], stack.length, limit))
			break
		const choice = await askAgain(stack)
		if (choice === 'done') break
		if (choice === 'cancel') {
			cleanAll(holder, stack, null)
			stats.cancelled += 1
			addLog('Crop cancelled from the sheet')
			throw cancelError()
		}
		if (choice === 'undo' && stack.length > 1) {
			cleanOne(holder, stack.pop())
			crop = false
			continue
		}
		if (stack.length >= limit) {
			addLog(`Stopped after ${limit} crops (the limit in the settings)`)
			break
		}
		crop = true
		await sleep(REOPEN_DELAY_MS) // the native cropper screen needs a moment to be gone before it can open again
	}

	const final = stack[stack.length - 1]
	if (setting('cleanTemp')) cleanAll(holder, stack, final)
	addLog(
		`Crop done: ${stack.length} pass${stack.length === 1 ? '' : 'es'}, ${dims(final)} ${sizeText(final.size)}`.trim(),
	)
	return final
}
