/**
 * The VirusTotal part of the plugin sheet and the place sheet: what it said, and the buttons to ask.
 *
 * Without a key, the buttons open VirusTotal's own page in the browser, which needs no key. With a key, the plugin asks
 * for itself and shows the answer here.
 */

import { Design } from '@valenced/discord/design'
import { Alert, View } from 'react-native'
import { ButtonRow, Chip, Code, Heading, Panel, RowButton } from './components'
import { RISK_COLOR } from './constants'
import { copy, open, toast } from './discord'
import { ago, verdictLine } from './format'
import { auditor } from './store'
import type { PluginScan, VtVerdict } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const NO_CODE = 'There is no code to check.'
const NO_KEY =
	'Add a free VirusTotal key in Options to check from here, or open the pages below.'

/** What a verdict looks like: its colour. */
const LEVEL_COLOR = {
	bad: RISK_COLOR.critical,
	warn: RISK_COLOR.medium,
	good: RISK_COLOR.clean,
	unknown: RISK_COLOR.low,
} as const

/** The box that shows a VirusTotal answer. */
function VerdictBox({ verdict }: { verdict: VtVerdict }) {
	const line = verdictLine(verdict)
	const c = LEVEL_COLOR[line.level]
	const when = `${verdict.analysedAt ? `Analysed ${ago(verdict.analysedAt)}. ` : ''}Checked ${ago(verdict.checkedAt)}.`
	return (
		<Panel tint={c.soft} style={{ gap: 6 }}>
			<Design.Text variant="text-md/semibold">{line.text}</Design.Text>
			<Design.Text variant="text-xs/medium" color="text-muted">
				{when}
			</Design.Text>
			{verdict.flagged.map(f => (
				<Code key={f} text={f} />
			))}
		</Panel>
	)
}

/** Asks first, because an upload shares the plugin's code with VirusTotal and its partners. */
function confirmUpload(scan: PluginScan, run: () => void): void {
	Alert.alert(
		'Upload this plugin to VirusTotal?',
		`The whole code of ${scan.plugin.name} will be sent to VirusTotal, which shares uploaded files with security companies. Plugin code is not private, but you may not want to upload one that a friend sent you. A lookup by hash (the Check button) sends nothing but the hash.`,
		[
			{ text: 'Cancel', style: 'cancel' },
			{ text: 'Upload', onPress: run },
		],
		{ cancelable: true },
	)
}

/** Shows a problem as a toast, or nothing when there was none. */
function say(problem: string | null): void {
	if (problem) toast(problem)
}

/** The VirusTotal part of one plugin's sheet. */
export function PluginVt({ scan }: { scan: PluginScan }) {
	const hash = scan.sha256
	if (!hash)
		return (
			<Design.Text variant="text-sm/medium" color="text-muted">
				{NO_CODE}
			</Design.Text>
		)
	const verdict = auditor.fileVerdict(scan)
	const job = auditor.job(hash)
	const hasKey = auditor.hasKey()
	return (
		<View style={{ gap: 10 }}>
			<Heading text="VirusTotal" />
			{verdict ? <VerdictBox verdict={verdict} /> : null}
			{job ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{job.text}
				</Design.Text>
			) : null}
			{hasKey ? (
				<ButtonRow>
					<RowButton
						text={verdict ? 'Check again' : 'Check'}
						variant="primary"
						disabled={!!job}
						onPress={async () => say(await auditor.checkFile(scan))}
					/>
					<RowButton
						text="Upload code"
						variant="secondary"
						disabled={!!job}
						onPress={() =>
							confirmUpload(scan, async () =>
								say(await auditor.uploadFile(scan)),
							)
						}
					/>
				</ButtonRow>
			) : (
				<Design.Text variant="text-xs/medium" color="text-muted">
					{NO_KEY}
				</Design.Text>
			)}
			<ButtonRow>
				<RowButton
					text="Open VirusTotal"
					variant="tertiary"
					onPress={() => open(auditor.links.file(hash))}
				/>
				<RowButton
					text="Hybrid Analysis"
					variant="tertiary"
					onPress={() => open(auditor.links.hybrid(hash))}
				/>
			</ButtonRow>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				<Chip text="SHA-256" />
				<View style={{ flex: 1 }}>
					<Design.Text
						variant="text-xs/medium"
						color="text-muted"
						lineClamp={1}
					>
						{hash}
					</Design.Text>
				</View>
				<Design.Button
					text="Copy"
					size="sm"
					variant="secondary"
					onPress={() => toast(copy(hash) ? 'Hash copied' : 'Could not copy')}
				/>
			</View>
		</View>
	)
}

/** The VirusTotal part of one place's sheet. */
export function HostVt({ host }: { host: string }) {
	const verdict = auditor.domainVerdict(host)
	const job = auditor.job(`domain:${host}`)
	return (
		<View style={{ gap: 10 }}>
			<Heading text="VirusTotal" />
			{verdict ? <VerdictBox verdict={verdict} /> : null}
			{job ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{job.text}
				</Design.Text>
			) : null}
			<ButtonRow>
				{auditor.hasKey() ? (
					<RowButton
						text={verdict ? 'Check again' : 'Check place'}
						variant="primary"
						disabled={!!job}
						onPress={async () => say(await auditor.checkDomain(host))}
					/>
				) : null}
				<RowButton
					text="Open VirusTotal"
					variant="secondary"
					onPress={() => open(auditor.links.domain(host))}
				/>
			</ButtonRow>
		</View>
	)
}
