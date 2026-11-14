/** The card at the top of the settings: what the last scan found, a risk bar, three counts and the scan button. */

import { Design } from '@valenced/discord/design'
import { ButtonRow, Panel, RowButton } from './components'
import { RISK_COLOR } from './constants'
import { copy, toast } from './discord'
import { ago, plural } from './format'
import { RISK_LABEL } from './scan'
import { auditor } from './store'
import type { Risk } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const IDLE_TITLE = 'Check your plugins'
const IDLE_HELP =
	'Reads the code of every installed plugin for signs that it can reach your token, change things on your account, run downloaded code or send data out. Nothing is run.'
const FAILED_TITLE = 'The scan could not run'

/** The worst risk among plugins that need looking at. */
function worst(counts: Record<Risk, number>): Risk {
	for (const r of ['critical', 'high', 'medium', 'low'] as const)
		if (counts[r] > 0) return r
	return 'clean'
}

/** The top card of the settings. */
export function Hero() {
	const state = auditor.state()
	const sum = auditor.summary()
	const scanning = state.status === 'scanning'
	const hasResults = state.scans.length > 0
	// Accepted plugins are not a problem, so the colour follows the plugins that still need attention, then the milder ones.
	const tone =
		RISK_COLOR[
			sum.attention > 0
				? worst(sum.counts)
				: sum.counts.medium > 0
					? 'medium'
					: 'clean'
		]
	const linkCount = auditor.hosts(false).length

	let title = IDLE_TITLE
	let help = IDLE_HELP
	if (scanning) {
		title = `Scanning ${state.done} of ${state.total || '…'}`
		help = state.current
	} else if (state.status === 'failed') {
		title = FAILED_TITLE
		help = `${state.error ?? 'Unknown problem'}. Copy the logs at the bottom and send them if this keeps happening.`
	} else if (hasResults) {
		title =
			sum.attention > 0
				? `${plural(sum.attention, 'plugin')} need${sum.attention === 1 ? 's' : ''} attention`
				: 'No serious problems found'
		help = `${plural(sum.total, 'plugin')} scanned ${ago(state.finishedAt)}${state.via ? ` · ${state.via}` : ''}`
	}

	const legend = (['critical', 'high', 'medium', 'low', 'clean'] as const)
		.filter(r => sum.counts[r] > 0)
		.map(r => `${sum.counts[r]} ${RISK_LABEL[r].toLowerCase()}`)
		.join(' · ')

	const counts = `${plural(sum.total, 'plugin')} · ${plural(linkCount, 'place')} linked · ${plural(state.groups.length, 'copy')}`

	return (
		<Design.Stack spacing={16}>
			<Design.Stack style={{ paddingHorizontal: 16 }}>
				<Panel style={{ gap: 6, padding: 16 }}>
					<Design.Text
						variant="heading-md/bold"
						style={hasResults && !scanning ? { color: tone.solid } : undefined}
					>
						{title}
					</Design.Text>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{help}
					</Design.Text>
					{hasResults && !scanning ? (
						<Design.Text variant="text-sm/semibold">{legend}</Design.Text>
					) : null}
					{hasResults && !scanning ? (
						<Design.Text variant="text-sm/medium" color="text-muted">
							{counts}
						</Design.Text>
					) : null}
				</Panel>
			</Design.Stack>
			<Design.Stack style={{ paddingHorizontal: 16 }}>
				<ButtonRow>
					<RowButton
						text={
							scanning ? 'Scanning…' : hasResults ? 'Scan again' : 'Scan now'
						}
						variant="primary"
						disabled={scanning}
						onPress={() => {
							void auditor.scan()
						}}
					/>
					{hasResults ? (
						<RowButton
							text="Copy report"
							variant="secondary"
							onPress={() =>
								toast(
									copy(auditor.report()) ? 'Report copied' : 'Could not copy',
								)
							}
						/>
					) : null}
				</ButtonRow>
			</Design.Stack>
		</Design.Stack>
	)
}
