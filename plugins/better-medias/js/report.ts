import { NativeModules } from 'react-native'
import { nativeReport } from './audio'
import { diag } from './diag'
import { call } from './native'
import { current } from './config'
import { isPlaying, videos } from './videos'

export const VERSION = '0.9.0'

/** Discord's native modules that look like they play media, with their methods: what there is to work with. */
function mediaModules(): string {
	try {
		return Object.keys(NativeModules as object)
			.filter(name => /media|audio|video|player|pip|sound/i.test(name))
			.map(name => {
				const module = (NativeModules as Record<string, any>)[name]
				const methods = module && typeof module === 'object' ? Object.keys(module).filter(k => typeof module[k] === 'function').slice(0, 12) : []
				return `${name}(${methods.join(',')})`
			})
			.join(' ')
	} catch {
		return '?'
	}
}

export async function buildReport(): Promise<string> {
	const lines = [
		'Better Medias report',
		`version: ${VERSION}`,
		`settings: ${JSON.stringify(current())}`,
		`found: ${JSON.stringify(diag.found)}`,
		`counts: ${JSON.stringify(diag.counts)}`,
		`videos now: ${[...videos.values()].map(v => `${v.title}${v.muted ? ' (muted)' : ''} ${isPlaying(v) ? 'playing' : 'paused'} ${Math.round(v.time)}/${Math.round(v.duration)}s`).join(' | ') || 'none'}`,
		nativeReport(),
		`media modules: ${mediaModules()}`,
		`notes: ${diag.notes.join(' | ') || 'none'}`,
	]
	const native = await call('report', [])
	lines.push(native ? `--- native ---\n${native}` : '--- native part did not answer (not loaded?) ---')
	return lines.join('\n')
}
