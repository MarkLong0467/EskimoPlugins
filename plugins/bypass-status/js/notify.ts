import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { myStatus } from './discord'
import { mayBypass } from './rule'
import { hooks } from './state'
import type { Message, NotificationUtils } from './types'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/**
 * Lets messages from chosen people through Do Not Disturb.
 *
 * Discord's `NotificationTextUtils.shouldNotify(message, channelId, includeSelectedChannel, ignoreStatus)` answers "no"
 * while the status is Do Not Disturb, unless `ignoreStatus` is true. This wraps it: for a message that may bypass, it is
 * asked again with `ignoreStatus` set to true. Everything else Discord checks still applies, and the banner and sound
 * are Discord's own. Calls that already ignore the status, or happen in any other status, are left exactly as they are.
 *
 * If the function is not found, nothing is patched and the plugin's own banner is used instead (see `banner.ts`).
 */
export function letChosenMessagesThroughDoNotDisturb(cleanup: Cleanup): void {
	const utils =
		(lookupModule(
			withProps('shouldNotify', 'shouldNotifyBase'),
		)[0] as unknown as NotificationUtils | undefined) || null
	if (!utils || typeof utils.shouldNotify !== 'function') return
	hooks.notificationUtils = 'found'

	cleanup(
		instead(utils, 'shouldNotify', function (args, original) {
			const [message, channelId, includeSelectedChannel, ignoreStatus] =
				args as [Message, string, boolean, boolean | undefined]
			const needsHelp =
				!ignoreStatus && myStatus() === 'dnd' && mayBypass(message, channelId)
			if (!needsHelp) return Reflect.apply(original, this, args)
			hooks.bypassed += 1
			hooks.last = String(message.author?.id).slice(-4)
			return Reflect.apply(original, this, [
				message,
				channelId,
				includeSelectedChannel,
				true,
			])
		}),
	)
	hooks.patched.push('NotificationTextUtils.shouldNotify')
}
