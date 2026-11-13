/**
 * Liquid Glass.
 *
 * A port of callstack/liquid-glass (https://github.com/callstack/liquid-glass, MIT) as a library plugin. Other plugins that
 * depend on `marklong.liquid-glass` get `liquidGlass` with `LiquidGlassView`, `LiquidGlassContainerView` and
 * `isLiquidGlassSupported`, with the same props as the original. See `glass.tsx` for what is drawn on each phone.
 */

import { installBar } from './bar'
import { installFrost } from './buttons'
import { DEFAULT_SETTINGS, store } from './config'
import { diag } from './diag'
import {
	isLiquidGlassSupported,
	LiquidGlassContainerView,
	LiquidGlassView,
} from './glass'
import Settings from './Settings'
import { resetState } from './state'
import { installSheetColour } from './tokens'
import type { GlassSettings } from './config'
import type { LiquidGlassApi } from './types'

export type {
	LiquidGlassApi,
	LiquidGlassContainerViewProps,
	LiquidGlassViewProps,
} from './types'

const api: LiquidGlassApi = {
	LiquidGlassView,
	LiquidGlassContainerView,
	isLiquidGlassSupported,
}

export default plugin<{ jsonStorage: GlassSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	start({ cleanup, jsonStorage, unscoped, decorate, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		store.attach(jsonStorage)
		cleanup(() => {
			store.clear()
			resetState()
		})
		unscoped.liquidGlass = api
		decorate(plugin => {
			plugin.api.liquidGlass = api
			return () => {
				Reflect.deleteProperty(plugin.api, 'liquidGlass')
			}
		})
		installFrost(cleanup)
		installBar(cleanup)
		installSheetColour(cleanup)
		diag.log(
			'plugin',
			isLiquidGlassSupported
				? 'native liquid glass found'
				: 'no native liquid glass, using the frosted fallback',
		)
	},
	stop({ unscoped }) {
		Reflect.deleteProperty(unscoped, 'liquidGlass')
	},
	SettingsComponent: Settings,
})

declare module '@valenced/plugins/types' {
	interface PluginApi {
		liquidGlass: LiquidGlassApi
	}
	interface UnscopedPluginApi {
		liquidGlass: LiquidGlassApi
	}
}
