/** The sheet for one plugin: why it got its risk, everything that was found, its links, and the VirusTotal check. */

import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import {
	ButtonRow,
	Chip,
	FindingCard,
	Heading,
	KindBadge,
	Panel,
	RiskBadge,
	RowButton,
} from './components'
import { PLUGIN_SHEET_KEY, RISK_COLOR } from './constants'
import { diag } from './diag'
import { copy, sheets, toast } from './discord'
import { plural, sizeText } from './format'
import { CATEGORY_LABEL } from './rules'
import { auditor } from './store'
import { PluginVt } from './VtBlock'

/** Texts as constants because React Native text must be passed as an expression. */
const GONE = 'This plugin is not in the last scan.'
const CLEAN = 'Nothing sensitive was found in its code.'
const NO_CODE =
	'Valenced gave no code for this plugin, so only its manifest was read.'

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(PLUGIN_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/** Opens the sheet for one plugin. */
export function openPluginSheet(id: string): void {
	try {
		sheets().openLazy(
			Promise.resolve({ default: () => <PluginSheet id={id} /> }),
			PLUGIN_SHEET_KEY,
			{},
		)
	} catch (error) {
		diag.fail('sheet', error)
	}
}

/** The sheet for one plugin. */
function PluginSheet({ id }: { id: string }) {
	const [, redraw] = useState(0)
	useEffect(() => auditor.subscribe(() => redraw(n => n + 1)), [])
	const scan = auditor.scanOf(id)

	if (!scan) {
		return (
			<Design.ActionSheet>
				<View style={{ padding: 16, gap: 12 }}>
					<Design.Text variant="text-md/medium">{GONE}</Design.Text>
					<Design.Button text="Close" variant="secondary" onPress={close} />
				</View>
			</Design.ActionSheet>
		)
	}

	const p = scan.plugin
	const trusted = auditor.isTrusted(scan)
	const links = scan.links.filter(l => l.kind !== 'noise')
	const color = RISK_COLOR[scan.risk]
	const facts = `${p.id} · v${p.version} · ${p.author}`
	const acceptHelp = `"I checked it" stops this plugin from counting as a problem. It is asked again if the plugin's code changes. ${plural(scan.findings.length, 'finding')} stay listed.`

	return (
		<Design.ActionSheet>
			<ScrollView
				style={{ maxHeight: 640 }}
				contentContainerStyle={{ padding: 16, gap: 14 }}
			>
				<View style={{ gap: 6 }}>
					<View
						style={{
							flexDirection: 'row',
							alignItems: 'center',
							justifyContent: 'space-between',
							gap: 10,
						}}
					>
						<View style={{ flex: 1 }}>
							<Design.Text variant="heading-lg/bold">{p.name}</Design.Text>
						</View>
						<RiskBadge risk={scan.risk} big />
					</View>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{facts}
					</Design.Text>
					<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
						{p.internal ? <Chip text="BUILT-IN" /> : null}
						{p.repo ? (
							<Chip text="FROM A REPOSITORY" />
						) : (
							<Chip text="SIDELOADED" />
						)}
						{p.native ? <Chip text="NATIVE PART" /> : null}
						{trusted ? <Chip text="ACCEPTED BY YOU" /> : null}
						<Chip text={scan.sha256 ? sizeText(scan.size) : 'NO CODE'} />
					</View>
				</View>

				{scan.problem ? (
					<Panel tint={RISK_COLOR.medium.soft}>
						<Design.Text variant="text-sm/medium">{NO_CODE}</Design.Text>
					</Panel>
				) : null}

				{scan.combos.map(combo => (
					<Panel
						key={combo.id}
						tint={RISK_COLOR[combo.severity].soft}
						style={{ gap: 4 }}
					>
						<Design.Text variant="text-md/bold">{combo.title}</Design.Text>
						<Design.Text variant="text-sm/medium">{combo.why}</Design.Text>
					</Panel>
				))}

				{scan.findings.length === 0 && !scan.problem ? (
					<Panel tint={color.soft}>
						<Design.Text variant="text-md/medium">{CLEAN}</Design.Text>
					</Panel>
				) : null}

				{scan.findings.length > 0 ? (
					<View style={{ gap: 10 }}>
						<Heading text={`Findings · ${scan.findings.length}`} />
						{scan.findings.map(f => (
							<View key={f.rule} style={{ gap: 4 }}>
								<Design.Text variant="text-xs/bold" color="text-muted">
									{CATEGORY_LABEL[f.category].toUpperCase()}
								</Design.Text>
								<FindingCard finding={f} />
							</View>
						))}
					</View>
				) : null}

				{links.length > 0 ? (
					<View style={{ gap: 8 }}>
						<Heading text={`Links · ${links.length}`} />
						{links.map(link => (
							<View
								key={link.url}
								style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
							>
								<View style={{ flex: 1 }}>
									<Design.Text variant="text-sm/medium" lineClamp={2}>
										{link.dynamic ? `${link.url}…` : link.url}
									</Design.Text>
								</View>
								<KindBadge kind={link.kind} />
							</View>
						))}
					</View>
				) : null}

				<PluginVt scan={scan} />

				<View style={{ gap: 10 }}>
					<ButtonRow>
						<RowButton
							text="Copy report"
							variant="secondary"
							onPress={() =>
								toast(
									copy(auditor.reportFor(scan))
										? 'Report copied'
										: 'Could not copy',
								)
							}
						/>
						<RowButton
							text={trusted ? 'Stop accepting' : 'I checked it'}
							variant={trusted ? 'destructive' : 'secondary'}
							disabled={!scan.sha256}
							onPress={() => {
								if (trusted) auditor.untrust(p.id)
								else auditor.trust(scan)
							}}
						/>
					</ButtonRow>
					{!trusted && scan.risk !== 'clean' ? (
						<Design.Text variant="text-xs/medium" color="text-muted">
							{acceptHelp}
						</Design.Text>
					) : null}
					<Design.Button text="Close" variant="tertiary" onPress={close} />
				</View>
			</ScrollView>
		</Design.ActionSheet>
	)
}
