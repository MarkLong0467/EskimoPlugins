/** The Options tab: what to scan, VirusTotal, the plugins you accepted, and what each check means. */

import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { ButtonRow, Chip, Heading, Panel, RowButton } from './components'
import { saveSettings, setting } from './config'
import { RISK_COLOR } from './constants'
import { open, toast } from './discord'
import { CATEGORY_HELP, CATEGORY_LABEL } from './rules'
import { auditor } from './store'
import type { Category } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const KEY_HELP =
	'A free key from virustotal.com (Profile, API key) lets this plugin ask VirusTotal for you. It is saved on this phone only and never goes in the copied logs.'
const PRIVACY =
	'Checking a plugin sends only its hash. Checking a place sends only its name. Uploading sends the whole plugin file: that asks first, every time.'
const LIMITS_TITLE = 'What this cannot do'
const LIMITS =
	'It reads code for signs; it does not prove that a plugin is safe or harmful. A plugin can build links and calls from pieces while it runs, native (Android) parts cannot be read, and many honest plugins make web requests or change things on purpose. Treat a finding as a reason to look, not a verdict.'

/** The order the categories are listed in. */
const CATEGORIES: readonly Category[] = [
	'token',
	'write',
	'network',
	'code',
	'device',
	'plugins',
	'obfuscation',
	'exfil',
	'native',
]

/** The Options tab. */
export function OptionsTab() {
	const [key, setKey] = useState(String(setting('vtKey') || ''))
	const [testing, setTesting] = useState(false)
	const trusted = Object.keys(setting('trusted'))

	return (
		<View style={{ gap: 22 }}>
			<Design.TableRowGroup title="Scanning">
				<Design.TableSwitchRow
					label="Scan when Discord starts"
					subLabel="A few seconds after Discord opens."
					value={!!setting('autoScan')}
					onValueChange={(value: boolean) =>
						saveSettings({ autoScan: !!value })
					}
				/>
				<Design.TableSwitchRow
					label="Tell me when something needs attention"
					subLabel="A toast after the automatic scan."
					value={!!setting('notify')}
					onValueChange={(value: boolean) => saveSettings({ notify: !!value })}
				/>
				<Design.TableSwitchRow
					label="Include Valenced's built-in plugins"
					subLabel="They come with Valenced and are not installed from anywhere."
					value={!!setting('includeBuiltIn')}
					onValueChange={(value: boolean) =>
						saveSettings({ includeBuiltIn: !!value })
					}
				/>
				<Design.TableSwitchRow
					label="Include this plugin"
					subLabel="Its own rules look like what they search for, so it is left out unless you ask."
					value={!!setting('includeSelf')}
					onValueChange={(value: boolean) =>
						saveSettings({ includeSelf: !!value })
					}
				/>
			</Design.TableRowGroup>

			<View style={{ marginHorizontal: 16, gap: 12 }}>
				<Heading text="VirusTotal" />
				<Panel style={{ gap: 12 }}>
					<Design.Text variant="text-sm/medium" color="text-muted">
						{KEY_HELP}
					</Design.Text>
					<Design.TextInput
						label="API key"
						placeholder="Paste your key"
						size="md"
						secureTextEntry
						value={key}
						onChange={(value: string) => {
							setKey(value)
							saveSettings({ vtKey: value.trim() })
						}}
					/>
					<ButtonRow>
						<RowButton
							text={testing ? 'Testing…' : 'Test key'}
							variant="secondary"
							disabled={testing || key.trim().length === 0}
							onPress={async () => {
								setTesting(true)
								try {
									const result = await auditor.testKey()
									toast(result.text)
								} finally {
									setTesting(false)
								}
							}}
						/>
						<RowButton
							text="Get a key"
							variant="tertiary"
							onPress={() => open('https://www.virustotal.com/gui/my-apikey')}
						/>
					</ButtonRow>
					<Design.Text variant="text-xs/medium" color="text-muted">
						{PRIVACY}
					</Design.Text>
				</Panel>
			</View>
			<Design.TableRowGroup>
				<Design.TableSwitchRow
					label="Also check unknown places"
					subLabel="Adds a Check unknown button to the Links tab. Up to 20 places at a time."
					value={!!setting('vtDomains')}
					onValueChange={(value: boolean) =>
						saveSettings({ vtDomains: !!value })
					}
				/>
				<Design.TableSwitchRow
					label="My key has a higher limit"
					subLabel="Free keys are limited to 4 requests a minute, so requests are spaced out. Turn on only for a premium key."
					value={!!setting('vtFast')}
					onValueChange={(value: boolean) => saveSettings({ vtFast: !!value })}
				/>
			</Design.TableRowGroup>

			<Design.TableRowGroup
				title="Plugins you accepted"
				description="Accepted plugins do not count as a problem until their code changes."
			>
				{trusted.length === 0 ? (
					<Design.TableRow
						label="None yet"
						subLabel="Open a plugin and tap I checked it."
					/>
				) : (
					trusted.map(id => (
						<Design.TableRow
							key={id}
							label={auditor.nameOf(id)}
							subLabel={id}
							trailing={<Chip text="REMOVE" />}
							onPress={() => auditor.untrust(id)}
						/>
					))
				)}
			</Design.TableRowGroup>

			<View style={{ marginHorizontal: 16, gap: 10 }}>
				<Heading text="What is checked" />
				{CATEGORIES.map(category => (
					<View key={category} style={{ gap: 2 }}>
						<Design.Text variant="text-md/semibold">
							{CATEGORY_LABEL[category]}
						</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{CATEGORY_HELP[category]}
						</Design.Text>
					</View>
				))}
			</View>

			<View style={{ marginHorizontal: 16 }}>
				<Panel tint={RISK_COLOR.medium.soft} style={{ gap: 6 }}>
					<Design.Text variant="text-md/bold">{LIMITS_TITLE}</Design.Text>
					<Design.Text variant="text-sm/medium">{LIMITS}</Design.Text>
				</Panel>
			</View>
		</View>
	)
}
