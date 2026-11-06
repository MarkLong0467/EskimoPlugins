import { byImported } from '../lib/modules'

const TAG = '[ServerDrawer.Experiment]'
const MODULE_PATH = 'modules/home_drawer/native/HomeDrawerExperiment.tsx'

// Discord's internal "expandable server drawer" (NavI) experiment. Forcing it
// off keeps Discord's own HomeDrawer from rendering on top of this plugin's
// drawer.
const DISABLED_CONFIG = {
	enableHome: false,
	landOnHome: false,
	enablePeekHint: false,
}

export function patchHomeDrawerExperiment(
	cleanups: (fn: () => void) => void,
): boolean {
	let patched = false

	const bind = (ns: any) => {
		if (patched) return
		try {
			const experiment = ns?.MobileHomeDrawerExperiment
			if (typeof experiment?.getConfig !== 'function') return
			patched = true
			for (const method of ['getConfig', 'useConfig'] as const) {
				if (typeof experiment[method] !== 'function') continue
				cleanups(
					valenced.patcher.instead(experiment, method, () => DISABLED_CONFIG),
				)
			}
			console.log(TAG, 'PATCH: MobileHomeDrawerExperiment disabled')
		} catch {
			// ignore
		}
	}

	try {
		bind(byImported(MODULE_PATH))
	} catch {
		// ignore
	}

	try {
		valenced.discord.utils.modules.finders.getModuleWithImportedPath(
			MODULE_PATH,
			(ns: any) => bind(ns),
		)
	} catch {
		// ignore
	}

	return patched
}
