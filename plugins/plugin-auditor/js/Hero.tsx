/** The card at the top of the settings: what the last scan found, a risk bar, three counts and the scan button. */

import { Design } from '@valenced/discord/design'
import { Text as NativeText, View } from 'react-native'
import {
	ButtonRow,
	Panel,
	Progress,
	RiskBar,
	RiskLegend,
	RowButton,
	StatTile,
} from './components'
import { RISK_COLOR } from './constants'
import { copy, toast } from './discord'
import { ago, plural } from './format'
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

	return (
		<View style={{ marginHorizontal: 16 }}>
			<Panel
				style={{ gap: 14, padding: 16 }}
				tint={hasResults ? tone.soft : undefined}
			>
				<View style={{ gap: 4 }}>
					<NativeText
						style={{
							fontSize: 22,
							fontWeight: '800',
							color: hasResults && !scanning ? tone.solid : '#8A8F98',
						}}
					>
						{title}
					</NativeText>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{help}
					</Design.Text>
				</View>
				{scanning ? <Progress done={state.done} total={state.total} /> : null}
				{hasResults && !scanning ? (
					<View style={{ gap: 10 }}>
						<RiskBar counts={sum.counts} />
						<RiskLegend counts={sum.counts} />
					</View>
				) : null}
				{hasResults && !scanning ? (
					<View style={{ flexDirection: 'row', gap: 10 }}>
						<StatTile value={String(sum.total)} label="plugins" />
						<StatTile
							value={String(linkCount)}
							label="places linked"
							color={RISK_COLOR.low.solid}
						/>
						<StatTile
							value={String(state.groups.length)}
							label="copies"
							color={
								state.groups.length
									? RISK_COLOR.medium.solid
									: RISK_COLOR.clean.solid
							}
						/>
					</View>
				) : null}
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
			</Panel>
		</View>
	)
}
