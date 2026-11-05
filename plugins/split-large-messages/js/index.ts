/**
 * Split Large Messages.
 *
 * Discord refuses messages over 2000 characters (4000 with Nitro). This plugin lets you send them anyway: it cuts
 * the text into several messages and sends them one after another.
 *
 * How it is put together:
 * - `limit.ts` works out the limit for the current account,
 * - `split.ts` cuts text on line breaks and spaces,
 * - `patch.ts` replaces Discord's `sendMessage` and ties the two together.
 */

import { patchSendMessage } from './patch'

export default plugin({
	start({ cleanup }) {
		patchSendMessage(cleanup)
	},
})
