/**
 * Scans one plugin: the rules, the links, and what they mean together.
 *
 * The scan only reads text. It never runs the plugin's code.
 */

import { sha256 } from './hash'
import { findLinks } from './links'
import { COMBOS, MANIFEST_RULES, RULES, SEVERITIES, WEIGHT } from './rules'
import type {
	Combo,
	Finding,
	InstalledPlugin,
	PluginScan,
	Risk,
	Severity,
} from './types'

/** The most matches counted for one rule, so a huge file cannot take long. */
const MAX_MATCHES = 400

/** The most samples kept for one finding. */
const MAX_SAMPLES = 3

/** How much code is kept on each side of a match in a sample. */
const CONTEXT = 34

/** The longest sample. */
const MAX_SAMPLE = 120

/** A little code around a match, on one line. */
function sampleAround(source: string, start: number, length: number): string {
	const from = Math.max(0, start - CONTEXT)
	const to = Math.min(source.length, start + length + CONTEXT)
	const text = source.slice(from, to).replace(/\s+/g, ' ').trim()
	const cut = text.length > MAX_SAMPLE ? `${text.slice(0, MAX_SAMPLE)}…` : text
	return `${from > 0 ? '…' : ''}${cut}${to < source.length ? '…' : ''}`
}

/** Runs every rule over the code. */
export function findFindings(source: string): Finding[] {
	const found: Finding[] = []
	for (const rule of RULES) {
		let count = 0
		const samples: string[] = []
		for (const match of source.matchAll(rule.pattern)) {
			count++
			if (samples.length < MAX_SAMPLES && match.index !== undefined)
				samples.push(sampleAround(source, match.index, match[0].length))
			if (count >= MAX_MATCHES) break
		}
		if (count === 0 || count < (rule.min ?? 1)) continue
		found.push({
			rule: rule.id,
			category: rule.category,
			severity: rule.severity,
			title: rule.title,
			why: rule.why,
			count,
			samples,
		})
	}
	return found
}

/** The findings that come from what the manifest says the plugin depends on. */
function manifestFindings(dependencies: readonly string[]): Finding[] {
	const found: Finding[] = []
	for (const rule of MANIFEST_RULES) {
		if (!dependencies.includes(rule.dependency)) continue
		found.push({
			rule: `manifest.${rule.dependency}`,
			category: rule.category,
			severity: rule.severity,
			title: rule.title,
			why: rule.why,
			count: 1,
			samples: [rule.dependency],
		})
	}
	return found
}

/** The most serious severity of a list, or `null` for an empty list. */
function highest(severities: readonly Severity[]): Severity | null {
	for (const s of SEVERITIES) if (severities.includes(s)) return s
	return null
}

/** How far a plugin's code can reach: to a place that is not known, only to known places, or nowhere. */
function reach(
	findings: readonly Finding[],
	links: PluginScan['links'],
): 'outside' | 'known' | 'none' {
	if (links.some(l => l.kind === 'unknown' || l.kind === 'risky'))
		return 'outside'
	const online = findings.some(f =>
		['net.fetch', 'net.socket', 'write.method', 'write.http'].includes(f.rule),
	)
	return online || links.some(l => l.kind === 'known') ? 'known' : 'none'
}

/** One step down in severity. */
function milder(severity: Severity): Severity {
	return SEVERITIES[
		Math.min(SEVERITIES.length - 1, SEVERITIES.indexOf(severity) + 1)
	] as Severity
}

/** The combos that apply. */
function findCombos(
	findings: readonly Finding[],
	links: PluginScan['links'],
): Combo[] {
	const ids = new Set(findings.map(f => f.rule))
	const where = reach(findings, links)
	const out: Combo[] = []
	for (const combo of COMBOS) {
		if (where === 'none') continue
		if (!combo.has.every(id => ids.has(id))) continue
		if (where === 'outside') {
			out.push({
				id: combo.id,
				severity: combo.severity,
				title: combo.title,
				why: combo.why,
			})
		} else if (combo.soft !== false) {
			out.push({
				id: combo.id,
				severity: milder(combo.severity),
				title: `${combo.title} (known places only)`,
				why: `${combo.why} Every link in its code is a known place, which makes it less likely.`,
			})
		}
	}
	return out
}

/** The findings that come from risky links. One for each reason. */
function linkFindings(links: PluginScan['links']): Finding[] {
	const byReason = new Map<string, Finding>()
	for (const link of links) {
		if (link.kind !== 'risky' || !link.reason) continue
		const existing = byReason.get(link.reason)
		if (existing) {
			existing.count++
			if (existing.samples.length < MAX_SAMPLES) existing.samples.push(link.url)
			continue
		}
		const webhook = /webhook/i.test(link.reason)
		const logger = /logger|Telegram/i.test(link.reason)
		byReason.set(link.reason, {
			rule: 'exfil.link',
			category: 'exfil',
			severity: webhook || logger ? 'critical' : 'high',
			title: webhook
				? 'Has a Discord webhook'
				: logger
					? 'Has an IP logger or bot link'
					: 'Has a link to a suspicious place',
			why: link.reason,
			count: 1,
			samples: [link.url],
		})
	}
	return [...byReason.values()]
}

/** The risk of a plugin, from the worst thing found. */
export function riskOf(
	findings: readonly Finding[],
	combos: readonly Combo[],
): Risk {
	return (
		highest([
			...findings.map(f => f.severity),
			...combos.map(c => c.severity),
		]) ?? 'clean'
	)
}

/** A number to sort plugins by: more and worse findings come first. */
export function scoreOf(
	findings: readonly Finding[],
	combos: readonly Combo[],
): number {
	let score = 0
	for (const f of findings) score += WEIGHT[f.severity]
	for (const c of combos) score += WEIGHT[c.severity]
	return Math.min(100, score)
}

/**
 * Scans one plugin.
 *
 * @param plugin The plugin and its code.
 * @returns What was found. A plugin without code is not an error: it just has nothing to scan.
 */
export function scanPlugin(plugin: InstalledPlugin): PluginScan {
	const { script, ...info } = plugin
	const hasCode = typeof script === 'string' && script.length > 0
	const links = hasCode ? findLinks(script) : []
	const findings = [
		...(hasCode ? findFindings(script) : []),
		...linkFindings(links),
		...manifestFindings(plugin.dependencies),
	]
	if (plugin.native) {
		findings.push({
			rule: 'native.part',
			category: 'native',
			severity: 'low',
			title: 'Has a native (Android) part',
			why: 'Native code runs outside JavaScript and can do anything the app can. This scan only reads the JavaScript.',
			count: 1,
			samples: [],
		})
	}
	findings.sort(
		(a, b) =>
			SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) ||
			b.count - a.count,
	)
	const combos = findCombos(findings, links)
	return {
		plugin: info,
		sha256: hasCode ? sha256(script) : null,
		size: hasCode ? script.length : 0,
		findings,
		combos,
		links,
		risk: riskOf(findings, combos),
		score: scoreOf(findings, combos),
		problem: hasCode ? undefined : 'Valenced did not give any code for it',
	}
}

/** Plain words for a risk. */
export const RISK_LABEL: Record<Risk, string> = {
	critical: 'Critical',
	high: 'High',
	medium: 'Medium',
	low: 'Low',
	clean: 'Clean',
}

/**
 * What identifies a finding when the user chooses to ignore it. Most rules are one finding each; the suspicious-link
 * finding is one per reason, so a webhook can be ignored without ignoring an IP logger.
 */
export function findingKey(finding: Finding): string {
	return finding.rule === 'exfil.link'
		? `${finding.rule}:${finding.title}`
		: finding.rule
}

/** A plugin as the user chose to see it: what is left after the findings they ignore. */
export interface Judged {
	/** The findings that still count. */
	findings: Finding[]
	/** The combos that still count. A combo goes when a finding it is made of is ignored. */
	combos: Combo[]
	/** The findings the user ignores, shown apart. */
	ignored: Finding[]
	risk: Risk
}

/**
 * Applies the user's ignored findings to a scan.
 *
 * @param scan What the scan found, which is never changed.
 * @param ignoredKeys The {@link findingKey}s the user ignores for this plugin.
 */
export function judge(
	scan: PluginScan,
	ignoredKeys: readonly string[],
): Judged {
	if (ignoredKeys.length === 0) {
		return {
			findings: scan.findings,
			combos: scan.combos,
			ignored: [],
			risk: scan.risk,
		}
	}
	const gone = new Set(ignoredKeys)
	const findings = scan.findings.filter(f => !gone.has(findingKey(f)))
	const ignored = scan.findings.filter(f => gone.has(findingKey(f)))
	const goneRules = new Set(ignored.map(f => f.rule))
	const parts = new Map(COMBOS.map(c => [c.id, c.has]))
	const combos = scan.combos.filter(
		c => !(parts.get(c.id) ?? []).some(rule => goneRules.has(rule)),
	)
	return { findings, combos, ignored, risk: riskOf(findings, combos) }
}

/** Whether a plugin needs the user's eyes: high or critical, and not on the whitelist. */
export function needsAttention(risk: Risk, whitelisted: boolean): boolean {
	return !whitelisted && (risk === 'critical' || risk === 'high')
}
