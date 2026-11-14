import { Linking } from 'react-native'
import { diag } from './diag'

/** The search engines and the address each takes the picture's address after, as in Equicord. */
export const Engines = {
	Google: 'https://lens.google.com/uploadbyurl?url=',
	Yandex: 'https://yandex.com/images/search?rpt=imageview&url=',
	SauceNAO: 'https://saucenao.com/search.php?url=',
	IQDB: 'https://iqdb.org/?url=',
	Bing: 'https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:',
	TinEye: 'https://www.tineye.com/search?url=',
	ImgOps: 'https://imgops.com/start?url=',
} as const

export type EngineName = keyof typeof Engines

/** How long to wait between the pages "All" opens, so the browser takes each one (Equicord opens them all at once). */
export const ALL_GAP_MS = 400

/** The engine's own icon, as Equicord shows it next to the engine's name. */
export function engineIcon(engine: string): string {
	return `https://icons.duckduckgo.com/ip3/${new URL(engine).host}.ico`
}

/** Opens the engine's search for a picture in the browser, as Equicord's `search` does. */
export function search(src: string, engine: string): void {
	Linking.openURL(engine + encodeURIComponent(src)).catch((error: unknown) =>
		diag.fail('open', error),
	)
}

/** Opens the search of every engine, one after another. */
export function searchAll(src: string): void {
	Object.values(Engines).forEach((engine, index) =>
		setTimeout(() => search(src, engine), index * ALL_GAP_MS),
	)
}
