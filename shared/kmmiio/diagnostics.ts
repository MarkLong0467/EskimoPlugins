/**
 * Diagnostics for the plugins ported from kmmiio99o.
 *
 * Each plugin makes one {@link Diagnostics} and uses it to note what it did, so that when something breaks the settings
 * screen can copy a report with everything needed to see why: the versions of Discord and the plugin, the settings
 * (secrets hidden), which patches and modules were found, the errors that were caught and the last events in order.
 *
 * Nothing here changes what a plugin does. Every function is safe to call at any time and never throws.
 */

import { ClientInfoModule } from '@valenced/discord/native'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { before } from '@valenced/patcher'
import { Platform } from 'react-native'
import { LICENSE, ORIGINAL_AUTHOR, PORTER } from './credits'
import { redact } from './redact'
import type { PluginManifest } from '@valenced/plugins/types'

/** How many events are kept. The oldest are dropped first. */
const MAX_ENTRIES = 200

/** How serious an event is. */
export type DiagLevel = 'info' | 'warn' | 'error'

/** One thing that happened, with the time it happened. */
export interface DiagEntry {
	at: number
	level: DiagLevel
	/** The part of the plugin it came from, such as "patch" or "settings". */
	area: string
	text: string
}

/** The answer to one question the self-check asks, such as "was the menu found?". */
export interface DiagCheck {
	ok: boolean
	label: string
	detail?: string
}

/** The part of a plugin that the diagnostics read. Any plugin fits, whatever its settings are. */
export interface AttachablePlugin {
	manifest: PluginManifest
	errors: readonly unknown[]
	api: { unscoped?: unknown }
}

/** What a plugin tells its diagnostics about itself. */
export interface DiagnosticsOptions {
	/** The settings to put in the report. Secrets are hidden before they are shown. */
	settings?: () => unknown
	/** Lines the plugin wants in the report, such as counters or what it saw last. */
	extra?: () => string[]
	/** Checks the plugin can answer on demand, shown by "Run self-check". */
	checks?: () => DiagCheck[]
	/** Start of the console messages that belong to the plugin, such as "[kmmiio-lib]". They are copied into the log. */
	consolePrefixes?: string[]
}

/** The shape of the library that most of these plugins depend on, as far as the report needs it. */
interface LibraryLike {
	registerPlugin?: unknown
	isPluginRunning?: (id: string) => boolean
	getLogsForPlugin?: (id: string) => {
		module: string
		action: string
		found: boolean
		detail?: string
	}[]
}

/** What the diagnostics of one plugin offer. */
export interface Diagnostics {
	/** Tells the diagnostics which plugin it is, from the plugin's `start`. Call it first. */
	attach(plugin: AttachablePlugin): void
	/** Sets or replaces what the plugin tells the report. For plugins that cannot name it where the diagnostics are made. */
	configure(more: DiagnosticsOptions): void
	/** The plugin's name and version, as far as they are known yet. */
	info(): { id: string; name: string; version: string }
	/** Notes something that happened. */
	log(area: string, text: string, level?: DiagLevel): void
	/** Notes something that went wrong, with the error's message. */
	fail(area: string, error: unknown): void
	/** Runs `fn`, notes any error it throws and returns `undefined` instead of throwing. */
	guard<T>(area: string, fn: () => T): T | undefined
	/**
	 * Installs a patch and notes whether it worked. Returns what the installer returned, or a function that does nothing
	 * when it threw, so the result can always go straight into `cleanup`.
	 */
	apply(
		name: string,
		install: () => (() => void) | undefined | void,
	): () => void
	/** Sets the answer to a named question, replacing the last answer to the same one. */
	check(label: string, ok: boolean, detail?: string): void
	/** Starts copying the plugin's console messages into the log. Returns what stops it. */
	listen(): () => void
	/** Everything noted so far, oldest first. */
	entries(): readonly DiagEntry[]
	/** The checks noted with {@link Diagnostics.check} plus the ones the plugin answers when asked. */
	runChecks(): DiagCheck[]
	/** The whole report as text. */
	buildReport(): string
	/** Puts the report on the clipboard. Returns whether that worked. */
	copyLogs(): boolean
	/** Forgets the events and the answers noted so far. */
	clear(): void
	/** Calls `fn` whenever something is noted. Returns what stops it. */
	subscribe(fn: () => void): () => void
}

/** Two digits. */
function two(n: number): string {
	return n < 10 ? `0${n}` : String(n)
}

/** `14:03:09` for a time. */
export function clock(at: number): string {
	const d = new Date(at)
	return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`
}

/** The message of an error, or what it is when it is not one. */
export function describeError(error: unknown): string {
	if (error instanceof Error) return error.message || error.name
	if (typeof error === 'string') return error
	if (error && typeof error === 'object') {
		const message = (error as { message?: unknown }).message
		if (typeof message === 'string') return message
		try {
			return JSON.stringify(error)
		} catch {
			// Fall through to the plain text.
		}
	}
	return String(error)
}

/** The first lines of an error's stack, which is where the cause is. */
function stackOf(error: unknown): string | undefined {
	const stack = error instanceof Error ? error.stack : undefined
	return stack
		?.split('\n')
		.slice(0, 6)
		.map(line => line.trim())
		.join(' | ')
}

/** Version text for a manifest version. */
function versionText(
	version: { nums?: number[]; label?: string } | undefined,
): string {
	if (!version?.nums) return 'unknown'
	return version.nums.join('.') + (version.label ? `-${version.label}` : '')
}

/** What the report says about the phone and Discord. */
function environmentLines(): string[] {
	const lines: string[] = []
	try {
		const info = ClientInfoModule.getConstants()
		lines.push(
			`Discord: ${info.Version} (build ${info.Build}, ${info.ReleaseChannel})`,
		)
	} catch {
		lines.push('Discord: version not readable')
	}
	try {
		lines.push(`Phone: ${Platform.OS} ${Platform.Version}`)
	} catch {
		lines.push('Phone: not readable')
	}
	try {
		const hermes = (
			globalThis as {
				HermesInternal?: {
					getRuntimeProperties?: () => Record<string, string>
				}
			}
		).HermesInternal?.getRuntimeProperties?.()
		if (hermes)
			lines.push(
				`Hermes: ${hermes['OSS Release Version'] ?? '?'} (bytecode ${hermes['Bytecode Version'] ?? '?'})`,
			)
	} catch {
		// Not every runtime says what it is.
	}
	return lines
}

/** Makes the diagnostics of one plugin. */
export function createDiagnostics(
	fallbackName: string,
	initial: DiagnosticsOptions = {},
): Diagnostics {
	const options: DiagnosticsOptions = { ...initial }
	const entries: DiagEntry[] = []
	const checks = new Map<string, DiagCheck>()
	const listeners = new Set<() => void>()
	let attached: AttachablePlugin | undefined

	const changed = () => {
		for (const fn of [...listeners]) {
			try {
				fn()
			} catch {
				// A screen that is gone must not break the others.
			}
		}
	}

	const library = (): LibraryLike | undefined => {
		try {
			return (attached?.api?.unscoped as { kmmiio?: LibraryLike } | undefined)
				?.kmmiio
		} catch {
			return undefined
		}
	}

	const log: Diagnostics['log'] = (area, text, level = 'info') => {
		entries.push({ at: Date.now(), level, area, text })
		if (entries.length > MAX_ENTRIES)
			entries.splice(0, entries.length - MAX_ENTRIES)
		changed()
	}

	const check: Diagnostics['check'] = (label, ok, detail) => {
		checks.set(label, { ok, label, detail })
		changed()
	}

	const fail: Diagnostics['fail'] = (area, error) => {
		const stack = stackOf(error)
		log(
			area,
			stack ? `${describeError(error)} (${stack})` : describeError(error),
			'error',
		)
	}

	const runChecks = (): DiagCheck[] => {
		const out: DiagCheck[] = []
		const plugin = attached
		if (plugin) {
			out.push({
				ok: true,
				label: 'Plugin started',
				detail: `${plugin.manifest.id} ${versionText(plugin.manifest.version)}`,
			})
			const errors = plugin.errors ?? []
			out.push({
				ok: errors.length === 0,
				label: 'No errors reported to Valenced',
				detail: errors.length
					? errors.map(describeError).slice(0, 3).join(' | ')
					: undefined,
			})
			const needsLibrary = Boolean(
				plugin.manifest.dependencies?.['marklong.kmmiio-lib'],
			)
			if (needsLibrary) {
				// The library does not register itself with itself, so asking it whether it is running always says no.
				// Its API being on the plugin API is what shows it is running.
				let running = false
				try {
					running = typeof library()?.registerPlugin === 'function'
				} catch {
					running = false
				}
				out.push({
					ok: running,
					label: 'kmmiio Library is running',
					detail: running
						? undefined
						: 'Install and enable "kmmiio Library", then restart Discord',
				})
			}
			try {
				for (const used of library()?.getLogsForPlugin?.(plugin.manifest.id) ??
					[]) {
					out.push({
						ok: used.found,
						label: `Library: ${used.module} ${used.action}`,
						detail: used.detail,
					})
				}
			} catch {
				// The library is optional for the report.
			}
		}
		out.push(...checks.values())
		try {
			out.push(...(options.checks?.() ?? []))
		} catch (error) {
			out.push({
				ok: false,
				label: 'A plugin check failed',
				detail: describeError(error),
			})
		}
		return out
	}

	const buildReport = (): string => {
		const plugin = attached
		const name = plugin?.manifest.name ?? fallbackName
		const lines: string[] = [
			`${name} debug report`,
			`Original plugin by ${ORIGINAL_AUTHOR.name} (${ORIGINAL_AUTHOR.website}), ${LICENSE}`,
			`Ported to Valenced by ${PORTER.name}`,
			`Plugin: ${plugin?.manifest.id ?? 'not started'} ${versionText(plugin?.manifest.version)}`,
			`Created: ${new Date().toISOString()}`,
			'',
			'ENVIRONMENT',
			...environmentLines(),
		]
		if (plugin?.manifest.dependencies) {
			lines.push(
				`Needs: ${Object.entries(plugin.manifest.dependencies)
					.map(([id, c]) => `${id} ${c.version ?? ''}`.trim())
					.join(', ')}`,
			)
		}
		try {
			if (options.settings)
				lines.push('', 'SETTINGS (secrets hidden)', redact(options.settings()))
		} catch (error) {
			lines.push('', `SETTINGS: not readable (${describeError(error)})`)
		}
		try {
			const extra = options.extra?.() ?? []
			if (extra.length) lines.push('', 'STATE', ...extra)
		} catch (error) {
			lines.push('', `STATE: not readable (${describeError(error)})`)
		}
		lines.push('', 'CHECKS')
		for (const c of runChecks())
			lines.push(
				`${c.ok ? 'ok  ' : 'FAIL'} ${c.label}${c.detail ? ` - ${c.detail}` : ''}`,
			)
		lines.push('', `EVENTS (${entries.length}, oldest first)`)
		if (entries.length === 0) lines.push('none yet')
		for (const e of entries)
			lines.push(
				`${clock(e.at)} ${e.level.toUpperCase().padEnd(5)} [${e.area}] ${e.text}`,
			)
		return lines.join('\n')
	}

	return {
		attach(plugin) {
			attached = plugin
			log(
				'plugin',
				`started ${plugin.manifest.id} ${versionText(plugin.manifest.version)}`,
			)
		},
		configure(more) {
			Object.assign(options, more)
		},
		info: () => ({
			id: attached?.manifest.id ?? 'not started',
			name: attached?.manifest.name ?? fallbackName,
			version: versionText(attached?.manifest.version),
		}),
		log,
		fail,
		guard(area, fn) {
			try {
				return fn()
			} catch (error) {
				fail(area, error)
				return undefined
			}
		},
		apply(name, install) {
			try {
				const undo = install()
				check(`Patch: ${name}`, true, 'installed')
				log('patch', `${name} installed`)
				return typeof undo === 'function' ? undo : () => {}
			} catch (error) {
				check(`Patch: ${name}`, false, describeError(error))
				fail('patch', error)
				return () => {}
			}
		},
		check,
		listen() {
			const prefixes = options.consolePrefixes ?? []
			if (prefixes.length === 0) return () => {}
			const stops: (() => void)[] = []
			for (const key of ['warn', 'error'] as const) {
				try {
					stops.push(
						before(console, key, args => {
							const first = args[0]
							if (typeof first !== 'string') return args
							if (!prefixes.some(p => first.startsWith(p))) return args
							log(
								'console',
								args
									.map(a => (typeof a === 'string' ? a : describeError(a)))
									.join(' '),
								key,
							)
							return args
						}),
					)
				} catch {
					// Without the hook the report still has everything the plugin noted itself.
				}
			}
			return () => {
				for (const stop of stops) stop()
			}
		},
		entries: () => entries,
		runChecks,
		buildReport,
		copyLogs() {
			try {
				Clipboard.setString(buildReport())
				log('debug', 'report copied')
				return true
			} catch (error) {
				fail('debug', error)
				return false
			}
		},
		clear() {
			entries.length = 0
			checks.clear()
			changed()
		},
		subscribe(fn) {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},
	}
}
