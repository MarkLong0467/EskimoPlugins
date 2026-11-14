/**
 * The engines to search a picture with: Equicord's "Search Image" submenu, as a sheet of its own because a phone's menus
 * have no submenus. Each engine with its icon, then "All".
 */

import { Design } from '@valenced/discord/design'
import { createElement, useState } from 'react'
import { Image, View } from 'react-native'
import { stats } from './diag'
import {
	EXTERNAL_ICON,
	hideSheets,
	iconComponent,
	SEARCH_ICON,
	sheets,
} from './discord'
import { Engines, engineIcon, search, searchAll } from './engines'

/** The key the sheet is opened with. */
export const ENGINE_SHEET_KEY = 'ReverseImageSearch'

/** Equicord's label for the menu and the sheet. */
export const MENU_LABEL = 'Search Image'

/** Discord's icon of a row, or nothing when it cannot be found. */
function rowIcon(name: string) {
	const Icon = (Design.TableRow as unknown as { Icon?: unknown } | undefined)
		?.Icon
	const IconComponent = iconComponent(name)
	return Icon && IconComponent
		? createElement(Icon as never, { IconComponent } as never)
		: undefined
}

/** An engine's own icon. Discord's search icon takes its place if it cannot be loaded. */
function EngineIcon({ engine }: { engine: string }) {
	const [failed, setFailed] = useState(false)
	if (failed)
		return rowIcon(SEARCH_ICON) ?? <View style={{ width: 24, height: 24 }} />
	return (
		<Image
			source={{ uri: engineIcon(engine) }}
			style={{ width: 24, height: 24, borderRadius: 4 }}
			onError={() => setFailed(true)}
		/>
	)
}

/** Closes the sheet, then opens the search. */
function run(open: () => void) {
	hideSheets()
	stats.searches++
	open()
}

/** The sheet for one picture. */
export function EngineSheet({ src }: { src: string }) {
	return (
		<Design.ActionSheet>
			<Design.BottomSheetTitleHeader title={MENU_LABEL} />
			<Design.TableRowGroup hasIcons>
				{Object.keys(Engines).map(engine => {
					const url = Engines[engine as keyof typeof Engines]
					return (
						<Design.TableRow
							key={`search-image-${engine}`}
							label={engine}
							icon={<EngineIcon engine={url} />}
							onPress={() => run(() => search(src, url))}
						/>
					)
				})}
				<Design.TableRow
					key="search-image-all"
					label="All"
					icon={rowIcon(EXTERNAL_ICON)}
					onPress={() => run(() => searchAll(src))}
				/>
			</Design.TableRowGroup>
		</Design.ActionSheet>
	)
}

/** Opens the sheet for a picture, once the menu it was chosen in has closed. */
export function openEngineSheet(src: string): void {
	hideSheets()
	setTimeout(
		() =>
			sheets().openLazy(
				Promise.resolve({ default: () => <EngineSheet src={src} /> }),
				ENGINE_SHEET_KEY,
				{},
			),
		0,
	)
}
