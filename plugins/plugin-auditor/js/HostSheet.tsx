/** The sheet for one place that plugins link to: its links, who uses it, and the VirusTotal check. */

import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { ButtonRow, Heading, KindBadge, Panel, RowButton } from './components'
import { HOST_SHEET_KEY, RISK_COLOR } from './constants'
import { diag } from './diag'
import { copy, open, sheets, toast } from './discord'
import { plural } from './format'
import { openPluginSheet } from './PluginSheet'
import { auditor } from './store'
import { HostVt } from './VtBlock'

/** Texts as constants because React Native text must be passed as an expression. */
const GONE = 'This place is not in the last scan.'

/** Closes the sheet. */
function close(): void {
	try {
		sheets().hideActionSheet(HOST_SHEET_KEY)
	} catch {
		// The sheet is already gone.
	}
}

/** Opens the sheet for one place. */
export function openHostSheet(host: string): void {
	try {
		sheets().openLazy(
			Promise.resolve({ default: () => <HostSheet host={host} /> }),
			HOST_SHEET_KEY,
			{},
		)
	} catch (error) {
		diag.fail('sheet', error)
	}
}

/** The sheet for one place. */
function HostSheet({ host }: { host: string }) {
	const [, redraw] = useState(0)
	useEffect(() => auditor.subscribe(() => redraw(n => n + 1)), [])
	const entry = auditor.hosts(true).find(h => h.host === host)

	if (!entry) {
		return (
			<Design.ActionSheet>
				<View style={{ padding: 16, gap: 12 }}>
					<Design.Text variant="text-md/medium">{GONE}</Design.Text>
					<Design.Button text="Close" variant="secondary" onPress={close} />
				</View>
			</Design.ActionSheet>
		)
	}

	const counts = `${plural(entry.urls.length, 'link')} in ${plural(entry.plugins.length, 'plugin')}`

	return (
		<Design.ActionSheet>
			<ScrollView
				style={{ maxHeight: 620 }}
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
							<Design.Text variant="heading-lg/bold" lineClamp={2}>
								{entry.host}
							</Design.Text>
						</View>
						<KindBadge kind={entry.kind} />
					</View>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{counts}
					</Design.Text>
				</View>

				{entry.reason ? (
					<Panel tint={RISK_COLOR.critical.soft}>
						<Design.Text variant="text-sm/medium">{entry.reason}</Design.Text>
					</Panel>
				) : null}

				<View style={{ gap: 8 }}>
					<Heading text="Used by" />
					{entry.plugins.map(id => (
						<Design.TableRow
							key={id}
							label={auditor.nameOf(id)}
							subLabel={id}
							arrow
							onPress={() => {
								close()
								setTimeout(() => openPluginSheet(id), 350)
							}}
						/>
					))}
				</View>

				<View style={{ gap: 8 }}>
					<Heading text="Links" />
					{entry.urls.map(url => (
						<Design.Text key={url} variant="text-sm/medium" lineClamp={3}>
							{url}
						</Design.Text>
					))}
				</View>

				<HostVt host={entry.host} />

				<View style={{ gap: 10 }}>
					<ButtonRow>
						<RowButton
							text="Copy links"
							variant="secondary"
							onPress={() =>
								toast(
									copy(entry.urls.join('\n'))
										? 'Links copied'
										: 'Could not copy',
								)
							}
						/>
						<RowButton
							text="Open in browser"
							variant="secondary"
							onPress={async () => {
								const first = entry.urls[0]
								if (first && !(await open(first)))
									toast('Could not open the link')
							}}
						/>
					</ButtonRow>
					<Design.Button text="Close" variant="tertiary" onPress={close} />
				</View>
			</ScrollView>
		</Design.ActionSheet>
	)
}
