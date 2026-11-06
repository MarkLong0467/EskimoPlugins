import { isDmTileMode, reactive, setDmTileMode } from '../lib/modules'
import type { DmTileMode } from '../lib/modules'

const SHEET_KEY = 'server-drawer-dm-tile'

export interface DmTileOption {
	value: DmTileMode
	label: string
	subLabel: string
}

export const DM_TILE_OPTIONS: readonly DmTileOption[] = [
	{
		value: 'drawer',
		label: 'Show DM tile in server drawer',
		subLabel: 'Listed as a tile alongside your guilds',
	},
	{
		value: 'rail',
		label: 'Show DM tile in GuildsBar place',
		subLabel: 'Keeps Discord’s own slot, and the drawer loses that row',
	},
	{
		value: 'hidden',
		label: 'Entirely hide the DM tile',
		subLabel: 'Removes the tile and collapses the rail it lived in',
	},
]

function actionSheet() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

export function openDmTileSheet(): void {
	try {
		actionSheet()?.openLazy?.(
			Promise.resolve({ default: DmTileSheet }),
			SHEET_KEY,
			{},
		)
	} catch {
		// ignore
	}
}

function DmTileSheet() {
	// valenced.discord.design is init-gated, so it is read when the sheet renders
	// rather than at module scope.
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
	} = valenced.discord.design.Design

	const current = reactive().dmTileMode

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="DM Tile" />
			<TableRadioGroup<DmTileMode>
				defaultValue={current}
				onChange={(next: DmTileMode) => {
					if (!isDmTileMode(next)) return
					void setDmTileMode(next)
					try {
						actionSheet()?.hideActionSheet?.(SHEET_KEY)
					} catch {
						// ignore
					}
				}}
			>
				{DM_TILE_OPTIONS.map(option => (
					<TableRadioRow
						key={option.value}
						label={option.label}
						subLabel={option.subLabel}
						value={option.value}
					/>
				))}
			</TableRadioGroup>
		</ActionSheet>
	)
}
