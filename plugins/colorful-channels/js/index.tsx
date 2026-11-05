/**
 * Colorful Channels.
 *
 * Gives channel icons that have a symbol (a lock, a warning, a game controller) colors: locked channels get a yellow
 * lock, NSFW channels a red warning. It also adds a red NSFW tag next to the names of NSFW channels.
 *
 * Based on the Colorful Channels module of NexxUtils for Revenge by nexpid (CC BY 4.0),
 * https://github.com/nexpid/RevengePlugins. The channel icon pictures are from that plugin. Rewritten for Valenced.
 *
 * How it is put together:
 * - `patches.tsx` patches Discord's `ChannelInfo` (the NSFW tag) and `BaseChannelIcon` (the colored icons),
 * - `decorateIcon.tsx` draws a colored icon, helped by `assetName`/`assetId` (`assets.ts`), `glyphFor` (`glyph.ts`)
 *   and `resolveColor` (`color.ts`),
 * - `images.ts` holds the pictures, `constants.ts` the icon table and the colors,
 * - `config.ts` reads the saved settings and `Settings.tsx` is the settings screen.
 */

import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { setStorage } from './config'
import { DEFAULT_SETTINGS } from './constants'
import { patchChannelIcons, patchChannelInfo } from './patches'
import Settings from './Settings'
import type { ColorfulChannelsSettings } from './types'

export default plugin<{ jsonStorage: ColorfulChannelsSettings }>({
	jsonStorage: { load: true, default: DEFAULT_SETTINGS },
	SettingsComponent: Settings,

	start({ cleanup, jsonStorage }) {
		setStorage(jsonStorage)

		// The red NSFW tag next to the channel name.
		cleanup(
			getModules(
				withName('ChannelInfo'),
				module => patchChannelInfo(module, cleanup),
				{ returnNamespace: true },
			),
		)

		// The channel icons. This part of Discord loads when the channel list first draws, which on a fresh start is
		// after this plugin starts, so getModules waits for it instead of looking once.
		cleanup(
			getModules(
				withProps('BaseChannelIcon'),
				module => patchChannelIcons(module, cleanup),
				{ returnNamespace: true },
			),
		)
	},
})
