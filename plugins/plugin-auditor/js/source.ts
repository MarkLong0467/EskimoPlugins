/**
 * Gets the installed plugins and their code.
 *
 * Valenced keeps its live plugin list behind the hidden developer API, which a plugin cannot count on. The list also comes
 * from the native side (`valenced.plugins.list`), which hands over every plugin's manifest and JavaScript. That is tried
 * first. If it does not work, the hidden list is tried, and each plugin's code is then read from its folder.
 */

import { callNativeMethod } from '@valenced/modules/native'
import { readFile } from '@valenced/modules/native/fs'
import { pluginDistDirFor } from '@valenced/plugins/constants'
import { diag } from './diag'
import type { InstalledPlugin } from './types'

/** Where the list came from, for the report. */
export type ListSource = 'native list' | 'hidden list + files' | 'none'

/** What listing the plugins gave. */
export interface Listing {
	plugins: InstalledPlugin[]
	via: ListSource
	/** What went wrong on the ways that did not work. */
	notes: string[]
}

/** One entry as the native list gives it, as far as this file reads it. */
interface NativePayload {
	manifest?: {
		id?: string
		name?: string
		description?: string
		author?: string
		version?: { nums?: number[]; label?: string }
		dependencies?: Record<string, unknown>
	}
	script?: string | null
	internal?: boolean
	source?: { repo?: string | null } | null
}

/** A version as text. */
function versionText(
	version: { nums?: number[]; label?: string } | undefined,
): string {
	if (!version?.nums) return '?'
	return version.nums.join('.') + (version.label ? `-${version.label}` : '')
}

/** The name without the link and Discord id parts: `Mark (https://x "GitHub")` gives `Mark`. */
function authorName(author: string | undefined): string {
	return (author ?? '').replace(/\s*[<(].*$/, '').trim() || 'unknown'
}

/** Turns one native entry into a plugin, or `null` when it has no id. */
function fromNative(entry: NativePayload): InstalledPlugin | null {
	const manifest = entry.manifest
	if (!manifest?.id) return null
	return {
		id: manifest.id,
		name: manifest.name ?? manifest.id,
		version: versionText(manifest.version),
		author: authorName(manifest.author),
		description: manifest.description ?? '',
		internal: !!entry.internal,
		repo: entry.source?.repo ?? null,
		dependencies: Object.keys(manifest.dependencies ?? {}),
		script: typeof entry.script === 'string' ? entry.script : null,
		native: false,
	}
}

/** The list from the native side. The answer is the list itself or an object that holds it as `result`. */
async function nativeList(): Promise<InstalledPlugin[]> {
	const call = callNativeMethod as unknown as (
		name: string,
		args: unknown[],
	) => Promise<unknown>
	let answer = await call('valenced.plugins.list', [])
	if (typeof answer === 'string') answer = JSON.parse(answer)
	const list = Array.isArray(answer)
		? answer
		: (answer as { result?: unknown } | null)?.result
	if (!Array.isArray(list)) throw new Error('the answer was not a list')
	const out: InstalledPlugin[] = []
	for (const entry of list as NativePayload[]) {
		const plugin = fromNative(entry)
		if (plugin) out.push(plugin)
	}
	return out
}

/** The manifest of a plugin as it is on disk, or `null` when it cannot be read. */
async function diskManifest(
	id: string,
): Promise<{ dist?: { script?: string; android?: unknown } } | null> {
	try {
		const text = await readFile(`${pluginDistDirFor(id)}/manifest.json`)
		return JSON.parse(text)
	} catch {
		return null
	}
}

/** Fills in which plugins have a native part, from each plugin's manifest on disk. */
async function markNative(plugins: InstalledPlugin[]): Promise<number> {
	let read = 0
	for (const plugin of plugins) {
		if (plugin.internal) continue
		const manifest = await diskManifest(plugin.id)
		if (!manifest) continue
		read++
		plugin.native = !!manifest.dist?.android
	}
	return read
}

/** The list from the hidden developer API, with each plugin's code read from its folder. */
async function hiddenList(): Promise<InstalledPlugin[]> {
	const hidden = (
		globalThis as unknown as {
			valenced?: {
				hidden?: { plugins?: { internal?: { pList?: Map<string, unknown> } } }
			}
		}
	).valenced?.hidden?.plugins?.internal?.pList
	if (!hidden || typeof hidden.values !== 'function')
		throw new Error('the hidden developer API is not on')
	const out: InstalledPlugin[] = []
	for (const entry of hidden.values()) {
		const manifest = (entry as NativePayload).manifest
		if (!manifest?.id) continue
		const disk = await diskManifest(manifest.id)
		let script: string | null = null
		const file = disk?.dist?.script
		if (file) {
			try {
				script = await readFile(`${pluginDistDirFor(manifest.id)}/${file}`)
			} catch {
				script = null
			}
		}
		out.push({
			...(fromNative({ manifest, script, internal: false }) as InstalledPlugin),
			native: !!disk?.dist?.android,
		})
	}
	return out
}

/** Lists the installed plugins by the best way that works. Never throws. */
export async function listInstalled(): Promise<Listing> {
	const notes: string[] = []
	try {
		const plugins = await nativeList()
		const read = await markNative(plugins)
		diag.log(
			'source',
			`native list: ${plugins.length} plugins, ${read} manifests read from disk`,
		)
		return { plugins, via: 'native list', notes }
	} catch (error) {
		notes.push(`native list failed: ${describe(error)}`)
		diag.fail('source', error)
	}
	try {
		const plugins = await hiddenList()
		diag.log('source', `hidden list: ${plugins.length} plugins`)
		return { plugins, via: 'hidden list + files', notes }
	} catch (error) {
		notes.push(`hidden list failed: ${describe(error)}`)
		diag.fail('source', error)
	}
	return { plugins: [], via: 'none', notes }
}

/** The message of an error. */
function describe(error: unknown): string {
	return error instanceof Error ? error.message : String(error)
}
