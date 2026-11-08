/**
 * What the scanner looks for.
 *
 * A plugin runs with the same access as Discord itself, so nothing here is a permission the plugin asked for. These are
 * signs in the code that it can do something sensitive. The names come from Discord's own code (the datamined mobile
 * client): `AuthenticationStore.getToken` and `TokenManager.getToken/setToken` hold and hand out the sign-in token,
 * `AuthenticationActionCreators` signs in and out, and `HTTP.post/put/patch/del` send changes to Discord's servers.
 *
 * Plugins are built into one minified file, so names of functions and properties are kept but local variables are not.
 * A rule can only see names, text and links that are still in the file.
 */

import type { Category, Combo, Rule, Severity } from './types'

/** The words used for each category in the screens and in the report. */
export const CATEGORY_LABEL: Record<Category, string> = {
	token: 'Account & token',
	write: 'Changes things',
	network: 'Network',
	code: 'Runs code',
	device: 'Phone & files',
	plugins: 'Other plugins',
	obfuscation: 'Hidden code',
	exfil: 'Suspicious places',
	native: 'Native code',
}

/** One line for each category, for the "what is checked" list. */
export const CATEGORY_HELP: Record<Category, string> = {
	token:
		'Reading or setting your sign-in token, signing you in or out, or touching your password and two-factor settings.',
	write:
		'Sending changes to Discord: posting, editing or deleting messages, joining or leaving servers, changing friends, roles or your settings.',
	network:
		'Talking to the internet from the plugin, which is how anything could leave your phone.',
	code: 'Running text as code, which lets a plugin change what it does after you installed it.',
	device:
		'Reading your clipboard, writing or deleting files, device identifiers and Android permissions.',
	plugins:
		'Installing, enabling or removing other plugins, or using the hidden developer API.',
	obfuscation:
		'Code that is made hard to read on purpose (encoded text, scrambled names).',
	exfil:
		'Webhooks, tunnels, IP loggers, paste sites, link shorteners and links to bare IP addresses.',
	native:
		'A plugin with a native (Android) part. Only its JavaScript can be scanned.',
}

/** Order of severity, highest first. */
export const SEVERITIES: readonly Severity[] = [
	'critical',
	'high',
	'medium',
	'low',
]

/** The points a finding of each severity adds to the score. */
export const WEIGHT: Record<Severity, number> = {
	critical: 40,
	high: 20,
	medium: 8,
	low: 2,
}

/** The code rules. Links are judged separately in `links.ts`. */
export const RULES: readonly Rule[] = [
	// ---- Account & token --------------------------------------------------------------------------------------------
	{
		id: 'token.read',
		category: 'token',
		severity: 'high',
		title: 'Reads your account token',
		why: 'The token is the key to your account. Whoever has it can act as you without your password or two-factor code.',
		pattern:
			/\b(?:getToken|_getToken|getAuthToken|getAuthenticationToken|getAccessToken)\s*\(/g,
	},
	{
		id: 'token.store',
		category: 'token',
		severity: 'medium',
		title: 'Uses the sign-in store',
		why: "Discord's sign-in store (AuthenticationStore, TokenManager) is where the token lives. Using it is not proof of anything, but it is the way to the token.",
		pattern: /\b(?:AuthenticationStore|TokenManager\w*|AuthenticationUtils)\b/g,
	},
	{
		id: 'token.write',
		category: 'token',
		severity: 'high',
		title: 'Can sign you in, out or into another account',
		why: 'Setting the token or starting a session changes who the app is signed in as.',
		pattern:
			/\b(?:setToken|loginToken|switchAccountToken|startSession|handleLoginSuccess|clearToken|removeToken)\s*\(|["'`]LOGIN_SUCCESS["'`]|["'`]LOGOUT["'`]/g,
	},
	{
		id: 'token.header',
		category: 'token',
		severity: 'medium',
		title: 'Sends an Authorization header',
		why: 'An Authorization header carries your login. Sent anywhere but Discord, it hands that login to someone else.',
		pattern: /["'`]?\bAuthorization["'`]?\s*:/gi,
	},
	{
		id: 'token.account',
		category: 'token',
		severity: 'high',
		title: 'Touches password, email or two-factor settings',
		why: 'These are the settings that protect your account from being taken over.',
		pattern:
			/\b(?:MFAActionCreators|UserSettingsAccount\w*|changePassword|deleteAccount|disableAccount|getBackupCodes|backup_codes|updateEmail|requestEmailChange|disableMFA|enableMFA)\b/g,
	},

	// ---- Changes things on Discord's servers ------------------------------------------------------------------------
	{
		id: 'write.http',
		category: 'write',
		severity: 'medium',
		title: 'Sends changes to Discord',
		why: "HTTP post, put, patch or delete calls change data on Discord's servers: not just on your phone.",
		pattern:
			/\b(?:HTTP|RestAPI\w*)\s*\.\s*(?:post|put|patch|del|delete)\s*\(|\.(?:post|put|patch|del)\(\s*\{\s*(?:url|path)\s*:/g,
	},
	{
		id: 'write.actions',
		category: 'write',
		severity: 'medium',
		title: 'Calls actions that change your account or servers',
		why: 'Sending or deleting messages, joining or leaving servers, changing friends, roles or settings. Fine for a plugin that does it on purpose, harmful if it does it on its own.',
		pattern:
			/\b(?:sendMessage|sendBotMessage|editMessage|deleteMessage|createMessage|addReaction|removeReaction|joinGuild|leaveGuild|kickUser|banUser|createChannel|deleteChannel|createInvite|acceptInvite|addRelationship|removeRelationship|blockUser|sendFriendRequest|reportMessage|reportUser|createWebhook|setNickname|changeNickname|createThread|addRole|removeRole|timeoutUser)\w*\s*\(/g,
	},
	{
		id: 'write.settings',
		category: 'write',
		severity: 'low',
		title: 'Changes your synced Discord settings',
		why: 'Settings like your status and privacy options are saved on your account, so a change shows on every device.',
		pattern:
			/\b(?:updateRemoteSettings|updateAllRemoteSettings|UserSettingsProto\w*|PreloadedUserSettings\w*|setCustomStatus)\b/g,
	},
	{
		id: 'write.method',
		category: 'write',
		severity: 'medium',
		title: 'Makes POST, PUT, PATCH or DELETE requests',
		why: 'These requests send data to a server or change something on it.',
		pattern: /\bmethod\s*:\s*["'`](?:POST|PUT|PATCH|DELETE)["'`]/gi,
	},

	// ---- Network ------------------------------------------------------------------------------------------------------
	{
		id: 'net.fetch',
		category: 'network',
		severity: 'low',
		title: 'Makes web requests',
		why: 'The plugin can talk to the internet. See the links list for where.',
		pattern: /(?<![\w$.])fetch\s*\(|\bXMLHttpRequest\b|\bsendBeacon\b/g,
	},
	{
		id: 'net.socket',
		category: 'network',
		severity: 'medium',
		title: 'Opens a WebSocket',
		why: 'A WebSocket is a connection that stays open, so data can flow both ways at any time.',
		pattern: /\bnew\s+WebSocket\s*\(/g,
	},
	{
		id: 'net.bridge',
		category: 'network',
		severity: 'low',
		title: 'Calls the native bridge directly',
		why: "The bridge reaches Valenced's native side: files, the plugin list and more.",
		pattern:
			/\bcallNativeMethod(?:Sync)?\s*\(|\bnativeCallSyncHook\b|\b__fbBatchedBridge\b/g,
	},

	// ---- Runs code ----------------------------------------------------------------------------------------------------
	{
		id: 'code.eval',
		category: 'code',
		severity: 'high',
		title: 'Runs text as code',
		why: 'eval and new Function turn a string into running code. The string can come from anywhere, including a server that changes it later.',
		// `eval` on its own (also passed along, as in `.then(eval)`), through the global object, or `new Function(...)`.
		pattern:
			/(?<![\w$.])eval(?![\w$])|\b(?:globalThis|window|global)\s*\.\s*eval\b|\bnew\s+Function\s*\(|(?<![\w$.])Function\s*\(\s*["'`]/g,
	},

	// ---- Phone & files ------------------------------------------------------------------------------------------------
	{
		id: 'device.clipboard',
		category: 'device',
		severity: 'medium',
		title: 'Reads your clipboard',
		why: 'What you copied can include passwords and codes.',
		pattern: /\bClipboard\w*\s*\.\s*getString\b|\bgetStringAsync\b/g,
	},
	{
		id: 'device.files',
		category: 'device',
		severity: 'medium',
		title: 'Writes or deletes files',
		why: "Files in Discord's data folder can include other plugins and their saved data.",
		pattern: /\b(?:writeFile|writeFileSync|deleteFileSync|rmSync)\s*\(/g,
	},
	{
		id: 'device.ids',
		category: 'device',
		severity: 'medium',
		title: 'Reads device identifiers or asks for permissions',
		why: 'Device ids, location, contacts and photos are used to track a phone or read private data.',
		pattern:
			/\b(?:PermissionsAndroid|requestPermissions?|getUniqueId|getMacAddress|getIpAddress|getCurrentPosition|CameraRoll|getContacts)\b/g,
	},

	// ---- Other plugins ------------------------------------------------------------------------------------------------
	{
		id: 'plugins.manage',
		category: 'plugins',
		severity: 'high',
		title: 'Can install, enable or remove plugins',
		why: 'A plugin that can install other plugins can bring in code you never looked at.',
		pattern:
			/\b(?:enablePluginInActiveSlot|disablePluginInActiveSlot|uninstallExternalPlugin|registerExternalPlugin|confirmInstallFile|resyncPluginSources|addRepository|installPlugin)\b/g,
	},
	{
		id: 'plugins.hidden',
		category: 'plugins',
		severity: 'medium',
		title: "Uses Valenced's hidden developer API",
		why: 'The hidden API is for debugging and sees how every plugin is set up.',
		pattern:
			/\bvalenced\.hidden\b|@valenced\/hidden|\bvalenced\.api\.hidden\b/g,
	},

	// ---- Hidden code --------------------------------------------------------------------------------------------------
	{
		id: 'obf.names',
		category: 'obfuscation',
		severity: 'high',
		title: 'Looks scrambled on purpose',
		why: 'Names like _0x4f2a are what obfuscation tools write. Honest plugins have no reason to hide what they do.',
		pattern: /\b_0x[0-9a-f]{4,6}\b/gi,
		min: 5,
	},
	{
		id: 'obf.escapes',
		category: 'obfuscation',
		severity: 'medium',
		title: 'Text written as escape codes',
		why: 'Long runs of \\x41\\x42 style codes hide what a string says.',
		pattern: /(?:\\x[0-9a-f]{2}){10,}|(?:\\u[0-9a-f]{4}){8,}/gi,
	},
	{
		id: 'obf.decode',
		category: 'obfuscation',
		severity: 'low',
		title: 'Decodes text while running',
		why: 'atob and String.fromCharCode are how encoded strings are turned back into links and code.',
		pattern: /(?<![\w$.])atob\s*\(|String\s*\.\s*fromCharCode\s*\(/g,
		min: 3,
	},
	{
		id: 'obf.blob',
		category: 'obfuscation',
		severity: 'low',
		title: 'Holds a very long encoded string',
		why: 'It could be an embedded picture or font. It could also be a hidden program.',
		pattern: /["'`][A-Za-z0-9+/]{600,}={0,2}["'`]/g,
	},
]

/** What the plugin's own manifest dependencies say, checked on top of the code. */
export const MANIFEST_RULES: readonly {
	dependency: string
	severity: Severity
	category: Category
	title: string
	why: string
}[] = [
	{
		dependency: 'valenced.api.hidden',
		severity: 'medium',
		category: 'plugins',
		title: 'Asks for the hidden developer API',
		why: 'It declared a dependency on valenced.api.hidden, which exposes how every plugin is set up.',
	},
	{
		dependency: 'valenced.settings.plugins',
		severity: 'medium',
		category: 'plugins',
		title: 'Asks for the plugin management screen',
		why: 'It declared a dependency on valenced.settings.plugins, which is how a plugin manages other plugins.',
	},
]

/** A mix of findings that is worse than each alone. */
export interface ComboRule extends Combo {
	/** Rule ids that must all have matched. */
	has: readonly string[]
	/**
	 * What to do when the plugin makes web requests but every link in its code is a known place (Discord, GitHub...): a
	 * milder combo is reported, one step lower. `false` reports nothing, because the parts alone already say enough.
	 */
	soft?: boolean
}

/**
 * Findings that mean more together than alone. Each one also needs the plugin to be able to reach the internet: a link
 * that is not a known place counts in full, web requests to known places only count as a milder combo.
 */
export const COMBOS: readonly ComboRule[] = [
	{
		id: 'combo.token-out',
		severity: 'critical',
		title: 'Can read your token and reach the internet',
		why: 'This is what a token stealer does. A plugin that signs in to a service of its own can look like this too, so check where its links go.',
		has: ['token.read'],
	},
	{
		id: 'combo.remote-code',
		severity: 'critical',
		title: 'Can download and run code',
		why: 'It runs text as code and talks to the internet, so it can run code that you and the plugin author never saw.',
		has: ['code.eval'],
	},
	{
		id: 'combo.clipboard-out',
		severity: 'medium',
		title: 'Reads your clipboard and reaches an unknown place',
		why: 'What you copy, including passwords, could be sent out. Plugins that paste a link you copied look like this too.',
		has: ['device.clipboard'],
		soft: false,
	},
	{
		id: 'combo.hidden-out',
		severity: 'high',
		title: 'Hides its code and reaches the internet',
		why: 'Code that is scrambled on purpose and uses the network is a common sign of malware.',
		has: ['obf.names'],
	},
	{
		id: 'combo.installer',
		severity: 'high',
		title: 'Can install other plugins from the internet',
		why: 'It manages plugins and reaches the internet, so what runs on your phone can change without you.',
		has: ['plugins.manage'],
	},
]

/** Whether a severity is at least as serious as another. */
export function atLeast(a: Severity, b: Severity): boolean {
	return SEVERITIES.indexOf(a) <= SEVERITIES.indexOf(b)
}
