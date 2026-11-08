/**
 * The note at the bottom of the settings that says, in plain words, what this plugin does and when it speaks up.
 *
 * It sits above the debugging section so people read how the alerts and the whitelist work before they use them.
 */

import { Design } from '@valenced/discord/design'
import { View } from 'react-native'
import { Heading, Panel } from './components'

/** One part of the note: a short title and what it says. Texts are constants because React Native text must be an expression. */
interface Part {
	title: string
	text: string
}

const PARTS: readonly Part[] = [
	{
		title: 'What it does',
		text: "Plugin Auditor reads the code of every plugin you have installed and looks for signs that it can reach your token, change things on your account or servers, run downloaded code, send data out, or hide what it does. It never runs a plugin's code, and everything happens on your phone.",
	},
	{
		title: 'When it scans',
		text: 'Every time Discord starts (a few seconds after it opens), and whenever you tap Scan now. You can turn the start-up scan off in Options.',
	},
	{
		title: 'The risk levels',
		text: 'Critical and High are things that are rarely innocent: reading your token and reaching an unknown place, running downloaded code, signing you in or out, installing other plugins, scrambled code, webhooks and IP loggers. Medium and Low are everyday behaviour such as posting to Discord or making web requests. A level is a reason to look, not a verdict.',
	},
	{
		title: 'The alert when Discord starts',
		text: 'After the start-up scan you get a toast, but only if a plugin is High or Critical, and it names the plugin. Nothing else makes a toast. Plugins on your whitelist are left out.',
	},
	{
		title: 'Whitelist',
		text: 'Open a plugin and tap Whitelist when you know it is fine. It then never counts as needing attention and never appears in the start-up alert. It keeps its real risk badge, and all of its findings stay listed.',
	},
	{
		title: 'When a whitelisted plugin updates',
		text: 'Plugin Auditor remembers the version you whitelisted. If the plugin updates to a different version and that version is Critical, it is shown again (in the alert and on the Attention list, marked as updated) until you tap Whitelist this version. If you do not want that check for a plugin, tap Ignore new update checks on it. A whitelisted plugin that updates and is not Critical stays quiet.',
	},
	{
		title: 'Ignore a finding',
		text: 'Under a finding, Ignore this hides just that one finding on that plugin, and any combination it is part of. A different, new problem on the same plugin still shows. Notice again brings it back. Whitelisted plugins and ignored findings are listed in Options, where a tap removes them.',
	},
	{
		title: 'VirusTotal',
		text: 'Optional. A check sends only the SHA-256 hash of the plugin file, a check of a place sends only its name, and an upload sends the whole file and asks first. Your key stays on this phone.',
	},
	{
		title: 'What it cannot see',
		text: 'A plugin can build its links and calls from pieces while it runs, and a native (Android) part cannot be read, so it is noted but not scanned. Many honest plugins make web requests or change things on purpose. Plugin Auditor is a second pair of eyes, not a guarantee.',
	},
]

/** The "how it works" note. */
export function HowItWorks() {
	return (
		<View style={{ marginHorizontal: 16, gap: 10 }}>
			<Heading text="How Plugin Auditor works" />
			<Panel style={{ gap: 14 }}>
				{PARTS.map(part => (
					<View key={part.title} style={{ gap: 3 }}>
						<Design.Text variant="text-md/semibold">{part.title}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{part.text}
						</Design.Text>
					</View>
				))}
			</Panel>
		</View>
	)
}
