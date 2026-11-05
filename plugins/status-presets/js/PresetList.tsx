import { Design } from '@valenced/discord/design'
import { useState } from 'react'
import { View } from 'react-native'
import { applyPreset, isActive } from './apply'
import { Chip } from './components'
import { CONFIRM_MS, DEFAULT_SETTINGS } from './constants'
import {
	parseJson,
	readPresets,
	summary,
	titleOf,
	writePresets,
} from './presets'
import { toast } from './state'
import { readNow } from './status'
import type { Preset } from './types'

/** Texts as constants because React Native text must be passed as an expression. */
const PRESETS_TITLE = 'PRESETS'

interface Props {
	/** Called with a preset's id when it should be edited. */
	onEdit: (id: string) => void
	/** Called when a new preset should be made. */
	onAdd: () => void
}

/**
 * The list of presets. A switch picks what tapping a row does: apply it, or edit it. At the end are a row that makes a
 * new preset and one that puts the starter presets back (it asks to be tapped twice).
 */
export default function PresetList({ onEdit, onAdd }: Props) {
	const [editing, setEditing] = useState(false)
	const [sure, setSure] = useState(false)
	const presets = readPresets()
	const now = readNow()

	return (
		<View style={{ gap: 12 }}>
			<View
				style={{
					flexDirection: 'row',
					alignItems: 'center',
					justifyContent: 'space-between',
				}}
			>
				<Design.Text variant="text-sm/semibold" color="text-muted">
					{PRESETS_TITLE}
				</Design.Text>
				<View style={{ flexDirection: 'row', gap: 8 }}>
					<Chip
						text="Tap to apply"
						selected={!editing}
						onPress={() => setEditing(false)}
					/>
					<Chip
						text="Tap to edit"
						selected={editing}
						onPress={() => setEditing(true)}
					/>
				</View>
			</View>
			<Design.TableRowGroup title="">
				{presets.length ? (
					presets.map((p: Preset) => (
						<Design.TableRow
							key={p.id}
							label={titleOf(p)}
							subLabel={`${isActive(p, now) ? 'Active · ' : ''}${summary(p)}`}
							onPress={() => (editing ? onEdit(p.id) : applyPreset(p))}
						/>
					))
				) : (
					<Design.TableRow
						key="none"
						label="No presets yet"
						subLabel="Add one below, or save your current status as a preset."
					/>
				)}
				<Design.TableRow key="add" label="＋ New preset" onPress={onAdd} />
			</Design.TableRowGroup>
			<Design.TableRow
				key="reset"
				label={
					sure
						? 'Tap again to replace all presets with the starter ones'
						: 'Reset to starter presets'
				}
				variant="danger"
				onPress={() => {
					if (!sure) {
						setSure(true)
						setTimeout(() => setSure(false), CONFIRM_MS)
						return
					}
					setSure(false)
					writePresets(parseJson<Preset[]>(DEFAULT_SETTINGS.presetsJson, []))
					toast('Starter presets are back')
				}}
			/>
		</View>
	)
}
