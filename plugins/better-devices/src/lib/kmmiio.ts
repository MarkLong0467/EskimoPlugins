import { KmmiioLib } from '../../../../shared/kmmiio/lib/api'

let lib: any = KmmiioLib

export function bindKmmiio(api: any): void {
	// The library is bundled into this plugin, so there is nothing to look up.
	void api
	lib = KmmiioLib
}

// Resolved lazily so late-loaded lib plugin instances still get picked up.
export function kmmiio(): any {
	return lib
}
