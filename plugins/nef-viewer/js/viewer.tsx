import { getModules } from '@valenced/modules/finders'
import { withName, withProps } from '@valenced/modules/finders/filters'
import { instead } from '@valenced/patcher'
import { useMemo, useRef } from 'react'
import { PanResponder, Pressable, Text, View } from 'react-native'
import { setting } from './config'
import { SHEET_KEY } from './constants'
import { findByProps, sheets } from './discord'
import MetadataSheet from './MetadataSheet'
import { pictureFile } from './picture'
import type { ReactElement } from 'react'
import type { ViewerSource } from './types'

/** How far up a swipe on the handle has to go to open the info. */
const SWIPE_DISTANCE = 40

/** Opens the info sheet for the picture the viewer shows. Returns false if the viewer shows no picture. */
export function openInfo(source: ViewerSource): boolean {
	const file = pictureFile(source)
	if (!file) return false
	sheets().openLazy(
		Promise.resolve({
			default: () => <MetadataSheet source={source} file={file} />,
		}),
		SHEET_KEY,
		{},
	)
	return true
}

/** The info button and the swipe-up handle drawn over the viewer. They sit apart from Discord's own controls. */
export function InfoLayer({ source }: { source: ViewerSource | undefined }) {
	const current = useRef(source)
	current.current = source
	const responder = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_event, gesture) =>
					gesture.dy < -8 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
				onPanResponderRelease: (_event, gesture) => {
					if (gesture.dy < -SWIPE_DISTANCE && current.current)
						openInfo(current.current)
				},
			}),
		[],
	)

	if (!source || !pictureFile(source)) return null
	const button = setting('infoButton')
	const swipe = setting('swipeUp')
	if (!button && !swipe) return null

	return (
		<View
			pointerEvents="box-none"
			style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
		>
			{button ? (
				<Pressable
					accessibilityLabel="Picture info"
					onPress={() => openInfo(source)}
					style={{
						position: 'absolute',
						right: 16,
						bottom: 96,
						width: 44,
						height: 44,
						borderRadius: 22,
						alignItems: 'center',
						justifyContent: 'center',
						backgroundColor: 'rgba(0,0,0,0.6)',
					}}
				>
					<Text style={{ color: '#ffffff', fontSize: 20, fontWeight: '700' }}>
						i
					</Text>
				</Pressable>
			) : null}
			{swipe ? (
				<View
					{...responder.panHandlers}
					style={{
						position: 'absolute',
						left: 0,
						right: 0,
						bottom: 0,
						height: 72,
						alignItems: 'center',
						justifyContent: 'flex-start',
						paddingTop: 10,
					}}
				>
					<View
						style={{
							width: 40,
							height: 5,
							borderRadius: 3,
							backgroundColor: 'rgba(255,255,255,0.6)',
						}}
					/>
					<Text
						style={{
							color: 'rgba(255,255,255,0.7)',
							fontSize: 11,
							marginTop: 4,
						}}
					>
						Swipe up for info
					</Text>
				</View>
			) : null}
		</View>
	)
}

/** The viewer, with the info layer over it. */
function withInfoLayer(
	result: unknown,
	props: { source?: ViewerSource } | undefined,
): unknown {
	if (!result || (!setting('infoButton') && !setting('swipeUp'))) return result
	return (
		<>
			{result as ReactElement}
			<InfoLayer source={props?.source} />
		</>
	)
}

/**
 * Patches Discord's picture viewer (`MediaModalOverlay`), so every picture in it gets the info button and the handle.
 * Anything that goes wrong draws the viewer as Discord would.
 */
export function installViewer(
	cleanup: (...fns: Array<() => unknown>) => unknown,
): void {
	cleanup(
		getModules(
			withName('MediaModalOverlay'),
			module => {
				const target = module as { default?: unknown } | null | undefined
				if (!target || typeof target.default !== 'function') return
				cleanup(
					instead(
						target as { default: (...args: unknown[]) => unknown },
						'default',
						function (args, original) {
							const result = Reflect.apply(original, this, args)
							try {
								return withInfoLayer(
									result,
									args[0] as { source?: ViewerSource },
								)
							} catch {
								return result
							}
						},
					),
				)
			},
			{ returnNamespace: true },
		),
	)
}

/** The text of the viewer's menu entry. */
const MENU_LABEL = 'Photo info'

/** One entry of the viewer's menu (the three dots). Discord's own have more fields. */
interface ShareItem {
	label?: string
	IconComponent?: unknown
	action?: () => void
	[field: string]: unknown
}

/** The info icon, or nothing if Discord has no such icon. */
function infoIcon(): unknown {
	try {
		return (
			findByProps<{ CircleInformationIcon?: unknown; InfoIcon?: unknown }>(
				'CircleInformationIcon',
			)?.CircleInformationIcon ??
			findByProps<{ InfoIcon?: unknown }>('InfoIcon')?.InfoIcon
		)
	} catch {
		return undefined
	}
}

/**
 * Adds Photo info to the menu behind the three dots of Discord's picture viewer, for pictures.
 *
 * The menu is made by , which gets the picture () and returns a list of items. The new item
 * is a copy of the first one (so it looks like the others), with its label and action replaced and the info icon if there is one.
 */
export function installMenuItem(
	cleanup: (...fns: Array<() => unknown>) => unknown,
): void {
	cleanup(
		getModules(withProps('useMediaShareActions'), module => {
			const target = module as
				| { useMediaShareActions?: unknown }
				| null
				| undefined
			if (!target || typeof target.useMediaShareActions !== 'function') return
			cleanup(
				instead(
					target as { useMediaShareActions: (...args: unknown[]) => unknown },
					'useMediaShareActions',
					function (args, original) {
						const result = Reflect.apply(original, this, args)
						try {
							if (!setting('infoButton') || !Array.isArray(result))
								return result
							const input = args[0] as { source?: ViewerSource } | undefined
							const source =
								input?.source ?? (input as ViewerSource | undefined)
							if (!source || !pictureFile(source)) return result
							const items = result as ShareItem[]
							if (items.some(item => item?.label === MENU_LABEL)) return result
							const template = items.find(
								item => item && typeof item.label === 'string',
							)
							if (!template) return result
							const icon = infoIcon()
							return [
								...items,
								{
									...template,
									label: MENU_LABEL,
									IconComponent: icon ?? template.IconComponent,
									action: () => openInfo(source),
								},
							]
						} catch {
							return result
						}
					},
				),
			)
		}),
	)
}
