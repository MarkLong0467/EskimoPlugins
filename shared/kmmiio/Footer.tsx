import { Design } from '@valenced/discord/design'
import { AboutCard } from './About'
import { DebugSection } from './Debug'
import type { Diagnostics } from './diagnostics'

/**
 * The bottom of every ported plugin's settings: the credit for kmmiio99o, then the debugging section.
 *
 * @param diag The diagnostics of the plugin whose settings this is.
 */
export function KmmiioFooter({ diag }: { diag: Diagnostics }) {
	const { name, version } = diag.info()
	return (
		<Design.Stack spacing={22}>
			<AboutCard name={name} version={version} />
			<DebugSection diag={diag} />
		</Design.Stack>
	)
}
