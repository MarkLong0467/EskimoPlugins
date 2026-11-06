import { getModules } from '@valenced/modules/finders'
import { displayNameFilter, memoOf } from '../../../shared/palmdevs/finders'
import { installJsxFinder } from '../../../shared/palmdevs/jsxFind'
import { hidden, store } from './config'
import { diag } from './diag'
import { state } from './state'
import type { JsxRule } from '../../../shared/palmdevs/jsxFind'

/** Registers a function to run when the plugin stops. */
type Cleanup = (...fns: Array<() => unknown>) => unknown

/** A ref, as React gives it to a component that is wrapped in `forwardRef`. */
interface Handle<T> {
	current?: T | null
}

/** What the send button gives out through its ref. */
interface SendHandle {
	setHasText(hasText: boolean): void
}

/** What the row of action buttons gives out through its ref. */
interface ActionsHandle {
	onShowActions(): void
	onDismissActions(): void
}

/** The props the chat bar parts are given, as far as this plugin reads or changes them. */
interface ChatProps {
	canSendVoiceMessage?: boolean
	isAppLauncherEnabled?: boolean
	canStartThreads?: boolean
	shouldShowGiftButton?: boolean
}

/** The inside of a component that is wrapped in `forwardRef`: its function is `render(props, ref)`. */
interface ForwardRefComponent {
	render(props: ChatProps, ref: Handle<unknown>): unknown
}

/**
 * Patches Discord's chat bar: hides the buttons that are switched off and keeps the others from collapsing.
 *
 * Revenge's `patcher.before` and `patcher.after` let a hook return nothing; Valenced's hooks must return the arguments and
 * the result, so each hook here returns them.
 *
 * @param cleanup Where to register what undoes the patches.
 */
export function installPatches(cleanup: Cleanup): void {
	const found = new Set<string>()
	let sendRef: Handle<SendHandle> | undefined
	let actionsRef: Handle<ActionsHandle> | undefined
	/** Handles that were wrapped already, so each is wrapped once however often the bar is drawn. */
	const wrappedSend = new WeakSet<object>()
	const wrappedActions = new WeakSet<object>()

	/** The rules for the JSX runtime, which tell the plugin when Discord first draws each part. */
	const rules: JsxRule[] = []

	/**
	 * Finds a chat bar part by its name and patches it.
	 *
	 * Two ways of finding it work together, and the first to find a part patches it: Discord drawing it (the JSX runtime,
	 * which tells the plugin before the part is first drawn), and Discord's module being loaded (the module search, which
	 * only sees modules Discord has already loaded).
	 */
	const onComponent = (
		name: string,
		apply: (component: ForwardRefComponent) => void,
	) => {
		const take = (given: unknown) => {
			if (found.has(name)) return
			// What Discord draws is a `React.memo` of the `forwardRef` component, and the `forwardRef` has `render`.
			const component =
				memoOf<ForwardRefComponent>(given)?.type ??
				(given as ForwardRefComponent | undefined)
			if (!component || typeof component.render !== 'function') {
				diag.log(
					'find',
					`${name}: found, but it has no render function`,
					'warn',
				)
				return
			}
			found.add(name)
			diag.log('found', name)
			apply(component)
		}
		rules.push({ name, seen: take })
		cleanup(getModules(displayNameFilter(name), take))
	}

	onComponent('ChatInputSendButton', component => {
		state.sendButton = true
		cleanup(
			diag.apply('ChatInputSendButton (before)', () =>
				valenced.patcher.before(component, 'render', ((
					args: [ChatProps, Handle<SendHandle>],
				) => {
					const [props, ref] = args
					if (props?.canSendVoiceMessage)
						props.canSendVoiceMessage = !hidden('voice')
					sendRef = ref
					return args
				}) as never),
			),
		)

		// REDESIGN / VISUAL REFRESH
		cleanup(
			diag.apply('ChatInputSendButton (after)', () =>
				valenced.patcher.after(component, 'render', ((result: unknown) => {
					// The ref is only there after a render.
					requestAnimationFrame(() => {
						const handle = sendRef?.current
						// It is not set in some chats, such as with a bot.
						if (!handle || wrappedSend.has(handle)) return
						wrappedSend.add(handle)
						const { setHasText } = handle
						handle.setHasText = (hasText: boolean) => {
							if (store.get('collapse').send) state.hasText = hasText
							return setHasText.call(handle, hasText)
						}
						state.sendWrapped++
						cleanup(() => {
							handle.setHasText = setHasText
						})
					})
					return store.get('collapse').send && !state.hasText ? null : result
				}) as never),
			),
		)
	})

	onComponent('ChatInputActions', component => {
		state.actions = true
		// LEGACY
		cleanup(
			diag.apply('ChatInputActions (before)', () =>
				valenced.patcher.before(component, 'render', ((
					args: [ChatProps, Handle<ActionsHandle>],
				) => {
					const [props, ref] = args
					if (props?.isAppLauncherEnabled)
						props.isAppLauncherEnabled = !hidden('app')
					if (props) {
						props.canStartThreads = !hidden('thread')
						props.shouldShowGiftButton = !hidden('gift')
					}
					actionsRef = ref
					return args
				}) as never),
			),
		)
		cleanup(
			diag.apply('ChatInputActions (after)', () =>
				valenced.patcher.after(component, 'render', ((result: unknown) => {
					// The ref is only there after a render.
					requestAnimationFrame(() => {
						const handle = actionsRef?.current
						// It is not set in some chats, such as with a bot.
						if (!handle || wrappedActions.has(handle)) return
						wrappedActions.add(handle)
						const { onDismissActions } = handle
						handle.onDismissActions = () => {
							if (store.get('collapse').actions)
								return onDismissActions.call(handle)
						}
						state.actionsWrapped++
						cleanup(() => {
							handle.onDismissActions = onDismissActions
						})
					})
					return result
				}) as never),
			),
		)
	})

	// REDESIGN / VISUAL REFRESH
	onComponent('ChatInputRightActions', component => {
		state.rightActions = true
		cleanup(
			diag.apply('ChatInputRightActions (before)', () =>
				valenced.patcher.before(component, 'render', ((args: [ChatProps]) => {
					const [props] = args
					if (props) props.shouldShowGiftButton = !hidden('gift')
					return args
				}) as never),
			),
		)
	})

	state.jsx = installJsxFinder(cleanup, rules)
	if (!state.jsx) diag.log('jsx', 'The JSX runtime was not found', 'warn')
}
