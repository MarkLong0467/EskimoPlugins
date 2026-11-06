export function waitForGuildsBarGuildMenu(
	callback: (ns: any) => void,
): () => void {
	let fired = false
	const once = (exports: any) => {
		if (fired) return
		const ns = exports?.default !== undefined ? exports : { default: exports }
		if (typeof ns.default !== 'function') return
		fired = true
		try {
			callback(ns)
		} catch {}
	}
	try {
		const { getModules, filters } = valenced.modules.finders
		return getModules(
			filters.withName('getGuildsBarGuildMenuItems'),
			(exports: any) => once(exports),
			{ returnNamespace: true },
		)
	} catch {}
	return () => {
		fired = true
	}
}
