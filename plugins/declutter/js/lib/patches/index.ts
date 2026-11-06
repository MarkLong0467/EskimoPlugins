import { diag } from '../../diag'
import { patchAvatarDecorations } from './avatarDecorations'
import { patchBadges } from './badges'
import { patchBoostGoal } from './boostGoal'
import { patchChannelNameEmojis } from './channelNameEmojis'
import { patchDisplayNameStyles } from './displayNameStyles'
import { patchDmActivityCards } from './dmActivityCards'
import { patchNameplates } from './nameplates'
import { patchProfileEffects } from './profileEffects'
import { patchProfileFrames } from './profileFrames'
import { patchServerTags } from './serverTags'
import { patchServerThemes } from './serverThemes'
import { patchSettingsPage } from './settingsPage'
import { patchWishlist } from './wishlist'
import { patchYouDock } from './youDock'

export function patchAll(): () => void {
	const unpatch: Array<() => void> = []

	const patches: Array<[name: string, patch: () => () => void]> = [
		['avatar decorations', patchAvatarDecorations],
		['nameplates', patchNameplates],
		['profile effects', patchProfileEffects],
		['profile frames', patchProfileFrames],
		['server tags', patchServerTags],
		['badges', patchBadges],
		['settings page', patchSettingsPage],
		['wishlist', patchWishlist],
		['you dock', patchYouDock],
		['boost goal', patchBoostGoal],
		['channel name emojis', patchChannelNameEmojis],
		['display name styles', patchDisplayNameStyles],
		['dm activity cards', patchDmActivityCards],
		['server themes', patchServerThemes],
	]
	for (const [name, patch] of patches) unpatch.push(diag.apply(name, patch))

	return () => {
		for (const un of unpatch) un?.()
	}
}
