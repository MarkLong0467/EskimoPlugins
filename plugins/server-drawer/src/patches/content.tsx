import CollapsedDockContent from '../components/CollapsedDockContent'
import ServerDrawerSheet from '../components/ServerDrawerSheet'
import { getGestureContext } from '../lib/modules'
import {
	hasName,
	registerIntercept,
	registerTypeDetector,
} from '../lib/registry'

const TAG = '[ServerDrawer.Content]'

export const QUEST_DOCK_MODULE_PATHS: Record<string, string> = {
	QuestDockContentExpanded:
		'modules/quests/native/QuestDock/QuestDockContentExpanded.tsx',
	QuestDockContentCollapsed:
		'modules/quests/native/QuestDock/QuestDockContentCollapsed.tsx',
	QuestDockEnrolledHeader:
		'modules/quests/native/QuestDock/QuestDockEnrolledHeader.tsx',
	QuestDockUnenrolledHeader:
		'modules/quests/native/QuestDock/QuestDockUnenrolledHeader.tsx',
	QuestDockEnrolledBody:
		'modules/quests/native/QuestDock/QuestDockEnrolledBody.tsx',
	QuestDockUnenrolledBody:
		'modules/quests/native/QuestDock/QuestDockUnenrolledBody.tsx',
}

function EmptyPatch() {
	return null
}

function unwrap(type: any): any {
	let cur = type
	let depth = 0
	while (cur && typeof cur === 'object' && depth++ < 8) {
		if (
			typeof cur.type === 'function' ||
			(cur.type && typeof cur.type === 'object')
		) {
			cur = cur.type
		} else if (typeof cur.render === 'function') {
			cur = cur.render
		} else {
			break
		}
	}
	return cur
}

const patchedModules = new Set<any>()
const mutatedModules = new Set<any>()

function patchByModule(
	path: string,
	name: string,
	replacement: any,
	cleanups: (fn: () => void) => void,
	extraProps?: Record<string, any>,
): void {
	try {
		valenced.discord.utils.modules.finders.getModuleWithImportedPath(
			path,
			(module: any) => {
				try {
					const original = module?.default
					if (!original || typeof original !== 'object') return
					if (!patchedModules.has(original)) {
						patchedModules.add(original)
						registerIntercept(original, replacement, extraProps)
						console.log(TAG, `PATCH: ${name} replaced (exact-ref intercept)`)
					}
					if (module.default !== replacement && !mutatedModules.has(module)) {
						mutatedModules.add(module)
						module.default = replacement
						cleanups(() => {
							mutatedModules.delete(module)
							module.default = original
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

export function patchExpanded(cleanups: (fn: () => void) => void): boolean {
	const gestureCtx = getGestureContext()

	registerTypeDetector(
		'ServerDrawer.Expanded',
		(type: any) => hasName(type, 'QuestDockContentExpanded'),
		(type: any) => {
			registerIntercept(type, ServerDrawerSheet, { gestureContext: gestureCtx })
			console.log(
				TAG,
				'PATCH: QuestDockContentExpanded replaced (type detector)',
			)
		},
		{ persistent: true },
	)

	patchByModule(
		QUEST_DOCK_MODULE_PATHS.QuestDockContentExpanded,
		'QuestDockContentExpanded',
		ServerDrawerSheet,
		cleanups,
		{ gestureContext: gestureCtx },
	)

	return true
}

export function patchCollapsed(cleanups: (fn: () => void) => void): boolean {
	registerTypeDetector(
		'ServerDrawer.Collapsed',
		(type: any) => hasName(type, 'QuestDockContentCollapsed'),
		(type: any) => {
			registerIntercept(type, CollapsedDockContent)
			console.log(
				TAG,
				'PATCH: QuestDockContentCollapsed replaced (type detector)',
			)
		},
		{ persistent: true },
	)

	patchByModule(
		QUEST_DOCK_MODULE_PATHS.QuestDockContentCollapsed,
		'QuestDockContentCollapsed',
		CollapsedDockContent,
		cleanups,
	)

	return true
}

export function patchEmpty(
	name: string,
	cleanups: (fn: () => void) => void,
): boolean {
	registerTypeDetector(
		`ServerDrawer.Empty.${name}`,
		(type: any) => hasName(type, name),
		(type: any) => {
			registerIntercept(type, EmptyPatch)
			const inner = unwrap(type)
			if (inner && inner !== type) {
				registerIntercept(inner, EmptyPatch)
			}
			console.log(TAG, `PATCH: ${name} replaced (type detector)`)
		},
		{ persistent: true },
	)

	const path = QUEST_DOCK_MODULE_PATHS[name]
	if (path) {
		patchByModule(path, name, EmptyPatch, cleanups)
	}

	return true
}
