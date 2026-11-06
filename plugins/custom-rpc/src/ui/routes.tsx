import AssetLibraryPage from './pages/AssetLibraryPage'
import ImageSettingsPage from './pages/ImageSettingsPage'

const PREFIX = 'kmmiio99o.custom-rpc'

export const LARGE_IMAGE_ROUTE = `${PREFIX}.image-large`
export const SMALL_IMAGE_ROUTE = `${PREFIX}.image-small`
export const LARGE_ASSET_ROUTE = `${PREFIX}.assets-large`
export const SMALL_ASSET_ROUTE = `${PREFIX}.assets-small`

function refreshSettingsUI() {
	const settings = valenced.discord.modules.settings as any
	if (typeof settings.refreshSettings === 'function') {
		settings.refreshSettings()
		return
	}
	settings.refreshSettingsNavigator?.()
	settings.refreshSettingsOverviewScreen?.()
}

export function registerImagePages(): () => void {
	const { registerSettingsItem } = valenced.discord.modules.settings

	const unregister = [
		registerSettingsItem(LARGE_IMAGE_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Large Image',
			screen: {
				route: LARGE_IMAGE_ROUTE,
				getComponent: () => () => <ImageSettingsPage imageKey="largeImage" />,
			},
		}),
		registerSettingsItem(SMALL_IMAGE_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Small Image',
			screen: {
				route: SMALL_IMAGE_ROUTE,
				getComponent: () => () => <ImageSettingsPage imageKey="smallImage" />,
			},
		}),
		registerSettingsItem(LARGE_ASSET_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Large Image Assets',
			screen: {
				route: LARGE_ASSET_ROUTE,
				getComponent: () => () => <AssetLibraryPage imageKey="largeImage" />,
			},
		}),
		registerSettingsItem(SMALL_ASSET_ROUTE, {
			parent: null,
			type: 'route',
			useTitle: () => 'Small Image Assets',
			screen: {
				route: SMALL_ASSET_ROUTE,
				getComponent: () => () => <AssetLibraryPage imageKey="smallImage" />,
			},
		}),
	]

	refreshSettingsUI()

	return () => {
		for (const remove of unregister) remove()
		refreshSettingsUI()
	}
}
