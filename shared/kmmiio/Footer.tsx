import { DebugSection } from './Debug'
import type { Diagnostics } from './diagnostics'

/**
 * The bottom of every ported plugin's settings: the debugging section.
 *
 * The credit for kmmiio99o is not here. It is in each plugin's manifest (`author` and `contributors`), which is where
 * Valenced shows credits.
 *
 * @param diag The diagnostics of the plugin whose settings this is.
 */
export function KmmiioFooter({ diag }: { diag: Diagnostics }) {
	return <DebugSection diag={diag} />
}
