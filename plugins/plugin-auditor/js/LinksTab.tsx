/** The Links tab: every place the plugins' code links to, with who uses it. */

import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { ButtonRow, KindBadge, RowButton, StatTile } from './components'
import { saveSettings, setting } from './config'
import { RISK_COLOR } from './constants'
import { copy, toast } from './discord'
import { plural, verdictLine } from './format'
import { openHostSheet } from './HostSheet'
import { auditor } from './store'

/** Texts as constants because React Native text must be passed as an expression. */
const NO_SCAN = 'No scan yet'
const NO_SCAN_HELP = 'Tap Scan now at the top.'
const NO_LINKS = 'No links found'
const NO_LINKS_HELP =
	'None of the scanned plugins has a link written out in its code.'

/** The second line of a place's row: how many links and who uses them. */
function users(plugins: readonly string[]): string {
	const names = plugins.slice(0, 2).map(auditor.nameOf)
	const rest = plugins.length - names.length
	return `${names.join(', ')}${rest > 0 ? ` +${rest}` : ''}`
}

/** The Links tab. */
export function LinksTab() {
	const state = auditor.state()
	const [busy, setBusy] = useState(false)
	if (state.scans.length === 0) {
		return (
			<Design.TableRowGroup>
				<Design.TableRow label={NO_SCAN} subLabel={NO_SCAN_HELP} />
			</Design.TableRowGroup>
		)
	}

	const hideNoise = !!setting('hideNoise')
	const hosts = auditor.hosts(!hideNoise)
	const risky = hosts.filter(h => h.kind === 'risky').length
	const unknown = hosts.filter(h => h.kind === 'unknown').length
	const total = hosts.reduce((sum, h) => sum + h.urls.length, 0)

	return (
		<View style={{ gap: 16 }}>
			<View style={{ marginHorizontal: 16, flexDirection: 'row', gap: 10 }}>
				<StatTile
					value={String(hosts.length)}
					label="places"
					color={RISK_COLOR.low.solid}
				/>
				<StatTile
					value={String(unknown)}
					label="unknown"
					color={unknown ? RISK_COLOR.medium.solid : RISK_COLOR.clean.solid}
				/>
				<StatTile
					value={String(risky)}
					label="risky"
					color={risky ? RISK_COLOR.critical.solid : RISK_COLOR.clean.solid}
				/>
			</View>
			<View style={{ marginHorizontal: 16 }}>
				<ButtonRow>
					<RowButton
						text={`Copy ${plural(total, 'link')}`}
						variant="secondary"
						disabled={total === 0}
						onPress={() =>
							toast(
								copy(auditor.linkList(hosts))
									? 'Links copied'
									: 'Could not copy',
							)
						}
					/>
					{auditor.hasKey() && setting('vtDomains') ? (
						<RowButton
							text={busy ? 'Checking…' : 'Check unknown'}
							variant="secondary"
							disabled={busy}
							onPress={async () => {
								setBusy(true)
								try {
									const line = await auditor.checkUnknownDomains()
									toast(line ?? 'Everything is already checked')
								} finally {
									setBusy(false)
								}
							}}
						/>
					) : null}
				</ButtonRow>
			</View>
			<Design.TableRowGroup>
				<Design.TableSwitchRow
					label="Hide links from libraries"
					subLabel="Standards pages and documentation links that code libraries carry."
					value={hideNoise}
					onValueChange={(value: boolean) =>
						saveSettings({ hideNoise: !!value })
					}
				/>
			</Design.TableRowGroup>
			{hosts.length === 0 ? (
				<Design.TableRowGroup>
					<Design.TableRow label={NO_LINKS} subLabel={NO_LINKS_HELP} />
				</Design.TableRowGroup>
			) : (
				<Design.TableRowGroup title={plural(hosts.length, 'place')}>
					{hosts.map(h => {
						const verdict = auditor.domainVerdict(h.host)
						const line = verdict ? verdictLine(verdict) : undefined
						const mark = line
							? line.level === 'bad' || line.level === 'warn'
								? ' · ✗ VirusTotal'
								: ' · ✓ VirusTotal'
							: ''
						return (
							<Design.TableRow
								key={h.host}
								label={h.host}
								labelLineClamp={1}
								subLabel={`${plural(h.urls.length, 'link')} · ${users(h.plugins)}${mark}`}
								subLabelLineClamp={2}
								trailing={<KindBadge kind={h.kind} />}
								arrow
								onPress={() => openHostSheet(h.host)}
							/>
						)
					})}
				</Design.TableRowGroup>
			)}
		</View>
	)
}
