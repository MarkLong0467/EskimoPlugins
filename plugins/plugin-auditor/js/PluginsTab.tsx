/** The Plugins tab: every scanned plugin, worst first, with a filter by risk and one by what the plugin can do. */

import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { FilterRow, Heading, RiskBadge } from './components'
import { plural } from './format'
import { openPluginSheet } from './PluginSheet'
import { CATEGORY_LABEL } from './rules'
import { needsAttention } from './scan'
import { auditor } from './store'
import type { Category, PluginScan } from './types'

type Filter = 'attention' | 'all' | 'review' | 'clean'
type Capability = 'any' | Category

/** Texts as constants because React Native text must be passed as an expression. */
const NOTHING_ATTENTION = 'Nothing needs attention'
const NOTHING_HELP = 'Pick All to see every plugin.'
const NOTHING_CAPABILITY = 'No plugin matches'
const NOTHING_CAPABILITY_HELP = 'Try another risk filter above.'
const NO_SCAN = 'No scan yet'
const NO_SCAN_HELP = 'Tap Scan now at the top.'
const CAPABILITY_HELP = 'Plugins that can:'

/** The categories offered as "what can it do" choices, in this order. */
const CAPABILITIES: readonly Category[] = [
	'token',
	'write',
	'network',
	'code',
	'device',
	'plugins',
	'obfuscation',
	'exfil',
]

/** The second line of a plugin's row: the worst thing found (in the chosen category if one is), or that nothing was. */
function subtitle(
	scan: PluginScan,
	accepted: boolean,
	capability: Capability,
): string {
	const p = scan.plugin
	const facts = `v${p.version} · ${p.author}`
	const inCategory =
		capability === 'any'
			? undefined
			: scan.findings.find(f => f.category === capability)
	const top =
		inCategory?.title ?? scan.combos[0]?.title ?? scan.findings[0]?.title
	if (!top) return `${facts} · ${scan.problem ? 'no code' : 'nothing found'}`
	const more = scan.findings.length > 1 ? ` +${scan.findings.length - 1}` : ''
	return `${facts}\n${accepted ? 'Accepted · ' : ''}${top}${more}`
}

/** Whether a plugin passes the risk filter. */
function passes(filter: Filter, scan: PluginScan, accepted: boolean): boolean {
	if (filter === 'all') return true
	if (filter === 'attention') return needsAttention(scan, accepted)
	if (filter === 'review') return scan.risk === 'medium' || scan.risk === 'low'
	return scan.risk === 'clean'
}

/** Whether a plugin has a finding in the category chosen. */
function can(capability: Capability, scan: PluginScan): boolean {
	return (
		capability === 'any' || scan.findings.some(f => f.category === capability)
	)
}

/** The Plugins tab. */
export function PluginsTab() {
	const state = auditor.state()
	const [filter, setFilter] = useState<Filter>('attention')
	const [capability, setCapability] = useState<Capability>('any')
	if (state.scans.length === 0) {
		return (
			<Design.TableRowGroup>
				<Design.TableRow label={NO_SCAN} subLabel={NO_SCAN_HELP} />
			</Design.TableRowGroup>
		)
	}

	const rows = state.scans.map(scan => ({
		scan,
		accepted: auditor.isTrusted(scan),
	}))
	const count = (f: Filter) =>
		rows.filter(
			({ scan, accepted }) =>
				passes(f, scan, accepted) && can(capability, scan),
		).length
	const shown = rows.filter(
		({ scan, accepted }) =>
			passes(filter, scan, accepted) && can(capability, scan),
	)
	// Only categories that at least one plugin has, with how many, so the row never offers an empty choice.
	const offered = CAPABILITIES.map(category => ({
		id: category as Capability,
		label: `${CATEGORY_LABEL[category]} ${rows.filter(r => passes(filter, r.scan, r.accepted) && can(category, r.scan)).length}`,
		total: rows.filter(r => can(category, r.scan)).length,
	})).filter(c => c.total > 0)

	return (
		<View style={{ gap: 16 }}>
			<View style={{ marginHorizontal: 16, gap: 12 }}>
				<FilterRow<Filter>
					value={filter}
					onChange={setFilter}
					choices={[
						{ id: 'attention', label: `Attention ${count('attention')}` },
						{ id: 'review', label: `Worth a look ${count('review')}` },
						{ id: 'clean', label: `Clean ${count('clean')}` },
						{ id: 'all', label: `All ${count('all')}` },
					]}
				/>
				{offered.length > 0 ? (
					<View style={{ gap: 6 }}>
						<Heading text={CAPABILITY_HELP} />
						<FilterRow<Capability>
							value={capability}
							onChange={next =>
								setCapability(next === capability ? 'any' : next)
							}
							choices={offered.map(c => ({ id: c.id, label: c.label }))}
						/>
					</View>
				) : null}
			</View>
			{shown.length === 0 ? (
				<Design.TableRowGroup>
					<Design.TableRow
						label={
							capability === 'any' ? NOTHING_ATTENTION : NOTHING_CAPABILITY
						}
						subLabel={
							capability === 'any' ? NOTHING_HELP : NOTHING_CAPABILITY_HELP
						}
					/>
				</Design.TableRowGroup>
			) : (
				<Design.TableRowGroup title={plural(shown.length, 'plugin')}>
					{shown.map(({ scan, accepted }) => (
						<Design.TableRow
							key={scan.plugin.id}
							label={scan.plugin.name}
							subLabel={subtitle(scan, accepted, capability)}
							subLabelLineClamp={2}
							trailing={<RiskBadge risk={scan.risk} />}
							arrow
							onPress={() => openPluginSheet(scan.plugin.id)}
						/>
					))}
				</Design.TableRowGroup>
			)}
			{state.notes.length > 0 ? (
				<View style={{ marginHorizontal: 16 }}>
					<Heading text="Notes" />
					{state.notes.map(n => (
						<Design.Text key={n} variant="text-xs/medium" color="text-muted">
							{n}
						</Design.Text>
					))}
				</View>
			) : null}
		</View>
	)
}
