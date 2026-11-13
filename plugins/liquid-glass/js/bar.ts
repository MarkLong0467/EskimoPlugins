/**
 * The bar at the bottom of the channel list (your avatar, name and status, with the bell). Discord draws it as a pill whose
 * press target is a `Pressable` with the test id `you_bar_profile_button`; it keeps the pill's corners in its own style, so
 * a rim added to that style follows them. The bar is hooked only when this test id is found, and nothing else is changed.
 */

import { beforeJSX } from '@valenced/react/jsx-runtime'
import { Pressable } from 'react-native'
import { store } from './config'
import { diag } from './diag'
import { look } from './look'
import { countOf } from './state'

type Cleanup = (...fns: Array<() => unknown>) => unknown

const BAR_TEST_ID = 'you_bar_profile_button'

/** Puts a glass rim on the profile bar at the bottom of the channel list. */
export function installBar(cleanup: Cleanup): void {
	if (!Pressable) {
		diag.log(
			'bar',
			'Pressable was not found, so the profile bar gets no rim',
			'warn',
		)
		return
	}
	const count = countOf('profile bar')
	cleanup(
		diag.apply('frost: profile bar', () =>
			beforeJSX(Pressable as never, args => {
				const [type, props, key] = args
				const given = props as Record<string, unknown>
				if (given.testID !== BAR_TEST_ID) return args
				count.seen++
				if (!store.get('bar')) return args
				count.frosted++
				return [
					type,
					{ ...given, style: [given.style, look('rim')] },
					key,
				] as never
			}),
		),
	)
}
