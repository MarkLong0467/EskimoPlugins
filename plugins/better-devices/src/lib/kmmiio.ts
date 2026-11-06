let lib: any

export function bindKmmiio(api: any): void {
	let resolved: any
	try {
		resolved = api?.unscoped?.kmmiio
	} catch {
		resolved = undefined
	}
	if (resolved != null) lib = resolved
}

// Resolved lazily so late-loaded lib plugin instances still get picked up.
export function kmmiio(): any {
	return lib
}
