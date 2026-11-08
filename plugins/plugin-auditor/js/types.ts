/** How serious one finding is. */
export type Severity = 'critical' | 'high' | 'medium' | 'low'

/** How risky a whole plugin looks. `clean` means nothing sensitive was found. */
export type Risk = Severity | 'clean'

/** The kind of access a rule looks for. */
export type Category =
	| 'token'
	| 'write'
	| 'network'
	| 'code'
	| 'device'
	| 'plugins'
	| 'obfuscation'
	| 'exfil'
	| 'native'

/** One thing the scanner looks for in a plugin's code. */
export interface Rule {
	id: string
	category: Category
	severity: Severity
	/** Short name, shown as the title of a finding. */
	title: string
	/** What it means for the user, in plain words. */
	why: string
	/** What to look for. Must have the `g` flag. */
	pattern: RegExp
	/** The rule only counts when it matches at least this many times (for things that are normal in small amounts). */
	min?: number
}

/** One rule that matched in one plugin. */
export interface Finding {
	rule: string
	category: Category
	severity: Severity
	title: string
	why: string
	/** How many times it matched. */
	count: number
	/** A few places it matched, each with a little code around it. */
	samples: string[]
}

/** A mix of findings that is worse than each alone. */
export interface Combo {
	id: string
	severity: Severity
	title: string
	why: string
}

/** How much to trust a link. */
export type LinkKind = 'known' | 'noise' | 'unknown' | 'risky'

/** One link found in a plugin's code. */
export interface LinkHit {
	url: string
	host: string
	kind: LinkKind
	/** Why a risky link is risky. */
	reason?: string
	/** The link has a `${...}` part that is filled in while the plugin runs, so only the start is known. */
	dynamic: boolean
}

/** An installed plugin as the scanner gets it. */
export interface InstalledPlugin {
	id: string
	name: string
	version: string
	author: string
	description: string
	internal: boolean
	/** The repository it came from, or `null` if it was sideloaded. */
	repo: string | null
	dependencies: string[]
	/** The plugin's JavaScript, or `null` when Valenced has none for it. */
	script: string | null
	/** The plugin also has a native (Android) part. This is only known when the manifest could be read. */
	native: boolean
}

/** What the scan found out about one plugin. */
export interface PluginScan {
	plugin: Omit<InstalledPlugin, 'script'>
	/** SHA-256 of the code as UTF-8, or `null` when there is no code. */
	sha256: string | null
	size: number
	findings: Finding[]
	combos: Combo[]
	links: LinkHit[]
	risk: Risk
	/** Used to sort: higher means look at it first. */
	score: number
	/** Why the plugin could not be scanned, if it could not. */
	problem?: string
}

/** Why two or more plugins look like the same thing. */
export interface DuplicateGroup {
	/** The plugin ids in the group. */
	members: string[]
	reasons: string[]
	confidence: 'high' | 'medium' | 'low'
	/** Highest similarity of the code between members, 0 to 1, if it was compared. */
	similarity: number | null
}

/** What VirusTotal said about a file or a domain. */
export interface VtVerdict {
	/** `found` has an answer; `unknown` means VirusTotal has never seen it. */
	state: 'found' | 'unknown'
	malicious: number
	suspicious: number
	harmless: number
	undetected: number
	/** Engines that flagged it, with what they called it. */
	flagged: string[]
	/** When VirusTotal last analysed it, in milliseconds (0 if unknown). */
	analysedAt: number
	/** When this answer was fetched, in milliseconds. */
	checkedAt: number
}

/** What the plugin saves. */
export interface AuditorSettings {
	includeBuiltIn: boolean
	includeSelf: boolean
	autoScan: boolean
	notify: boolean
	hideNoise: boolean
	vtKey: string
	vtDomains: boolean
	vtFast: boolean
	/** Plugins the user has looked at and accepted, by id, with the hash of the code they accepted. */
	trusted: Record<string, string>
	/** VirusTotal answers by SHA-256 of a file, or `domain:<host>`. */
	vtCache: Record<string, VtVerdict>
}
