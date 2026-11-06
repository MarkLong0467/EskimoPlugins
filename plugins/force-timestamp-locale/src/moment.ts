import { lookupModule } from '@valenced/modules/finders'
import { propsFilter } from '../../../shared/palmdevs/finders'

/** The parts of the moment library (what Discord draws its dates with) this plugin uses. */
export interface Moment {
	/** Reads the locale, or sets it. */
	locale(name?: string, passthrough?: symbol): string
	/** The same as `locale`, under its other name. */
	lang(name?: string, passthrough?: symbol): string
	/** Every locale that is loaded. */
	locales(): string[]
	/** A moment of the current time, which has `format`, `calendar`, `fromNow` and `subtract`. */
	(): MomentValue
}

/** One moment in time. */
export interface MomentValue {
	format(pattern?: string): string
	calendar(): string
	fromNow(): string
	subtract(amount: number, unit: string): MomentValue
}

/** Loaders of every locale Discord ships, which load a locale's data when they are called. */
export type LocaleLoaders = Record<string, () => Promise<unknown>>

/** The symbol that lets this plugin's own calls through its patch of `locale`. */
export const PASSTHROUGH = Symbol.for(
	'palmdevs.force-timestamp-locale.passthrough',
)

/** The moment library: the module with `isMoment`, which only the library itself has. */
export function findMoment(): Moment | undefined {
	const found = lookupModule(propsFilter('isMoment'))[0] as
		| (Moment & { default?: Moment })
		| undefined
	if (!found) return undefined
	if (typeof found.locale === 'function') return found
	if (typeof found.default?.locale === 'function') return found.default
	return undefined
}

/** The loaders of the locales, from the module with `momentLocales`. */
export function findLocaleLoaders(): LocaleLoaders | undefined {
	const found = lookupModule(propsFilter('momentLocales'))[0] as
		| {
				momentLocales?: LocaleLoaders
				default?: { momentLocales?: LocaleLoaders }
		  }
		| undefined
	return found?.momentLocales ?? found?.default?.momentLocales
}
