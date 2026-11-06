import { useCallback, useEffect, useState } from 'react'
import { cdnAppAssetByIdUrl, DEFAULTS } from '../../constants'
import { getCloseIcon, getCloseIconColor } from '../../lib/icons'
import {
	checkAssetAccess,
	deleteOAuth2Asset,
	errorDetails,
	errorToText,
	isAssetLive,
	listOAuth2Assets,
	logAssetDiagnostics,
	pickAndUploadAsset,
} from '../../lib/portal'
import { getStorage } from '../../lib/state'
import { showToast } from '../../lib/toasts'
import ErrorDetails from '../components/ErrorDetails'
import type { AssetAccess, PortalOAuth2Asset } from '../../lib/portal'
import type { CustomRpcStorage, ImageConfig } from '../../types'

/**
 * Asset thumbnail.
 *
 * Requests the same sized webp the client's own loader would, and falls back to
 * the unsized original if that misses — a failed load renders as an invisible gap,
 * which is indistinguishable from "my upload never showed up".
 */
function AssetThumbnail({
	clientId,
	assetId,
	size,
}: {
	clientId: string
	assetId: string
	size: number
}) {
	const { Image } = valenced.react.ReactNative
	const [uri, setUri] = useState(cdnAppAssetByIdUrl(clientId, assetId, size))
	return (
		<Image
			source={{ uri }}
			style={{ width: size, height: size, borderRadius: 6 }}
			onError={() => {
				const plain = cdnAppAssetByIdUrl(clientId, assetId)
				setUri(current => (current === plain ? current : plain))
			}}
		/>
	)
}

export default function AssetLibraryPage({
	imageKey,
}: {
	imageKey: 'largeImage' | 'smallImage'
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { Pressable, ScrollView, View } = valenced.react.ReactNative
	const { Stack, TableRowGroup, TableRow, Text } =
		valenced.discord.design.Design
	const CloseIcon = getCloseIcon()
	const closeIconColor = getCloseIconColor()
	const { useNavigation } =
		valenced.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { goBack: () => void }

	const [assets, setAssets] = useState<PortalOAuth2Asset[] | null>(null)
	const [access, setAccess] = useState<AssetAccess | null>(null)
	const [error, setError] = useState<string | null>(null)
	const [details, setDetails] = useState('')
	const [loading, setLoading] = useState(false)
	const [busy, setBusy] = useState(false)

	const storage = getStorage()
	const s: CustomRpcStorage = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const clientId = s.clientId
	const config: ImageConfig = s[imageKey]
	const assetType: 1 | 2 = imageKey === 'largeImage' ? 2 : 1

	const refresh = useCallback(async () => {
		if (!clientId) return
		setLoading(true)
		setError(null)
		setDetails('')
		try {
			// The assets route is owner-scoped, so one request answers both
			// "can this account manage this app?" and "what assets exist?".
			const result = await checkAssetAccess(clientId)
			setAccess(result)
			setAssets(result.ok ? await listOAuth2Assets(clientId) : [])
			void logAssetDiagnostics(clientId)
		} catch (err) {
			setAssets(null)
			setError(errorToText(err))
			setDetails(errorDetails(err))
		} finally {
			setLoading(false)
		}
	}, [clientId])

	const choose = useCallback(
		async (asset: PortalOAuth2Asset, dismiss = true) => {
			storage?.set({
				[imageKey]: {
					...config,
					source: 'key',
					value: asset.name,
					assetId: asset.id,
				},
			} as Partial<CustomRpcStorage>)
			showToast(`Using "${asset.name}"`)
			// Uploading stays on the page: bouncing straight back meant the freshly
			// uploaded row was never actually seen.
			if (dismiss) navigation.goBack()

			// A newly uploaded asset is not servable straight away. If it 404s the
			// client caches the miss and the presence shows no image until the
			// activity is set again, so say so instead of leaving it looking broken.
			if (asset.id && !(await isAssetLive(clientId, asset.id))) {
				showToast('Asset is still uploading — reapply in a moment')
			}
		},
		[storage, config, imageKey, navigation, clientId],
	)

	const upload = useCallback(async () => {
		if (!clientId) return
		setBusy(true)
		try {
			const created = await pickAndUploadAsset(clientId, assetType)
			if (created) {
				await refresh()
				await choose(created, false)
			}
		} finally {
			setBusy(false)
		}
	}, [clientId, assetType, refresh, choose])

	const remove = useCallback(
		async (asset: PortalOAuth2Asset) => {
			setBusy(true)
			try {
				await deleteOAuth2Asset(clientId, asset.id)
				showToast(`Deleted "${asset.name}"`)
				await refresh()
			} catch (err) {
				setError(errorToText(err))
				setDetails(errorDetails(err))
				showToast('Could not delete')
			} finally {
				setBusy(false)
			}
		},
		[clientId, refresh],
	)

	useEffect(() => {
		refresh()
	}, [refresh])

	const typeName = assetType === 2 ? 'Large' : 'Small'

	// Show every asset, not just the ones matching this slot: Discord does not
	// actually require a "small" type asset for small_image, and hiding the
	// others made existing uploads look missing. Matching ones sort first, and
	// each row says which slot it was uploaded as.
	const all = assets ?? []
	const ordered = [...all].sort(
		(a, b) => Number(b.type === assetType) - Number(a.type === assetType),
	)

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				{!clientId ? (
					<View style={{ padding: 16 }}>
						<Text variant="text-md/medium" color="text-muted">
							Set an Application ID first to manage its assets.
						</Text>
					</View>
				) : null}

				<Stack>
					<TableRowGroup title="Upload">
						{access && !access.ok ? (
							<TableRow
								label="Cannot upload for this application"
								subLabel={access.reason}
							/>
						) : (
							<TableRow
								label={busy ? 'Working…' : 'Upload from device'}
								subLabel={`Adds a new ${typeName.toLowerCase()} asset`}
								trailing={<TableRow.Arrow />}
								disabled={busy || !clientId}
								onPress={upload}
							/>
						)}
					</TableRowGroup>

					<TableRowGroup title={`${typeName} assets`}>
						{loading ? (
							<TableRow label="Loading…" />
						) : assets === null ? (
							<TableRow
								label="Could not load assets"
								subLabel={error ?? 'Request failed'}
								onPress={refresh}
							/>
						) : ordered.length === 0 ? (
							<TableRow
								label={`No assets on this application yet`}
								subLabel="Upload one to use it as your image"
							/>
						) : (
							// Flat array, not Fragment/View wrappers: TableRowGroup only
							// inserts dividers between its *direct* children.
							ordered.map(asset => {
								const isUsed =
									config.source === 'key' && config.value === asset.name
								const slot =
									asset.type == null
										? null
										: asset.type === 2
											? 'large'
											: 'small'
								const labelNode = (
									<View
										style={{
											flexDirection: 'row',
											alignItems: 'center',
											gap: 8,
										}}
									>
										<AssetThumbnail
											clientId={clientId}
											assetId={asset.id}
											size={28}
										/>

										<Text variant="text-md/semibold">{asset.name}</Text>
									</View>
								)
								return (
									<TableRow
										key={`${asset.id}-use`}
										label={labelNode as any}
										subLabel={
											isUsed
												? 'In use'
												: slot && slot !== typeName.toLowerCase()
													? `Uploaded as a ${slot} image — Discord may not render this in a ${typeName.toLowerCase()} slot`
													: 'Tap to use for this image'
										}
										trailing={
											// Shown even while in use: an asset that is still
											// selected should still be deletable.
											<View
												style={{
													flexDirection: 'row',
													alignItems: 'center',
													gap: 12,
												}}
											>
												<Pressable
													onPress={() => remove(asset)}
													accessibilityRole="button"
													accessibilityLabel={`Delete ${asset.name}`}
													hitSlop={{ top: 5, right: 5, bottom: 5, left: 5 }}
													disabled={busy}
													style={({ pressed }) => ({
														marginRight: 10,
														opacity: pressed || busy ? 0.5 : 1,
													})}
												>
													{CloseIcon ? (
														// `size` is for the generated component, the
														// void SVG fallback takes pixels. Each ignores
														// the props it does not use.
														<CloseIcon
															size="md"
															width={24}
															height={24}
															color={closeIconColor}
														/>
													) : null}
												</Pressable>
											</View>
										}
										onPress={() => choose(asset)}
									/>
								)
							})
						)}
					</TableRowGroup>

					<ErrorDetails details={details} />
				</Stack>
			</ScrollView>
		</Page>
	)
}
