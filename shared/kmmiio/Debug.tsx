import { ToastActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { clock } from './diagnostics'
import type { DiagCheck, Diagnostics } from './diagnostics'

/** The key Discord's toast machinery needs for the "copied" message. */
const TOAST_KEY = 'MARKLONG_KMMIIO_DEBUG'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'DEBUGGING'
const HELP =
	'Something not working? Copy the logs and send them. They have the versions, the settings (secrets hidden), what was found and the last errors.'

/** How many events the screen lists. The copied report has all of them. */
const SHOWN = 8

/** Shows a toast, and does nothing if one cannot be shown. */
function toast(text: string): void {
	try {
		ToastActionCreators.open(TOAST_KEY, { text })
	} catch {
		// A toast is only a convenience.
	}
}

/**
 * The debugging part at the bottom of a plugin's settings.
 *
 * "Copy logs" puts a full report on the clipboard. "Run self-check" asks the plugin whether its patches and modules were
 * found. The last events are listed below so a problem can be seen without pasting anything.
 *
 * @param diag The diagnostics of the plugin whose settings this is.
 */
export function DebugSection({ diag }: { diag: Diagnostics }) {
	const [, redraw] = useState(0)
	const [checks, setChecks] = useState<DiagCheck[] | null>(null)
	useEffect(() => diag.subscribe(() => redraw(n => n + 1)), [diag])

	const entries = diag.entries()
	const recent = entries.slice(-SHOWN).reverse()
	const problems = entries.filter(e => e.level === 'error').length

	return (
		<Design.Stack spacing={16}>
			<View style={{ marginHorizontal: 16 }}>
				<Design.Card>
					<Design.Stack spacing={12}>
						<Design.Text variant="text-xs/bold" color="text-muted">
							{TITLE}
						</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{HELP}
						</Design.Text>
						<View style={{ flexDirection: 'row', gap: 10 }}>
							<View style={{ flex: 1 }}>
								<Design.Button
									text="Copy logs"
									variant="primary"
									size="sm"
									onPress={() =>
										toast(
											diag.copyLogs()
												? 'Logs copied. Paste them in the chat.'
												: 'Could not copy the logs',
										)
									}
								/>
							</View>
							<View style={{ flex: 1 }}>
								<Design.Button
									text="Run self-check"
									variant="secondary"
									size="sm"
									onPress={() => setChecks(diag.runChecks())}
								/>
							</View>
						</View>
					</Design.Stack>
				</Design.Card>
			</View>
			{checks && (
				<Design.TableRowGroup title="Self-check">
					{checks.map((c, i) => (
						<Design.TableRow
							key={`check${i}`}
							label={`${c.ok ? '✓' : '✗'} ${c.label}`}
							subLabel={c.detail || undefined}
						/>
					))}
				</Design.TableRowGroup>
			)}
			<Design.TableRowGroup
				title={`Recent events${problems ? ` · ${problems} error${problems === 1 ? '' : 's'}` : ''}`}
			>
				{recent.length === 0 ? (
					<Design.TableRow
						label="Nothing noted yet"
						subLabel="Events show up here as the plugin works."
					/>
				) : (
					recent.map((e, i) => (
						<Design.TableRow
							key={`event${entries.length - i}`}
							label={`${e.level === 'error' ? '✗' : e.level === 'warn' ? '!' : '•'} ${e.text}`}
							subLabel={`${clock(e.at)} · ${e.area}`}
							labelLineClamp={3}
						/>
					))
				)}
				<Design.TableRow
					label="Clear events"
					subLabel="Starts the log over. Copy it first if you need it."
					onPress={() => {
						diag.clear()
						setChecks(null)
					}}
				/>
			</Design.TableRowGroup>
		</Design.Stack>
	)
}
