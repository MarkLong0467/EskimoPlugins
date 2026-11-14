/** The Copies tab: groups of plugins that look like the same thing. */

import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import { Chip, Heading, Panel } from './components'
import { RISK_COLOR } from './constants'
import { openPluginSheet } from './PluginSheet'
import { auditor } from './store'
import type { DuplicateGroup } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NO_SCAN = 'No scan yet'
const NO_SCAN_HELP = 'Tap Scan now at the top.'
const NONE_TITLE = 'No duplicates found'
const NONE_HELP =
	'No two plugins have the same code, the same name or the same id under different authors, and none does what an option of another one does.'
const WHY_IT_MATTERS =
	'Two copies of one plugin, or a plugin and another plugin\'s option that does the same job, both change the same parts of Discord, so they can fight each other, double what the plugin does, or break one another after an update.'

/** What to do about a group, from why it was found. */
function advice(group: DuplicateGroup): string {
	const nameOf = (id: string) => auditor.scanOf(id)?.plugin.name ?? id
	const overlap = group.overlaps?.[0]
	const copied = group.reasons.some(
		r => r.startsWith('Identical') || r.startsWith('Nearly'),
	)
	if (overlap && !copied)
		return `${nameOf(overlap.plugin)} may not be needed: ${nameOf(overlap.by)} has an option that does the same ("${overlap.option}"). Turn that option on and switch ${nameOf(overlap.plugin)} off. With both on, the job can be done twice.`
	if (group.reasons.some(r => r.startsWith('Identical')))
		return 'These are exactly the same file. Keep one and remove the others.'
	if (group.reasons.some(r => r.startsWith('Nearly')))
		return 'One is almost certainly a copy or an older version of the other. Keep the newest and remove the other.'
	if (group.reasons.includes('Same plugin id from a different author'))
		return 'Same plugin from two authors, such as a fork. Pick the one you trust and remove the other.'
	if (group.reasons.includes('Same name'))
		return 'They share a name but not code. They may do the same job: check whether you need both.'
	return 'They look related. Check whether you need both.'
}

const CONFIDENCE = {
	high: { text: 'SURE', ...RISK_COLOR.high },
	medium: { text: 'LIKELY', ...RISK_COLOR.medium },
	low: { text: 'MAYBE', ...RISK_COLOR.low },
} as const

/** The Copies tab. */
export function CopiesTab() {
	const state = auditor.state()
	if (state.scans.length === 0) {
		return (
			<Design.TableRowGroup>
				<Design.TableRow label={NO_SCAN} subLabel={NO_SCAN_HELP} />
			</Design.TableRowGroup>
		)
	}
	if (state.groups.length === 0) {
		return (
			<Design.TableRowGroup>
				<Design.TableRow label={NONE_TITLE} subLabel={NONE_HELP} />
			</Design.TableRowGroup>
		)
	}
	return (
		<View style={{ marginHorizontal: 16, gap: 14 }}>
			<Design.Text variant="text-sm/medium" color="text-muted">
				{WHY_IT_MATTERS}
			</Design.Text>
			{state.groups.map(group => {
				const c = CONFIDENCE[group.confidence]
				return (
					<Panel
						key={group.members.join('|')}
						tint={c.soft}
						style={{ gap: 10 }}
					>
						<View style={{ gap: 6 }}>
							<Heading text={c.text} />
							<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
								{group.reasons.map(r => (
									<Chip key={r} text={r} />
								))}
							</View>
						</View>
						<Design.TableRowGroup>
							{group.members.map(id => {
								const scan = auditor.scanOf(id)
								return (
									<Design.TableRow
										key={id}
										label={scan?.plugin.name ?? id}
										subLabel={
											scan
												? `v${scan.plugin.version} · ${scan.plugin.author}${scan.plugin.repo ? '' : ' · sideloaded'}`
												: id
										}
										arrow
										onPress={() => openPluginSheet(id)}
									/>
								)
							})}
						</Design.TableRowGroup>
						<Design.Text variant="text-sm/medium">{advice(group)}</Design.Text>
					</Panel>
				)
			})}
		</View>
	)
}
