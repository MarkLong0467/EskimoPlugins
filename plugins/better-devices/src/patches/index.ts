import { transformCheckboxCapture } from './headerPatch'
import { installJsxTransformers } from './jsxRuntime'
import {
	transformSessionRow,
	transformUnknownSessionRow,
} from './sessionRowPatch'
import {
	transformRemoveSessionsDescription,
	transformSessionsList,
} from './sessionsListPatch'
import { transformYouBar } from './youBarPatch'

export function installSessionPatches(
	cleanups: (fn: () => void) => void,
): boolean {
	const ok = installJsxTransformers(cleanups, [
		transformCheckboxCapture,
		transformSessionRow,
		transformUnknownSessionRow,
		transformRemoveSessionsDescription,
		transformSessionsList,
		transformYouBar,
	])
	if (!ok) return false

	return true
}
