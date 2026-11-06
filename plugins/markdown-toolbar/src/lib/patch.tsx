import { getModules } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { beforeJSX, insteadJSX } from '@valenced/react/jsx-runtime'
import { Fragment } from 'react'
import MarkdownToolbar, {
	setChatInputRef,
	setKeyboardVisible,
} from '../ui/Toolbar'
import { getDisplayNameFilter, resolveComponent } from './modules'

export function patchChatInput(): () => void {
	const unpatch: Array<() => void> = []

	// `chatInputRef` is what lets the toolbar insert text at the caret.
	unpatch.push(
		getModules(
			getDisplayNameFilter('ChatInputAppCommandManager'),
			(exports: any) => {
				const component = resolveComponent(exports)
				if (!component) return

				unpatch.push(
					beforeJSX(component, args => {
						const [, props] = args
						if (props?.chatInputRef) setChatInputRef(props.chatInputRef)
						return args
					}),
				)
			},
		),
	)

	// Discord renders every chat-input banner into one `accessories` container
	// styled `{ position: 'absolute', bottom: '100%', left: 0, right: 0 }`,
	// anchored to the relatively-positioned input container. Banners therefore
	// stack upwards out of the input's own box and never move or cover it.
	//
	// `MemberActionsChatInputBannerGuardedOuter` is one of those banner slots
	// and is instantiated on every chat input render, so it is a reliable host
	// for our own row. The JSX hooks fire when the element is *created*, so this
	// lands even when the banner itself resolves to null.
	unpatch.push(
		getModules(
			withProps('MemberActionsChatInputBannerGuardedOuter'),
			(exports: any) => {
				const Banner = exports.MemberActionsChatInputBannerGuardedOuter
				if (!Banner) return

				unpatch.push(
					insteadJSX(Banner, (args, jsx) => {
						const [type, props, key] = args
						const original = jsx(type, props, key)
						// Banner first so our row sits directly above the input,
						// matching where Discord puts the reply/edit bar.
						return jsx(Fragment, {
							children: [
								original,
								jsx(MarkdownToolbar, { key: 'kmmiio-md-toolbar' }),
							],
						})
					}),
				)
			},
		),
	)

	unpatch.push(
		getModules(withProps('KeyboardEvents'), (exports: any) => {
			const KeyboardEvents = exports.KeyboardEvents
			if (!KeyboardEvents) return

			const showSub = KeyboardEvents.addListener('keyboardDidShow', () =>
				setKeyboardVisible(true),
			)
			const hideSub = KeyboardEvents.addListener('keyboardDidHide', () =>
				setKeyboardVisible(false),
			)
			unpatch.push(() => {
				showSub?.remove()
				hideSub?.remove()
			})
		}),
	)

	return () => {
		for (const un of unpatch) un?.()
	}
}
