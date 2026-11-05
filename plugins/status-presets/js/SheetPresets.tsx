import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { applyPreset, isActive, presetFromNow } from './apply'
import { readPresets, summary, titleOf, writePresets } from './presets'
import { toast } from './state'
import { readNow } from './status'

/** Texts as constants because React Native text must be passed as an expression. */
const SAVE_CURRENT = '＋ Save my current status as a preset'

/**
 * The presets as a group of rows under the status picker of the account sheet. Tapping one closes the sheet and applies
 * it. Nothing is drawn if there are no presets.
 */
export function SheetPresets() {
	const presets = readPresets()
	const now = readNow()
	if (!presets.length) return null
	return (
		<Design.TableRowGroup title="Status presets">
			{presets.map(p => (
				<Design.TableRow
					key={p.id}
					label={titleOf(p)}
					subLabel={isActive(p, now) ? `Active · ${summary(p)}` : summary(p)}
					onPress={() => {
						try {
							ActionSheetActionCreators.hideAllActionSheets()
						} catch {
							// No sheet was open.
						}
						setTimeout(() => applyPreset(p), 0)
					}}
				/>
			))}
		</Design.TableRowGroup>
	)
}

/** Closes the "Set your status" screen, whichever way Discord's modal code is reachable. */
function closeScreen(): void {
	try {
		const modals =
			// Discord's modal actions are not in the typed list of actions, so they are reached through the unscoped API.
			(valenced.discord.actions as unknown as Record<string, unknown>)
				.ModalActionCreators || lookupModule(withProps('pushLazy', 'popAll'))[0]
		const holder = modals as
			| { pop?: () => void; default?: { pop?: () => void } }
			| undefined
		const target =
			holder && (typeof holder.pop === 'function' ? holder : holder.default)
		if (target && typeof target.pop === 'function') target.pop()
	} catch {
		// The screen stays open.
	}
}

/**
 * The presets as a group of rows on the "Set your status" screen. Tapping one applies it and closes the screen. The
 * last row saves your current status as a new preset.
 */
export function EditorPresets() {
	const presets = readPresets()
	const now = readNow()
	return (
		<Design.TableRowGroup title="Status presets">
			{presets.map(p => (
				<Design.TableRow
					key={p.id}
					label={titleOf(p)}
					subLabel={isActive(p, now) ? `Active · ${summary(p)}` : summary(p)}
					onPress={() => {
						if (applyPreset(p)) setTimeout(closeScreen, 0)
					}}
				/>
			))}
			<Design.TableRow
				key="save-current"
				label={SAVE_CURRENT}
				onPress={() => {
					writePresets([...readPresets(), presetFromNow()])
					toast(
						'Saved. Open Status Presets in the plugin settings to rename it.',
					)
				}}
			/>
		</Design.TableRowGroup>
	)
}
