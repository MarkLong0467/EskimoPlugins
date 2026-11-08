/** The sheet for one plugin: why it got its risk, everything that was found, its links, and the VirusTotal check. */

import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
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
import { SheetFrame } from './SheetFrame'
import { findingKey } from './scan'
import { auditor } from './store'
import { PluginVt } from './VtBlock'

/** Texts as constants because React Native text must be passed as an expression. */
const GONE = 'This plugin is not in the last scan.'
const CLEAN = 'Nothing sensitive was found in its code.'
const NOTHING_LEFT =
	'Nothing is left once the findings you ignore are set aside.'
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
	const whitelisted = auditor.isWhitelisted(p.id)
	const view = auditor.view(scan)
	const links = scan.links.filter(l => l.kind !== 'noise')
	const color = RISK_COLOR[view.risk]
	const facts = `${p.id} · v${p.version} · ${p.author}`
	const whitelistHelp = `A whitelisted plugin never counts as needing attention and is left out of the start-up alert, even after it updates. Its ${plural(view.findings.length, 'finding')} stay listed here.`
	const ignoreHelp =
		'Ignore a finding you know is fine. Only that one is hidden, so a new problem still shows.'

	return (
		<SheetFrame title={p.name} onClose={close}>
			<>
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
						<RiskBadge risk={view.risk} big />
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
						{whitelisted ? <Chip text="WHITELISTED" /> : null}
						{view.ignored.length > 0 ? (
							<Chip text={`${view.ignored.length} IGNORED`} />
						) : null}
						<Chip text={scan.sha256 ? sizeText(scan.size) : 'NO CODE'} />
					</View>
				</View>

				{scan.problem ? (
					<Panel tint={RISK_COLOR.medium.soft}>
						<Design.Text variant="text-sm/medium">{NO_CODE}</Design.Text>
					</Panel>
				) : null}

				{view.combos.map(combo => (
					<Panel
						key={combo.id}
						tint={RISK_COLOR[combo.severity].soft}
						style={{ gap: 4 }}
					>
						<Design.Text variant="text-md/bold">{combo.title}</Design.Text>
						<Design.Text variant="text-sm/medium">{combo.why}</Design.Text>
					</Panel>
				))}

				{view.findings.length === 0 && !scan.problem ? (
					<Panel tint={color.soft}>
						<Design.Text variant="text-md/medium">
							{view.ignored.length > 0 ? NOTHING_LEFT : CLEAN}
						</Design.Text>
					</Panel>
				) : null}

				{view.findings.length > 0 ? (
					<View style={{ gap: 10 }}>
						<Heading text={`Findings · ${view.findings.length}`} />
						{view.findings.map(f => (
							<View key={f.rule} style={{ gap: 4 }}>
								<Design.Text variant="text-xs/bold" color="text-muted">
									{CATEGORY_LABEL[f.category].toUpperCase()}
								</Design.Text>
								<FindingCard
									finding={f}
									actionText="Ignore this"
									onAction={() => auditor.setIgnored(p.id, findingKey(f), true)}
								/>
							</View>
						))}
						<Design.Text variant="text-xs/medium" color="text-muted">
							{ignoreHelp}
						</Design.Text>
					</View>
				) : null}

				{view.ignored.length > 0 ? (
					<View style={{ gap: 10 }}>
						<Heading text={`Ignored · ${view.ignored.length}`} />
						{view.ignored.map(f => (
							<FindingCard
								key={findingKey(f)}
								finding={f}
								dimmed
								actionText="Notice again"
								onAction={() => auditor.setIgnored(p.id, findingKey(f), false)}
							/>
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
							text={whitelisted ? 'Remove whitelist' : 'Whitelist'}
							variant={whitelisted ? 'destructive' : 'secondary'}
							onPress={() => {
								if (whitelisted) auditor.unwhitelist(p.id)
								else auditor.whitelist(p.id)
							}}
						/>
					</ButtonRow>
					{!whitelisted && view.risk !== 'clean' ? (
						<Design.Text variant="text-xs/medium" color="text-muted">
							{whitelistHelp}
						</Design.Text>
					) : null}
					<Design.Button text="Close" variant="tertiary" onPress={close} />
				</View>
			</>
		</SheetFrame>
	)
}
