import { diag } from './diag'
import { forceLoadCreateGuild, startNavigation } from './lib/actions'
import { bindKmmiio, kmmiio } from './lib/kmmiio'
import { defaults, migrateStorage, setStorageRef } from './lib/modules'
import {
	COLLAPSED_DOCK_HEIGHT,
	patchDockAssetPrefetch,
	patchMobileQuestDock,
	patchQuestDockBase,
	patchQuestDockRender,
	patchQuestEligibility,
} from './lib/quests'
import { patchCreateElement } from './lib/registry'
import { patchCollapsed, patchEmpty, patchExpanded } from './patches/content'
import { patchHideGuildsBar } from './patches/hideGuildsBar'
import { patchHomeDrawerExperiment } from './patches/homeDrawer'
import { patchTransparentBackground } from './patches/transparentBackground'
import Settings from './ui/Settings'
import type { PluginCleanupApi } from '@valenced/plugins/types'
import type { ServerDrawerStorage } from './lib/modules'

export default plugin<{ jsonStorage: ServerDrawerStorage }>({
	jsonStorage: {
		load: true,
		default: defaults,
	},
	start({ cleanup, jsonStorage, plugin }) {
		diag.attach(plugin)
		cleanup(diag.listen())
		setStorageRef(jsonStorage)
		migrateStorage(jsonStorage)
		bindKmmiio(plugin.api)

		kmmiio()?.setActivePlugin?.(plugin.manifest.id)
		kmmiio()?.registerPlugin?.({
			id: plugin.manifest.id,
			name: plugin.manifest.name,
			icon: plugin.manifest.icon,
			author: plugin.manifest.author,
			description: plugin.manifest.description,
			version: plugin.manifest.version,
			getStatus: () => (plugin.errors.length > 0 ? 'Errored' : 'Running'),
			getErrors: () => plugin.errors,
		})

		// Pre-load the create-guild lazy chunk so the first tap isn't async.
		diag.guard('create-guild warm-up', forceLoadCreateGuild)

		diag.guard('navigation', startNavigation)

		const install = (
			name: string,
			patch: (cleanup: PluginCleanupApi) => unknown,
		) =>
			diag.apply(name, () => {
				patch(cleanup)
			})

		install('create element', patchCreateElement)

		install('mobile quest dock', patchMobileQuestDock)
		install('quest dock base', patchQuestDockBase)
		install('quest dock render', patchQuestDockRender)
		install('quest eligibility', patchQuestEligibility)
		install('dock asset prefetch', patchDockAssetPrefetch)

		install('expanded drawer', patchExpanded)
		install('collapsed drawer', patchCollapsed)
		install('QuestDockEnrolledHeader', () => {
			patchEmpty('QuestDockEnrolledHeader', cleanup)
		})
		install('QuestDockUnenrolledHeader', () => {
			patchEmpty('QuestDockUnenrolledHeader', cleanup)
		})
		install('QuestDockEnrolledBody', () => {
			patchEmpty('QuestDockEnrolledBody', cleanup)
		})
		install('QuestDockUnenrolledBody', () => {
			patchEmpty('QuestDockUnenrolledBody', cleanup)
		})

		install('hide guilds bar', patchHideGuildsBar)
		install('transparent background', patchTransparentBackground)
		install('home drawer experiment', patchHomeDrawerExperiment)

		// Raise the collapsed dock height so the first row's icons (and a peek of
		// the second row) stay fully visible when the drawer collapses.
		// QuestDockConstants loads lazily after boot, so it can't be mutated at
		// startup. Instead subscribe on registration: revenge-bundle runs the
		// module-init subscriptions synchronously right after the module factory
		// and before metroRequire returns, so mutating the export here is seen by
		// QuestDockHooks when it destructures the constant into its worklet
		// closure. The JS safety-net override in ServerDrawerSheet stays as a
		// backstop for the already-initialized/strict mode.
		try {
			const { getModules } = valenced.modules.finders
			const { withProps } = valenced.modules.finders.filters
			const unsubDockHeight: () => void = getModules(
				withProps('QUEST_DOCK_COLLAPSED_HEIGHT'),
				exports => {
					if (
						exports &&
						typeof exports.QUEST_DOCK_COLLAPSED_HEIGHT === 'number'
					) {
						const prev = exports.QUEST_DOCK_COLLAPSED_HEIGHT
						if (prev !== COLLAPSED_DOCK_HEIGHT) {
							exports.QUEST_DOCK_COLLAPSED_HEIGHT = COLLAPSED_DOCK_HEIGHT
							console.log(
								'[ServerDrawer] QUEST_DOCK_COLLAPSED_HEIGHT',
								prev,
								'->',
								COLLAPSED_DOCK_HEIGHT,
							)
						}
					}
				},
				{ max: 1 },
			)
			cleanup(() => {
				try {
					unsubDockHeight?.()
				} catch {}
			})
		} catch {}

		if (plugin.startedLate) plugin.requireReload()

		console.log(
			'[ServerDrawer] loaded v' +
				plugin.manifest.version +
				' marker=sd-2026-09-25-22',
		)
	},
	stop({ plugin }) {
		kmmiio()?.unregisterPlugin?.(plugin.manifest.id)
	},
	SettingsComponent: Settings,
})
