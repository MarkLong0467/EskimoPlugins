/**
 * The auditor: runs scans, keeps what they found, and runs the VirusTotal checks.
 *
 * The screens read it and ask it to do things, and it tells them when something changed. All of it lives in memory except
 * the settings (the whitelist, the ignored findings and VirusTotal answers), which are saved.
 */

import { replaceMap, saveSettings, setting } from './config'
import {
	AUTO_SCAN_DELAY_MS,
	SELF_ID,
	VT_CACHE_MAX,
	VT_CACHE_MS,
	VT_DOMAINS_PER_RUN,
} from './constants'
import { diag } from './diag'
import { findDuplicates, phrasesOf, stringsOf } from './duplicates'
import { sha256 } from './hash'
import { RULES } from './rules'
import { judge, needsAttention, RISK_LABEL, scanPlugin } from './scan'
import { listInstalled } from './source'
import {
	domainLink,
	fileLink,
	hybridLink,
	lookupDomain,
	lookupFile,
	resetPacing,
	testKey,
	uploadFile,
	vtLog,
} from './virustotal'
import type { DuplicateInput } from './duplicates'
import type { Judged } from './scan'
import type { ListSource } from './source'
import type {
	DuplicateGroup,
	LinkHit,
	LinkKind,
	PluginScan,
	Risk,
	VtVerdict,
	WhitelistEntry,
} from './types'
import type { VtFailure, VtOptions } from './virustotal'

/** Where a scan is. */
export type ScanStatus = 'idle' | 'scanning' | 'done' | 'failed'

/** What the screens see. */
export interface AuditState {
	status: ScanStatus
	done: number
	total: number
	current: string
	startedAt: number
	finishedAt: number
	via: ListSource | null
	scans: readonly PluginScan[]
	groups: readonly DuplicateGroup[]
	/** What went wrong on the ways of listing plugins that did not work. */
	notes: readonly string[]
	error: string | null
}

/** One place that plugins link to, with who links to it. */
export interface HostEntry {
	host: string
	kind: LinkKind
	reason?: string
	urls: string[]
	plugins: string[]
}

/** A running VirusTotal job, for the screens. */
export interface VtJob {
	text: string
}

/** The words for why a VirusTotal request failed, with what to do. */
export const VT_ADVICE: Record<VtFailure, string> = {
	'no-key': 'Add your VirusTotal key in Options.',
	key: 'VirusTotal did not accept the key. Check it in Options.',
	rate: 'Too many requests. Free keys get 4 a minute and 500 a day.',
	network: 'No answer from VirusTotal. Check your connection and try again.',
	http: 'VirusTotal had a problem. Try again later.',
	answer: 'VirusTotal gave an answer this plugin does not understand.',
	'too-big': 'The file is too big to upload.',
}

/** A pause that lets the screen draw between plugins. */
const breathe = () => new Promise<void>(resolve => setTimeout(resolve, 0))

/** Order of the risk levels for sorting. */
const RISK_ORDER: Record<Risk, number> = {
	critical: 0,
	high: 1,
	medium: 2,
	low: 3,
	clean: 4,
}

/** Order of link kinds for sorting. */
const KIND_ORDER: Record<LinkKind, number> = {
	risky: 0,
	unknown: 1,
	known: 2,
	noise: 3,
}

/** Makes the auditor. There is one, below. */
function createAuditor() {
	let state: AuditState = {
		status: 'idle',
		done: 0,
		total: 0,
		current: '',
		startedAt: 0,
		finishedAt: 0,
		via: null,
		scans: [],
		groups: [],
		notes: [],
		error: null,
	}
	const listeners = new Set<() => void>()
	const jobs = new Map<string, VtJob>()
	const timings: { id: string; ms: number; size: number }[] = []
	const scanErrors: string[] = []
	let autoTimer: ReturnType<typeof setTimeout> | undefined
	let running: Promise<void> | undefined
	let stopped = false

	const changed = () => {
		for (const fn of [...listeners]) {
			try {
				fn()
			} catch {
				// A screen that is gone must not break the others.
			}
		}
	}

	const patch = (next: Partial<AuditState>) => {
		state = { ...state, ...next }
		changed()
	}

	const vtOptions = (): VtOptions => ({
		key: String(setting('vtKey') || '').trim(),
		fast: !!setting('vtFast'),
	})

	/** The saved VirusTotal answer for a key, if it is not too old. */
	const cached = (key: string, ignoreAge = false): VtVerdict | undefined => {
		const hit = setting('vtCache')[key]
		if (!hit) return undefined
		return ignoreAge || Date.now() - hit.checkedAt < VT_CACHE_MS
			? hit
			: undefined
	}

	/** Saves a VirusTotal answer and drops the oldest ones when there are too many. */
	const remember = (key: string, verdict: VtVerdict) => {
		const all = { ...setting('vtCache'), [key]: verdict }
		const keys = Object.keys(all)
		if (keys.length > VT_CACHE_MAX) {
			keys.sort((a, b) => (all[a]?.checkedAt ?? 0) - (all[b]?.checkedAt ?? 0))
			for (const old of keys.slice(0, keys.length - VT_CACHE_MAX))
				delete all[old]
			replaceMap('vtCache', all)
		} else {
			saveSettings({ vtCache: { [key]: verdict } })
		}
	}

	const api = {
		/** What the screens see. */
		state: () => state,

		/** Calls `fn` whenever something changes. Returns what stops it. */
		subscribe(fn: () => void): () => void {
			listeners.add(fn)
			return () => {
				listeners.delete(fn)
			}
		},

		/** The scan of one plugin. */
		scanOf: (id: string) => state.scans.find(s => s.plugin.id === id),

		/**
		 * The whitelist entry of a plugin. An entry saved by version 1.0.3 is only `true`: it has no version yet, and gets
		 * the plugin's current one at the next scan.
		 */
		whitelistEntry(id: string): WhitelistEntry | undefined {
			const raw = setting('whitelist')[id] as WhitelistEntry | true | undefined
			if (!raw) return undefined
			return raw === true ? { version: '', ignoreUpdates: false } : raw
		},

		/** Whether the plugin is on the whitelist. */
		isWhitelisted: (id: string): boolean => !!setting('whitelist')[id],

		/**
		 * Puts a plugin on the whitelist at the version it has now. It does not count as needing attention, and the start-up
		 * alert leaves it out. When it updates and turns critical it is shown again (see {@link updateAlert}); tapping this
		 * again accepts the new version.
		 */
		whitelist(id: string): void {
			const version = api.scanOf(id)?.plugin.version ?? ''
			saveSettings({
				whitelist: {
					[id]: {
						version,
						ignoreUpdates: api.whitelistEntry(id)?.ignoreUpdates ?? false,
					},
				},
			})
			diag.log('whitelist', `${id} added at ${version || 'an unknown version'}`)
			changed()
		},

		/** Turns the "show it again when it updates and is critical" check off or on for a whitelisted plugin. */
		setIgnoreUpdates(id: string, ignore: boolean): void {
			const entry = api.whitelistEntry(id)
			if (!entry) return
			saveSettings({
				whitelist: { [id]: { version: entry.version, ignoreUpdates: ignore } },
			})
			diag.log(
				'whitelist',
				`${id}: update checks ${ignore ? 'ignored' : 'on again'}`,
			)
			changed()
		},

		/**
		 * Whether a whitelisted plugin must be shown again: it is a different version from the one that was whitelisted, it
		 * is critical now (after the findings the user ignores), and the user did not turn update checks off for it.
		 */
		updateAlert(scan: PluginScan): boolean {
			const entry = api.whitelistEntry(scan.plugin.id)
			return (
				!!entry &&
				!entry.ignoreUpdates &&
				entry.version !== '' &&
				entry.version !== scan.plugin.version &&
				api.view(scan).risk === 'critical'
			)
		},

		/** Takes a plugin off the whitelist. */
		unwhitelist(id: string): void {
			const next = { ...setting('whitelist') }
			delete next[id]
			replaceMap('whitelist', next)
			diag.log('whitelist', `${id} removed`)
			changed()
		},

		/** The finding keys the user ignores for a plugin. */
		ignoredKeys: (id: string): string[] => setting('ignored')[id] ?? [],

		/** Ignores one finding of one plugin, or stops ignoring it. */
		setIgnored(id: string, key: string, ignore: boolean): void {
			const all = { ...setting('ignored') }
			const keys = new Set(all[id] ?? [])
			if (ignore) keys.add(key)
			else keys.delete(key)
			if (keys.size > 0) all[id] = [...keys]
			else delete all[id]
			replaceMap('ignored', all)
			diag.log(
				'whitelist',
				`${id}: ${key} ${ignore ? 'ignored' : 'noticed again'}`,
			)
			changed()
		},

		/** What is left of a plugin's scan after the findings the user ignores. */
		view: (scan: PluginScan): Judged =>
			judge(scan, api.ignoredKeys(scan.plugin.id)),

		/**
		 * Whether a plugin needs attention: high or critical after the ignored findings and not whitelisted, or whitelisted
		 * but updated to a different version and critical now.
		 */
		needsAttention: (scan: PluginScan): boolean =>
			needsAttention(api.view(scan).risk, api.isWhitelisted(scan.plugin.id)) ||
			api.updateAlert(scan),

		/** Counts of plugins by risk (after ignored findings), not counting whitelisted ones as a problem. */
		summary() {
			const counts: Record<Risk, number> = {
				critical: 0,
				high: 0,
				medium: 0,
				low: 0,
				clean: 0,
			}
			let attention = 0
			let whitelisted = 0
			for (const scan of state.scans) {
				counts[api.view(scan).risk]++
				if (api.isWhitelisted(scan.plugin.id)) whitelisted++
				if (api.needsAttention(scan)) attention++
			}
			return { counts, attention, whitelisted, total: state.scans.length }
		},

		/** Every place that scanned plugins link to, worst first. */
		hosts(includeNoise: boolean): HostEntry[] {
			const byHost = new Map<string, HostEntry>()
			for (const scan of state.scans) {
				for (const link of scan.links) {
					if (link.kind === 'noise' && !includeNoise) continue
					let entry = byHost.get(link.host)
					if (!entry) {
						entry = { host: link.host, kind: link.kind, urls: [], plugins: [] }
						byHost.set(link.host, entry)
					}
					if (KIND_ORDER[link.kind] < KIND_ORDER[entry.kind]) {
						entry.kind = link.kind
					}
					if (link.reason && !entry.reason) entry.reason = link.reason
					if (!entry.urls.includes(link.url)) entry.urls.push(link.url)
					if (!entry.plugins.includes(scan.plugin.id))
						entry.plugins.push(scan.plugin.id)
				}
			}
			return [...byHost.values()].sort(
				(a, b) =>
					KIND_ORDER[a.kind] - KIND_ORDER[b.kind] ||
					b.plugins.length - a.plugins.length ||
					a.host.localeCompare(b.host),
			)
		},

		/** The name of a plugin by id, or the id if it is not scanned. */
		nameOf: (id: string) => api.scanOf(id)?.plugin.name ?? id,

		/** Scans every installed plugin. Does nothing if a scan is already running. */
		scan(): Promise<void> {
			if (running) return running
			running = (async () => {
				const started = Date.now()
				patch({
					status: 'scanning',
					done: 0,
					total: 0,
					current: 'Listing plugins…',
					startedAt: started,
					error: null,
					notes: [],
				})
				timings.length = 0
				scanErrors.length = 0
				try {
					const listing = await listInstalled()
					const wanted = listing.plugins.filter(
						p =>
							(setting('includeBuiltIn') || !p.internal) &&
							(setting('includeSelf') || p.id !== SELF_ID),
					)
					if (listing.via === 'none') {
						patch({
							status: 'failed',
							via: 'none',
							notes: listing.notes,
							error: 'Valenced would not list the installed plugins.',
							finishedAt: Date.now(),
						})
						diag.log('scan', 'no way to list plugins worked', 'error')
						return
					}
					patch({
						total: wanted.length,
						via: listing.via,
						notes: listing.notes,
					})
					const scans: PluginScan[] = []
					const inputs: DuplicateInput[] = []
					for (const plugin of wanted) {
						if (stopped) return
						patch({ current: plugin.name, done: scans.length })
						const t0 = Date.now()
						try {
							const scan = scanPlugin(plugin)
							scans.push(scan)
							inputs.push({
								scan,
								strings: plugin.script ? stringsOf(plugin.script) : new Set(),
								phrases: plugin.script ? phrasesOf(plugin.script) : new Set(),
							})
							timings.push({
								id: plugin.id,
								ms: Date.now() - t0,
								size: scan.size,
							})
						} catch (error) {
							const text = `${plugin.id}: ${error instanceof Error ? error.message : String(error)}`
							scanErrors.push(text)
							diag.fail('scan', error)
						}
						// Let the screen draw before the next plugin so the progress bar moves.
						await breathe()
					}
					scans.sort(
						(a, b) =>
							RISK_ORDER[a.risk] - RISK_ORDER[b.risk] ||
							b.score - a.score ||
							a.plugin.name.localeCompare(b.plugin.name),
					)
					let groups: DuplicateGroup[] = []
					try {
						groups = findDuplicates(inputs)
					} catch (error) {
						diag.fail('duplicates', error)
					}
					// A whitelist entry from 1.0.3 has no version yet: it gets the one the plugin has now.
					const legacy = Object.entries(setting('whitelist')).filter(
						([, entry]) => (entry as unknown) === true,
					)
					if (legacy.length > 0) {
						const all = { ...setting('whitelist') }
						for (const [id] of legacy)
							all[id] = {
								version:
									scans.find(s => s.plugin.id === id)?.plugin.version ?? '',
								ignoreUpdates: false,
							}
						replaceMap('whitelist', all)
					}
					patch({
						status: 'done',
						scans,
						groups,
						done: scans.length,
						total: scans.length,
						current: '',
						finishedAt: Date.now(),
					})
					diag.log(
						'scan',
						`${scans.length} plugins in ${Date.now() - started} ms, ${groups.length} duplicate group(s)`,
					)
				} catch (error) {
					diag.fail('scan', error)
					patch({
						status: 'failed',
						error: error instanceof Error ? error.message : String(error),
						finishedAt: Date.now(),
					})
				}
			})().finally(() => {
				running = undefined
			})
			return running
		},

		/** Scans soon after the plugin starts, and tells the user if something serious turned up. */
		scheduleAutoScan(): () => void {
			stopped = false
			if (!setting('autoScan')) return () => {}
			autoTimer = setTimeout(async () => {
				await api.scan()
				if (!setting('notify')) return
				// Only high and critical plugins that are not whitelisted, after the findings the user ignores, and whitelisted
				// ones that updated and are critical now (marked, so it is clear why a whitelisted plugin is named).
				const names = state.scans
					.filter(scan => api.needsAttention(scan))
					.map(scan =>
						api.updateAlert(scan)
							? `${scan.plugin.name} (updated)`
							: scan.plugin.name,
					)
				if (names.length === 0) return
				diag.log('scan', `${names.length} plugin(s) need attention`, 'warn')
				api.onAttention?.(names)
			}, AUTO_SCAN_DELAY_MS)
			return () => {
				if (autoTimer) clearTimeout(autoTimer)
			}
		},

		/** Called after an automatic scan with the names of the plugins that need attention. Not called when there are none. */
		onAttention: undefined as undefined | ((names: string[]) => void),

		/** Forgets everything when the plugin stops. */
		stop(): void {
			stopped = true
			if (autoTimer) clearTimeout(autoTimer)
			jobs.clear()
			resetPacing()
			listeners.clear()
			state = { ...state, status: 'idle', scans: [], groups: [] }
		},

		// ---- VirusTotal ---------------------------------------------------------------------------------------------

		/** Whether a VirusTotal key is set. */
		hasKey: () => vtOptions().key.length > 0,

		/** The running VirusTotal job for something, if there is one. */
		job: (key: string) => jobs.get(key),

		/** The saved VirusTotal answer for a plugin's file. */
		fileVerdict: (scan: PluginScan) =>
			scan.sha256 ? cached(scan.sha256, true) : undefined,

		/** The saved VirusTotal answer for a domain. */
		domainVerdict: (host: string) => cached(`domain:${host}`, true),

		/** Links to look at the file or domain on the VirusTotal site and elsewhere, which need no key. */
		links: {
			file: fileLink,
			domain: domainLink,
			hybrid: hybridLink,
		},

		/** Checks that the key works. */
		async testKey(): Promise<{ ok: boolean; text: string }> {
			const result = await testKey(vtOptions())
			diag.log(
				'virustotal',
				`key test: ${result.ok ? 'ok' : result.reason}`,
				result.ok ? 'info' : 'warn',
			)
			return result.ok
				? { ok: true, text: 'The key works.' }
				: { ok: false, text: result.message }
		},

		/**
		 * Asks VirusTotal about a plugin's file by hash. Sends the hash only.
		 *
		 * @returns Nothing when it worked (the answer is saved and shown), or why it did not.
		 */
		async checkFile(scan: PluginScan): Promise<string | null> {
			if (!scan.sha256) return 'This plugin has no code to check.'
			const key = scan.sha256
			if (jobs.has(key)) return null
			jobs.set(key, { text: 'Asking VirusTotal…' })
			changed()
			try {
				const result = await lookupFile(key, vtOptions())
				if (!result.ok) {
					diag.log('virustotal', `file lookup failed: ${result.reason}`, 'warn')
					return `${result.message}. ${VT_ADVICE[result.reason]}`
				}
				remember(key, result.verdict)
				diag.log('virustotal', `${scan.plugin.id}: ${result.verdict.state}`)
				return null
			} finally {
				jobs.delete(key)
				changed()
			}
		},

		/** Uploads a plugin's code to VirusTotal and waits for the scan. Only call after the user agreed. */
		async uploadFile(scan: PluginScan): Promise<string | null> {
			if (!scan.sha256) return 'This plugin has no code to upload.'
			const key = scan.sha256
			if (jobs.has(key)) return null
			jobs.set(key, { text: 'Getting the code…' })
			changed()
			try {
				const listing = await listInstalled()
				const plugin = listing.plugins.find(p => p.id === scan.plugin.id)
				if (!plugin?.script) return 'Could not read the plugin code again.'
				if (sha256(plugin.script) !== key)
					return 'The plugin changed since the scan. Scan again first.'
				const result = await uploadFile(
					plugin.id,
					plugin.script,
					key,
					vtOptions(),
					text => {
						jobs.set(key, { text })
						changed()
					},
				)
				if (!result.ok) {
					diag.log('virustotal', `upload failed: ${result.reason}`, 'warn')
					return `${result.message}. ${VT_ADVICE[result.reason]}`
				}
				remember(key, result.verdict)
				diag.log(
					'virustotal',
					`${scan.plugin.id}: uploaded, ${result.verdict.state}`,
				)
				return null
			} finally {
				jobs.delete(key)
				changed()
			}
		},

		/** Asks VirusTotal about one domain. Sends the domain only. */
		async checkDomain(host: string): Promise<string | null> {
			const key = `domain:${host}`
			if (jobs.has(key)) return null
			jobs.set(key, { text: 'Asking VirusTotal…' })
			changed()
			try {
				const result = await lookupDomain(host, vtOptions())
				if (!result.ok) {
					diag.log(
						'virustotal',
						`domain lookup failed: ${result.reason}`,
						'warn',
					)
					return `${result.message}. ${VT_ADVICE[result.reason]}`
				}
				remember(key, result.verdict)
				return null
			} finally {
				jobs.delete(key)
				changed()
			}
		},

		/** Checks the places that are not known yet, a few at a time. Returns a line to show, or null if nothing was left. */
		async checkUnknownDomains(): Promise<string | null> {
			const todo = api
				.hosts(false)
				.filter(
					h =>
						(h.kind === 'unknown' || h.kind === 'risky') &&
						!cached(`domain:${h.host}`),
				)
				.slice(0, VT_DOMAINS_PER_RUN)
			if (todo.length === 0) return null
			let ok = 0
			for (const entry of todo) {
				const problem = await api.checkDomain(entry.host)
				if (problem) return `${problem} (${ok} of ${todo.length} done)`
				ok++
			}
			return `Checked ${ok} place${ok === 1 ? '' : 's'}.`
		},

		// ---- Reports ------------------------------------------------------------------------------------------------

		/** A text report of one plugin's scan, to paste into a chat. */
		reportFor(scan: PluginScan): string {
			const p = scan.plugin
			const view = api.view(scan)
			const lines = [
				`${p.name} ${p.version} (${p.id}) by ${p.author}`,
				`Risk: ${RISK_LABEL[view.risk]}${api.isWhitelisted(p.id) ? ` (whitelisted by the user at ${api.whitelistEntry(p.id)?.version || 'an unknown version'}${api.updateAlert(scan) ? '; UPDATED since and critical' : ''})` : ''}${view.ignored.length ? ` (${view.ignored.length} finding(s) ignored by the user)` : ''}`,
				`Code: ${scan.sha256 ? `${scan.size} characters, sha256 ${scan.sha256}` : 'none'}`,
			]
			for (const c of view.combos) lines.push(`!! ${c.title}: ${c.why}`)
			for (const f of view.findings) {
				lines.push(`[${f.severity.toUpperCase()}] ${f.title} (${f.count}x)`)
				for (const s of f.samples.slice(0, 2)) lines.push(`    ${s}`)
			}
			for (const f of view.ignored) lines.push(`(ignored) ${f.title}`)
			const links = scan.links.filter(l => l.kind !== 'noise')
			if (links.length) {
				lines.push('Links:')
				for (const l of links)
					lines.push(
						`  ${l.kind === 'risky' ? '!!' : '  '} ${l.url}${l.dynamic ? ' …' : ''}`,
					)
			}
			const verdict = api.fileVerdict(scan)
			if (verdict)
				lines.push(
					verdict.state === 'unknown'
						? 'VirusTotal: never seen this file'
						: `VirusTotal: ${verdict.malicious} malicious, ${verdict.suspicious} suspicious, ${verdict.harmless + verdict.undetected} clean`,
				)
			return lines.join('\n')
		},

		/** A text report of the whole scan. */
		report(): string {
			const s = api.summary()
			const lines = [
				'Plugin Auditor report',
				`Scanned ${s.total} plugins${state.via ? ` via ${state.via}` : ''}, ${s.attention} need attention`,
				`Critical ${s.counts.critical}, high ${s.counts.high}, medium ${s.counts.medium}, low ${s.counts.low}, clean ${s.counts.clean}`,
				'This is a read of the code for signs, not proof that a plugin is safe or harmful.',
				'',
			]
			for (const scan of state.scans) {
				if (api.view(scan).risk === 'clean') continue
				lines.push(api.reportFor(scan), '')
			}
			if (state.groups.length) {
				lines.push('DUPLICATES')
				for (const g of state.groups)
					lines.push(
						`- ${g.members.map(api.nameOf).join(' + ')}: ${g.reasons.join(', ')} (${g.confidence})`,
					)
				lines.push('')
			}
			const hosts = api.hosts(false)
			if (hosts.length) {
				lines.push('LINKS BY PLACE')
				for (const h of hosts)
					lines.push(
						`${h.kind === 'risky' ? '!!' : '  '} ${h.host} (${h.kind}) used by ${h.plugins.map(api.nameOf).join(', ')}`,
					)
			}
			return lines.join('\n')
		},

		/** All the links of a list of hosts, one per line, for copying. */
		linkList(hosts: readonly HostEntry[]): string {
			return hosts.flatMap(h => h.urls).join('\n')
		},

		// ---- Debugging ----------------------------------------------------------------------------------------------

		/** Lines for the debug report: how the last scan went, in numbers and names, never code. */
		reportLines(): string[] {
			const lines = [
				`Scan: ${state.status}${state.error ? ` (${state.error})` : ''}`,
				`Plugin list: ${state.via ?? 'not run yet'}${state.notes.length ? `; ${state.notes.join('; ')}` : ''}`,
				`Scanned: ${state.scans.length} plugins, ${state.groups.length} duplicate group(s)`,
				`Took: ${state.finishedAt && state.startedAt ? `${state.finishedAt - state.startedAt} ms` : 'n/a'}`,
				`Rules: ${RULES.length}`,
			]
			const noCode = state.scans.filter(s => !s.sha256).map(s => s.plugin.id)
			if (noCode.length)
				lines.push(`No code from Valenced for: ${noCode.join(', ')}`)
			const slow = [...timings].sort((a, b) => b.ms - a.ms).slice(0, 3)
			if (slow.length)
				lines.push(
					`Slowest: ${slow.map(t => `${t.id} ${t.ms} ms (${t.size} chars)`).join(', ')}`,
				)
			if (scanErrors.length)
				lines.push(`Scan errors: ${scanErrors.join(' | ')}`)
			const counts = new Map<string, number>()
			for (const scan of state.scans)
				for (const f of scan.findings)
					counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1)
			if (counts.size)
				lines.push(
					`Rules that matched (plugins): ${[...counts].map(([rule, n]) => `${rule}=${n}`).join(', ')}`,
				)
			lines.push('Plugins:')
			for (const scan of state.scans) {
				const p = scan.plugin
				lines.push(
					`  ${p.id} ${p.version} ${scan.risk} ${scan.findings.length}f ${scan.links.length}l ${scan.size}ch ${scan.sha256 ? scan.sha256.slice(0, 10) : 'no-code'}${p.internal ? ' built-in' : ''}${p.native ? ' native' : ''}${api.isWhitelisted(p.id) ? ` whitelisted@${api.whitelistEntry(p.id)?.version || '?'}${api.whitelistEntry(p.id)?.ignoreUpdates ? ' no-update-alerts' : ''}${api.updateAlert(scan) ? ' UPDATE-ALERT' : ''}` : ''}${api.ignoredKeys(p.id).length ? ` ignores=${api.ignoredKeys(p.id).join('+')}` : ''}`,
				)
			}
			lines.push(`VirusTotal key: ${vtOptions().key ? 'set' : 'not set'}`)
			const recent = vtLog().slice(-6)
			if (recent.length)
				lines.push(
					`VirusTotal requests: ${recent.map(r => `${r.what} ${r.status} ${r.ms} ms`).join(', ')}`,
				)
			return lines
		},

		/** Questions the self-check answers. */
		selfChecks() {
			const checks: { ok: boolean; label: string; detail?: string }[] = []
			const known = sha256('abc')
			checks.push({
				ok:
					known ===
					'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
				label: 'SHA-256 works on this phone',
				detail: known.slice(0, 16),
			})
			let lookbehind = false
			try {
				lookbehind = /(?<![a-z])x/.test('1x')
			} catch {
				lookbehind = false
			}
			checks.push({
				ok: lookbehind && typeof ''.matchAll === 'function',
				label: 'Regular expressions support what the rules need',
				detail: lookbehind
					? undefined
					: 'lookbehind is missing, so some rules cannot match',
			})
			checks.push({
				ok: RULES.every(r => r.pattern.flags.includes('g')),
				label: `${RULES.length} rules are valid`,
			})
			checks.push({
				ok: typeof fetch === 'function',
				label: 'Web requests are available (VirusTotal)',
			})
			checks.push({
				ok: state.via !== null && state.via !== 'none',
				label: 'Valenced lists the installed plugins',
				detail: state.via ?? 'run a scan first',
			})
			const noCode = state.scans.filter(s => !s.sha256).length
			checks.push({
				ok: state.scans.length > 0 && noCode === 0,
				label: 'Valenced gave code for every plugin',
				detail: state.scans.length
					? `${noCode} without code`
					: 'run a scan first',
			})
			checks.push({
				ok: state.status === 'done',
				label: 'The last scan finished',
				detail: state.error ?? state.status,
			})
			checks.push({
				ok: scanErrors.length === 0,
				label: 'No plugin broke the scanner',
				detail: scanErrors.slice(0, 2).join(' | ') || undefined,
			})
			const lastVt = vtLog().slice(-1)[0]
			checks.push({
				ok:
					!lastVt ||
					(typeof lastVt.status === 'number' && lastVt.status < 400) ||
					lastVt.status === 404,
				label: 'The last VirusTotal request worked',
				detail: lastVt ? `${lastVt.what} ${lastVt.status}` : 'none made',
			})
			return checks
		},
	}
	return api
}

/** The one auditor. */
export const auditor = createAuditor()

/** Whether a link is worth listing for a user who hides noise. */
export function visibleLink(link: LinkHit, hideNoise: boolean): boolean {
	return !(hideNoise && link.kind === 'noise')
}
