import ContextMenuHost from '../components/ContextMenuHost'
import { RailDmTile } from '../components/DmTile'
import { reactive, snapshot } from '../lib/modules'
import {
	hasName,
	registerIntercept,
	registerPropsTransform,
	registerTypeDetector,
} from '../lib/registry'

const TAG = '[ServerDrawer.Chrome]'
const RAIL_WIDTH = 72

function GuildsBarPatch() {
	return null
}

function HomePanelContentPatch() {
	const { View } = valenced.react.ReactNative
	const { dmTileMode } = reactive()
	const inRail = dmTileMode === 'rail'

	return (
		<View
			collapsable={false}
			style={{ flex: 1, width: inRail ? RAIL_WIDTH : 0 }}
		>
			{inRail && <RailDmTile />}
			<ContextMenuHost />
		</View>
	)
}

function isMessagesPanel(props: any): boolean {
	return props?.nativeID === 'messages-parent-view'
}

let shiftLogged = false

function shiftSideContainerLeft(props: any): any {
	const style = props?.style
	const arr = Array.isArray(style) ? style : [style]
	let changed = false
	let next: any[] | undefined

	arr.forEach((entry, i) => {
		if (
			entry &&
			typeof entry === 'object' &&
			entry.position === 'absolute' &&
			typeof entry.left === 'number' &&
			typeof entry.top === 'number' &&
			typeof entry.bottom === 'number' &&
			typeof entry.right === 'number'
		) {
			const left = snapshot().dmTileMode === 'rail' ? RAIL_WIDTH : 0
			if (entry.left !== left) {
				next = next ?? [...arr]
				next[i] = { ...entry, left }
				changed = true
				if (!shiftLogged) {
					shiftLogged = true
					console.log(TAG, `messages sideContainer left -> ${left}`)
				}
			}
		}
	})

	if (!changed) return props
	return { ...props, style: Array.isArray(style) ? next : next?.[0] }
}

const intercepted = new Set<any>()
const mutated = new Set<any>()

function bindImported(
	path: string,
	name: string,
	exportKey: string,
	replacement: any,
	cleanups: (fn: () => void) => void,
	onBound: () => void,
): void {
	try {
		valenced.discord.utils.modules.finders.getModuleWithImportedPath(
			path,
			(module: any) => {
				try {
					const original = module?.[exportKey]
					if (!original || typeof original !== 'object') return
					if (!intercepted.has(original)) {
						intercepted.add(original)
						registerIntercept(original, replacement)
						onBound()
						console.log(TAG, `PATCH: ${name} intercepted (exact-ref)`)
					}
					if (module[exportKey] !== replacement && !mutated.has(module)) {
						mutated.add(module)
						module[exportKey] = replacement
						cleanups(() => {
							mutated.delete(module)
							module[exportKey] = original
						})
						console.log(TAG, `PATCH: ${name} replaced (module mutation)`)
					}
				} catch {
					// ignore
				}
			},
		)
	} catch {
		// ignore
	}
}

export function patchHideGuildsBar(
	cleanups: (fn: () => void) => void,
): boolean {
	let bound = 0

	registerPropsTransform(
		(props: any) => isMessagesPanel(props),
		(props: any) => shiftSideContainerLeft(props),
	)

	registerTypeDetector(
		'ServerDrawer.HomePanelContent',
		(type: any) => hasName(type, 'HomePanelContent'),
		(type: any) => {
			registerIntercept(type, HomePanelContentPatch)
			console.log(TAG, 'PATCH: HomePanelContent replaced (type detector)')
		},
		{ persistent: true },
	)

	registerTypeDetector(
		'ServerDrawer.GuildsBar',
		(type: any) => hasName(type, 'GuildsBar'),
		(type: any) => {
			registerIntercept(type, GuildsBarPatch)
			console.log(TAG, 'PATCH: GuildsBar replaced (type detector)')
		},
		{ persistent: true },
	)

	bindImported(
		'modules/guilds_bar/native/GuildsBar.tsx',
		'GuildsBar',
		'default',
		GuildsBarPatch,
		cleanups,
		() => bound++,
	)

	bindImported(
		'modules/main_tabs_v2/native/tabs/guilds/HomePanelContent.tsx',
		'HomePanelContent',
		'HomePanelContent',
		HomePanelContentPatch,
		cleanups,
		() => bound++,
	)

	console.log(TAG, `home + guilds bar refs bound (${bound})`)
	return bound > 0
}
