import { getModules } from '@valenced/modules/finders'
import { withName } from '@valenced/modules/finders/filters'
import { before, instead } from '@valenced/patcher'
import { Pressable } from 'react-native'
import { setting } from './config'
import { SEND_HANDLER_NAME } from './constants'
import { decorateInput } from './decorate'
import { openPreview } from './preview'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/**
 * Patches the message box so the floating button is added to it.
 * Discord names the part that wraps the box `ChatInputGuardWrapper`. It is found with `getModules`, so it is also
 * picked up if Discord loads it later. If the button cannot be added, the box is drawn as Discord would.
 */
export function patchMessageBox(cleanup: Cleanup): void {
	cleanup(
		getModules(
			withName('ChatInputGuardWrapper'),
			module => {
				const target = module as { default?: unknown } | null | undefined
				if (!target || typeof target.default !== 'function') return
				cleanup(
					instead(
						target as { default: (...args: unknown[]) => unknown },
						'default',
						function (args, original) {
							const ret = Reflect.apply(original, this, args)
							try {
								return decorateInput(ret)
							} catch {
								return ret
							}
						},
					),
				)
			},
			{ returnNamespace: true },
		),
	)
}

/**
 * Makes holding the send button open the preview, when the setting asks for it.
 *
 * The send button is a `Pressable`; the patch looks at what it is drawn with and acts on the one whose tap handler is
 * named `handlePressSend`. Its own long press is kept and used when the setting asks for the pill instead.
 */
export function patchSendButton(cleanup: Cleanup): void {
	const pressable = Pressable as unknown as { type?: unknown } | undefined
	if (!pressable || typeof pressable.type !== 'function') return

	cleanup(
		before(
			pressable as { type: (...args: unknown[]) => unknown },
			'type',
			(args: unknown[]) => {
				try {
					const props = args[0] as
						| {
								onPress?: { name?: string }
								onLongPress?: (...a: unknown[]) => unknown
						  }
						| undefined
					if (
						props &&
						typeof props.onPress === 'function' &&
						props.onPress.name === SEND_HANDLER_NAME
					) {
						const original = props.onLongPress
						return [
							Object.assign({}, props, {
								onLongPress(this: unknown, ...rest: unknown[]) {
									if (setting('buttonType') === 'send') openPreview()
									else if (typeof original === 'function')
										return original.apply(this, rest)
								},
							}),
							...args.slice(1),
						] as never
					}
				} catch {
					// Leave the button as it is.
				}
				return args as never
			},
		),
	)
}
