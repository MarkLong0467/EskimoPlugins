import { instead } from '@valenced/patcher'
import { Fragment } from 'react'
import { setting } from './config'
import { decorateIcon } from './decorateIcon'
import NsfwBadge from './NsfwBadge'
import type { ChannelIconModule, ChannelInfoModule } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/**
 * Patches the channel name row so NSFW channels get a red NSFW tag in front of the name.
 *
 * `ChannelInfo` is found by name. The module may be reported as a namespace, so only a module whose `default` is a
 * function is patched. The tag is added only when the setting is on and the channel is NSFW (Discord calls the
 * field `nsfw_` in some versions and `nsfw` in others).
 */
export function patchChannelInfo(module: unknown, cleanup: Cleanup): void {
	const target = module as ChannelInfoModule | null | undefined
	if (!target || typeof target.default !== 'function') return

	cleanup(
		instead(target, 'default', function (args, original) {
			const ret = Reflect.apply(original, this, args)
			try {
				const channel = args[0]?.channel
				if (!setting('nsfwTag') || !channel || !(channel.nsfw_ || channel.nsfw))
					return ret
				return (
					<Fragment>
						<NsfwBadge />
						{ret}
					</Fragment>
				)
			} catch {
				// Never let a decoration break the channel list: draw the channel as Discord would.
				return ret
			}
		}),
	)
}

/**
 * Patches `BaseChannelIcon`, the component that draws every channel icon, so locked, NSFW and game channels get colored
 * marks (see `decorateIcon`). It can be found on the module itself or on its default export.
 */
export function patchChannelIcons(module: unknown, cleanup: Cleanup): void {
	const exported = module as
		| (ChannelIconModule & { default?: ChannelIconModule })
		| null
		| undefined
	const holder =
		exported && typeof exported.BaseChannelIcon === 'function'
			? exported
			: exported?.default &&
					typeof exported.default.BaseChannelIcon === 'function'
				? exported.default
				: null
	if (!holder) return

	try {
		cleanup(
			instead(holder, 'BaseChannelIcon', function (args, original) {
				const ret = Reflect.apply(original, this, args)
				try {
					return decorateIcon(args as never, ret)
				} catch {
					return ret
				}
			}),
		)
	} catch {
		// If the icon cannot be patched, the plugin still does the NSFW tag.
	}
}
