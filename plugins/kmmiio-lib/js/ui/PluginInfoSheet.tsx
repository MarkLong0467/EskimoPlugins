import { KmmiioLib } from '../lib/api'

const { Image, View } = valenced.react.ReactNative
const React = valenced.react.React

let scrollContainerModule: any
function getScrollContainer(): any {
	if (scrollContainerModule) return scrollContainerModule
	try {
		const [exports] = valenced.modules.finders.lookupModule(
			valenced.modules.finders.filters.withProps('BottomSheetScrollView'),
		)
		if (exports?.BottomSheetScrollView) {
			scrollContainerModule = exports.BottomSheetScrollView
		}
	} catch {}
	return scrollContainerModule
}

const getRegistry = () => KmmiioLib

export default function PluginInfoSheet({ pluginId }: { pluginId: string }) {
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		ActionSheetCloseButton,
		TableRowGroup,
		TableRow,
		Stack,
		Card,
		Text,
	} = Design
	const ScrollContainer =
		getScrollContainer() ?? (valenced.react.ReactNative as any).ScrollView

	const kmmiio = getRegistry()
	const registered = kmmiio?.getRegisteredPlugin?.(pluginId)
	if (!registered) return null

	const status = getStatusName(registered.getStatus())
	const errors = (registered.getErrors() ?? []).map((e: any) => {
		if (typeof e === 'string') return e
		if (e && typeof e === 'object') {
			const code = e.code ?? 'Unknown'
			const message = e.message ?? String(e)
			return `[${code}] ${message}`
		}
		return String(e)
	})
	const version = formatVersion(registered.version)

	const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)
	React.useEffect(() => {
		return kmmiio?.onLogChange?.(() => forceUpdate())
	}, [])

	const logs = kmmiio?.getLogsForPlugin?.(pluginId) ?? []

	let iconSource: number | undefined
	try {
		iconSource = valenced.assets.getAssetIdByName(
			registered.icon ?? 'PuzzlePieceIcon',
		)
	} catch {}

	return (
		<ActionSheet
			scrollable
			contentStyles={{ paddingHorizontal: 0, paddingBottom: 0 }}
			header={
				<BottomSheetTitleHeader
					title={registered.name}
					subtitle={pluginId}
					leading={
						iconSource != null ? (
							<Image
								source={iconSource}
								style={{ width: 24, height: 24, marginTop: 9 }}
							/>
						) : undefined
					}
					trailing={
						<View style={{ marginTop: 9 }}>
							<ActionSheetCloseButton
								onPress={() =>
									valenced.discord.actions.ActionSheetActionCreators.hideActionSheet()
								}
							/>
						</View>
					}
				/>
			}
		>
			<ScrollContainer
				contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}
				nestedScrollEnabled={true}
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<Stack spacing={16} style={{ paddingHorizontal: 16 }}>
					<TableRowGroup title="Info">
						<TableRow label="Version" subLabel={version} />
						<TableRow
							label="Author"
							subLabel={registered.author ?? 'Unknown'}
						/>
						<TableRow label="Description" subLabel={registered.description} />
						<TableRow label="Status" subLabel={status} />
					</TableRowGroup>

					{errors.length > 0 && (
						<TableRowGroup title={`Errors (${errors.length})`}>
							{errors.map((err: string, i: number) => (
								<TableRow
									key={i}
									variant="danger"
									label={`Error ${i + 1}`}
									subLabel={err}
								/>
							))}
						</TableRowGroup>
					)}

					{logs.length > 0 && (
						<TableRowGroup title={`Library Logs (${logs.length})`}>
							<Card>
								<View style={{ padding: 12 }}>
									{logs.map((log: any, i: number) => {
										const iconId = log.found
											? valenced.assets.getAssetIdByName('CircleCheckIcon')
											: valenced.assets.getAssetIdByName('CircleXIcon')
										return (
											<View key={i} style={{ marginBottom: 8 }}>
												<View
													style={{
														flexDirection: 'row',
														justifyContent: 'space-between',
														alignItems: 'center',
													}}
												>
													<View
														style={{
															flexDirection: 'row',
															alignItems: 'center',
														}}
													>
														{iconId != null && (
															<Image
																source={iconId}
																style={{
																	width: 16,
																	height: 16,
																	marginRight: 6,
																}}
															/>
														)}
														<Text variant="text-sm/semibold">{log.module}</Text>
													</View>
													<Text variant="text-xs/medium">#{log.attempt}</Text>
												</View>
												<Text variant="text-xs/medium">{log.action}</Text>
											</View>
										)
									})}
								</View>
							</Card>
						</TableRowGroup>
					)}
				</Stack>
			</ScrollContainer>
		</ActionSheet>
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
