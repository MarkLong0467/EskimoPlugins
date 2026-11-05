import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { setting } from './config'
import { VERSION } from './constants'
import { toast } from './format'
import { hooks, run, stats } from './state'
import type { Check } from './types'

/** Checks the plugin's own parts and says what works. Shown on the settings screen. */
export function runSelfCheck(): Check[] {
	const out: Check[] = []
	const add = (ok: boolean, label: string, detail?: string) =>
		out.push({ ok, label, detail })
	add(
		hooks.cropper === 'found',
		'Found the cropper',
		hooks.cropper === 'found'
			? 'openCropper is wrapped'
			: 'Open a picture’s crop once, then run this again',
	)
	add(
		!!ActionSheetActionCreators,
		'Can show the "crop again" sheet',
		'ActionSheetActionCreators',
	)
	add(
		stats.crops > 0,
		'A crop has been done',
		stats.crops > 0
			? `${stats.crops} crop(s), ${stats.passes} pass(es), ${stats.extra} extra`
			: 'Add a picture, tap it, choose Edit image and crop it',
	)
	if (run.lastOptions)
		add(
			true,
			'Options the cropper got last time',
			JSON.stringify(run.lastOptions),
		)
	if (run.lastResults.length)
		add(true, 'Passes of the last crop', run.lastResults.join(' → '))
	return out
}

/** A plain text report of the settings, what was found, the counters and the last crop, for pasting into a chat. */
export function buildReport(): string {
	return [
		'Crop Plus report',
		`version: ${VERSION}`,
		`enabled: ${setting('enabled')}; scope: ${setting('scope')}; offer again: ${setting('again')} (${setting('mode')}, target ${setting('targetPx')}px); most passes: ${setting('maxPasses')}; ask above: ${setting('askAbove')}`,
		`shape: ${setting('ratio')}; free ${setting('freeStyle')}; grid ${setting('guidelines')}; frame ${setting('frame')}; rotation ${setting('rotation')}; bottom controls ${setting('bottomControls')}`,
		`shrink: ${setting('maxWidth') || '-'} x ${setting('maxHeight') || '-'}; quality ${setting('quality')}%; clean ${setting('cleanTemp')}`,
		`hooks: cropper ${hooks.cropper}; patched: ${hooks.patched.join(', ') || '-'}`,
		`crops ${stats.crops}, passes ${stats.passes}, extra passes ${stats.extra}, cancelled ${stats.cancelled}, skipped sheet ${stats.skipped}`,
		run.lastOptions
			? `last options: ${JSON.stringify(run.lastOptions)}`
			: 'last options: none yet',
		run.lastResults.length
			? `last passes: ${run.lastResults.join(' -> ')}`
			: 'last passes: none yet',
		hooks.problems.length ? `problems: ${hooks.problems.join(' | ')}` : '',
	]
		.filter(Boolean)
		.join('\n')
}

/** Copies the report to the clipboard and says so. */
export function copyReport(): void {
	try {
		Clipboard.setString(buildReport())
		toast('Report copied. Paste it in the chat.')
	} catch {
		toast('Could not copy')
	}
}
