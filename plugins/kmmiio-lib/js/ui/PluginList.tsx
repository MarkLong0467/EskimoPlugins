import { KmmiioLib } from '../lib/api'
import PluginInfoSheet from './PluginInfoSheet'

const getRegistry = () => KmmiioLib

function openPluginInfoSheet(pluginId: string) {
	const actions = valenced.discord.actions.ActionSheetActionCreators
	actions.openLazy(
		Promise.resolve({
			default: () => <PluginInfoSheet pluginId={pluginId} />,
		}),
		`kmmiio-plugin-info:${pluginId}`,
		{},
	)
}

function getStatusName(status: number | string): string {
	if (typeof status === 'string') return status
	if (status & 32) return 'Running'
	if (status & 16) return 'Starting...'
	if (status & 8) return 'Started'
	if (status & 4) return 'Initializing...'
	if (status & 2) return 'Pre-initialized'
	if (status & 1) return 'Pre-initializing...'
	return 'Unknown'
}

function formatVersion(version: any): string {
	if (!version) return 'Unknown'
	if (typeof version === 'string') return version
	if (version.nums) return version.nums.join('.')
	return 'Unknown'
}

export default function PluginList() {
	const { TableRowGroup, TableRow } = valenced.discord.design.Design
	const [, forceUpdate] = valenced.react.React.useReducer(
		(x: number) => x + 1,
		0,
	)

	valenced.react.React.useEffect(() => {
		const kmmiio = getRegistry()
		if (!kmmiio?.onRegistryChange) return

		return kmmiio.onRegistryChange(() => {
			forceUpdate()
		})
	}, [])

	const kmmiio = getRegistry()
	const plugins: any[] = kmmiio?.getAllRegisteredPlugins?.() ?? []

	return (
		<TableRowGroup title="Plugins">
			{plugins.map(registered => (
				<TableRow
					key={registered.id}
					label={registered.name}
					subLabel={`v${formatVersion(registered.version)} · ${getStatusName(registered.getStatus())}`}
					onPress={() => openPluginInfoSheet(registered.id)}
					arrow
				/>
			))}
		</TableRowGroup>
	)
}
