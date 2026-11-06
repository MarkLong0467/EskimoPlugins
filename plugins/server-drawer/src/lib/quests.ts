const TAG = '[ServerDrawer]'

// Collapsed dock height override (stock QUEST_DOCK_COLLAPSED_HEIGHT = 56).
// Exactly one icon row: 12 top pad + 48 icon + 8 bottom pad = 68. No clipping,
// no second-row peek, and small enough to not feel bulky next to the messages.
export const COLLAPSED_DOCK_HEIGHT = 68

export const HERO_MEDIA_URL =
	'https://media.discordapp.net/attachments/0/0/1.png'
export const FAKE_HERO_URL =
	'https://cdn.discordapp.com/attachments/0/0/server_drawer_hero.png'
export const FAKE_LOGO_URL =
	'https://cdn.discordapp.com/attachments/0/0/server_drawer_logo.png'

function legacyAssets() {
	return {
		questBarHero: { url: HERO_MEDIA_URL },
		questBarHeroVideo: { url: HERO_MEDIA_URL },
	}
}

export function questAssets() {
	return {
		hero: 'server_drawer_hero.png',
		heroVideo: null,
		questBarHero: 'server_drawer_hero.png',
		questBarHeroBlurhash: null,
		questBarHeroVideo: null,
		gameTile: 'server_drawer_tile.png',
		gameTileLight: 'server_drawer_tile.png',
		gameTileDark: 'server_drawer_tile.png',
		logotype: 'server_drawer_logo.png',
		logotypeLight: 'server_drawer_logo.png',
		logotypeDark: 'server_drawer_logo.png',
	}
}

export function fakeQuest() {
	return {
		type: 1,
		quest: {
			id: 'server-drawer',
			assets: legacyAssets(),
			config: {
				quest_content_type: 0,
				assets: questAssets(),
				features: [],
			},
			userStatus: { enrolledAt: '2099-01-01', claimedAt: null },
			benefits: { rewards: [] },
			guildId: '0',
			tasks: [],
		},
	}
}

// Patches every currently-initialized module exposing `prop(func)` by replacing it with
// `apply(original)`, and keeps watching for late-registering modules. Returns true when at
// least the lookup path is confirmed alive.
function patchAllWithProps(
	cleanups: (fn: () => void) => void,
	prop: string,
	apply: (orig: (...args: any[]) => any) => (...args: any[]) => any,
): boolean {
	const added: (() => void)[] = []
	const seen = new Set<any>()

	const unsub = valenced.modules.finders.getModules(
		valenced.modules.finders.filters.withProps(prop),
		(exports: any) => {
			if (typeof exports?.[prop] !== 'function' || seen.has(exports)) return
			seen.add(exports)
			try {
				added.push(
					valenced.patcher.instead(
						exports,
						prop,
						(args: any[], original: (...a: any[]) => any) =>
							apply(original)(...args),
					),
				)
				console.log(TAG, `PATCH: ${prop}`)
			} catch {
				// ignore
			}
		},
		{ max: Number.POSITIVE_INFINITY },
	)

	cleanups(() => {
		try {
			unsub?.()
		} catch {
			// ignore
		}
		for (const fn of added.splice(0)) {
			try {
				fn()
			} catch {
				// ignore
			}
		}
	})

	let alive = false
	try {
		alive =
			valenced.modules.finders.lookupModule(
				valenced.modules.finders.filters.withProps(prop),
				{ initialize: false },
			).length !== 0
	} catch {
		// ignore
	}
	return alive
}

export function patchMobileQuestDock(
	cleanups: (fn: () => void) => void,
): boolean {
	return patchAllWithProps(cleanups, 'useMobileQuestDock', orig => {
		return function (this: any, ...args: any[]) {
			orig.apply(this, args)
			return fakeQuest()
		}
	})
}

export function patchQuestDockBase(
	cleanups: (fn: () => void) => void,
): boolean {
	return patchAllWithProps(
		cleanups,
		'useIsMobileQuestDockRenderedBase',
		orig => {
			return function (this: any, ...args: any[]) {
				orig.apply(this, args)
				return true
			}
		},
	)
}

export function patchQuestDockRender(
	cleanups: (fn: () => void) => void,
): boolean {
	return patchAllWithProps(cleanups, 'useIsMobileQuestDockRendered', orig => {
		return function (this: any, ...args: any[]) {
			orig.apply(this, args)
			return true
		}
	})
}

export function patchQuestEligibility(
	cleanups: (fn: () => void) => void,
): boolean {
	const added: (() => void)[] = []

	const unsub = valenced.modules.finders.getModules(
		valenced.modules.finders.filters.withProps('getIsEligibleForQuests'),
		(exports: any) => {
			if (typeof exports?.getIsEligibleForQuests !== 'function') return
			try {
				added.push(
					valenced.patcher.instead(
						exports,
						'getIsEligibleForQuests',
						(args: any[], original: (...a: any[]) => any) => {
							original(...args)
							return true
						},
					),
				)
				console.log(TAG, 'PATCH: getIsEligibleForQuests -> always true')
			} catch {
				// ignore
			}
		},
		{ max: Number.POSITIVE_INFINITY },
	)

	cleanups(() => {
		try {
			unsub?.()
		} catch {
			// ignore
		}
		for (const fn of added.splice(0)) {
			try {
				fn()
			} catch {
				// ignore
			}
		}
	})

	return true
}

function patchFakePrefetch(cleanups: (fn: () => void) => void): boolean {
	const image = valenced.react.ReactNative.Image
	if (typeof image?.prefetch !== 'function') return false
	try {
		cleanups(
			valenced.patcher.instead(
				image,
				'prefetch',
				(args: any[], original: (...a: any[]) => any) => {
					const url = args[0]
					if (typeof url === 'string' && url.includes('server_drawer_')) {
						return Promise.resolve(true)
					}
					return original(...args)
				},
			),
		)
		return true
	} catch {
		return false
	}
}

function patchAllPrefetch(cleanups: (fn: () => void) => void): boolean {
	const added: (() => void)[] = []
	const seen = new WeakSet<any>()

	const unsub = valenced.modules.finders.getModules(
		valenced.modules.finders.filters.withProps('prefetch'),
		(exports: any) => {
			const prefetch = exports?.prefetch
			if (typeof prefetch !== 'function' || seen.has(prefetch)) return
			seen.add(prefetch)
			try {
				added.push(
					valenced.patcher.instead(
						exports,
						'prefetch',
						(args: any[], original: (...a: any[]) => any) => {
							const url = args[0]
							if (typeof url === 'string' && url.includes('server_drawer_')) {
								return Promise.resolve(true)
							}
							return original(...args)
						},
					),
				)
			} catch {
				// ignore
			}
		},
		{ max: Number.POSITIVE_INFINITY },
	)

	cleanups(() => {
		try {
			unsub?.()
		} catch {
			// ignore
		}
		for (const fn of added.splice(0)) {
			try {
				fn()
			} catch {
				// ignore
			}
		}
	})

	return false
}

export function patchDockAssetPrefetch(
	cleanups: (fn: () => void) => void,
): boolean {
	let patched = 0

	if (
		patchAllWithProps(cleanups, 'useQuestDockHeroAsset', () => {
			return () => ({ staticUrl: FAKE_HERO_URL, videoAsset: null })
		})
	) {
		patched++
	}

	if (
		patchAllWithProps(cleanups, 'useQuestGameLogotypeAssetUrl', () => {
			return () => FAKE_LOGO_URL
		})
	) {
		patched++
	}

	if (patchFakePrefetch(cleanups)) patched++
	if (patchAllPrefetch(cleanups)) patched++

	return patched > 0
}
