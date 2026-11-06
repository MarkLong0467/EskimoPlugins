import { useEffect, useState } from 'react'
import { DEFAULTS } from '../../constants'
import { listOAuth2Assets } from '../../lib/portal'
import { getImagePreviewUri, getStorage } from '../../lib/state'
import TextInputRow from '../components/TextInputRow'
import { LARGE_ASSET_ROUTE, SMALL_ASSET_ROUTE } from '../routes'
import type { PortalOAuth2Asset } from '../../lib/portal'
import type { CustomRpcStorage, ImageConfig, ImageSource } from '../../types'

const styles = {
	previewWrap: {
		alignItems: 'center',
		paddingVertical: 20,
	},
	previewCard: {
		padding: 16,
	},
	preview: {
		width: 96,
		height: 96,
		borderRadius: 14,
		overflow: 'hidden',
	},
	previewImage: { width: '100%', height: '100%' },
	previewEmpty: {
		width: '100%',
		height: '100%',
		alignItems: 'center',
		justifyContent: 'center',
	},
} as const

export default function ImageSettingsPage({
	imageKey,
}: {
	imageKey: 'largeImage' | 'smallImage'
}) {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView, View, Image } = valenced.react.ReactNative
	const {
		Card,
		Stack,
		TableRadioGroup,
		TableRadioRow,
		TableRowGroup,
		TableRow,
		Text: DText,
	} = valenced.discord.design.Design
	const { useNavigation } =
		valenced.externals.ReactNavigation.ReactNavigationNative

	const navigation = useNavigation() as { navigate: (route: string) => void }

	const storage = getStorage()
	const stored: CustomRpcStorage = { ...DEFAULTS, ...(storage?.use() ?? {}) }
	const persisted: ImageConfig = stored[imageKey]

	// Mirror the persisted config locally so the page reacts on the same tick as
	// the tap, instead of waiting for the storage subscription to come back.
	const [source, setSource] = useState<ImageSource>(persisted.source)
	const [value, setValue] = useState(persisted.value)
	const [text, setText] = useState(persisted.text)

	// Adopt changes that came from somewhere else (e.g. the asset library, or the
	// application sheet clearing the ID).
	useEffect(() => {
		setSource(persisted.source)
		setValue(persisted.value)
		setText(persisted.text)
	}, [persisted.source, persisted.value, persisted.text])

	const write = (next: ImageConfig) => {
		storage?.set({ [imageKey]: next } as Partial<CustomRpcStorage>)
	}

	const isLarge = imageKey === 'largeImage'
	const typeName = isLarge ? 'Large' : 'Small'
	const expectedType: 1 | 2 = isLarge ? 2 : 1
	const clientId = stored.clientId

	// Look up the selected asset's real slot so a mismatch can be called out.
	// Discord silently refuses to render a small asset in `large_image` (and vice
	// versa) while the CDN preview still looks correct, which makes this very
	// easy to miss without an explicit warning.
	const [selectedAsset, setSelectedAsset] = useState<PortalOAuth2Asset | null>(
		null,
	)
	useEffect(() => {
		if (source !== 'key' || !clientId) {
			setSelectedAsset(null)
			return
		}
		let cancelled = false
		listOAuth2Assets(clientId)
			.then(list => {
				if (cancelled) return
				setSelectedAsset(
					list.find(a => a.id === persisted.assetId) ??
						list.find(a => a.name === value) ??
						null,
				)
			})
			.catch(() => {
				if (!cancelled) setSelectedAsset(null)
			})
		return () => {
			cancelled = true
		}
	}, [source, clientId, persisted.assetId, value])

	const mismatched =
		source === 'key' &&
		selectedAsset?.type != null &&
		selectedAsset.type !== expectedType

	const previewUri = getImagePreviewUri(
		{ source, value, assetId: persisted.assetId },
		clientId,
	)

	const handleSource = (next: ImageSource) => {
		setSource(next)
		// Switching to "None" should also drop the value so the Details group and
		// the preview clear together.
		write(
			next === 'none'
				? { source: 'none', value: '', text, assetId: undefined }
				: { source: next, value, text, assetId: undefined },
		)
		if (next === 'none') setValue('')
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<View style={styles.previewWrap}>
					<Card variant="secondary" shadow="low" style={styles.previewCard}>
						<View style={styles.preview}>
							{previewUri ? (
								<Image
									source={{ uri: previewUri }}
									style={styles.previewImage}
									resizeMode="cover"
								/>
							) : (
								<View style={styles.previewEmpty}>
									<DText variant="text-xs/medium" color="text-muted">
										{isLarge ? 'LARGE' : 'SMALL'}
									</DText>
								</View>
							)}
						</View>
					</Card>
					{source !== 'none' && !previewUri ? (
						<DText
							variant="text-xs/medium"
							color="text-muted"
							style={{ marginTop: 8 }}
						>
							{!clientId
								? 'Set an Application ID to preview this image'
								: 'No image selected'}
						</DText>
					) : null}
				</View>

				<Stack>
					{mismatched ? (
						<TableRowGroup title="Warning">
							<TableRow
								label={`"${selectedAsset.name}" is a ${selectedAsset.type === 1 ? 'small' : 'large'} image`}
								variant="danger"
								subLabel={`Discord will not render a ${selectedAsset.type === 1 ? 'small' : 'large'} asset in the ${typeName} image slot, even though the preview above looks fine. Upload a new ${typeName.toLowerCase()} image, or pick a different asset.`}
								trailing={<TableRow.Arrow />}
								onPress={() =>
									navigation.navigate(
										isLarge ? LARGE_ASSET_ROUTE : SMALL_ASSET_ROUTE,
									)
								}
							/>
						</TableRowGroup>
					) : null}

					{/* TableRadioGroup is itself a TableRowGroup, so it must not be
					    wrapped in another one. It has no controlled `value` prop, so the
					    key forces it to re-seed from storage when the source changes
					    outside of this page. */}
					<TableRadioGroup
						key={`${imageKey}-${source}`}
						title={`${typeName} image`}
						defaultValue={source}
						onChange={handleSource}
					>
						<TableRadioRow value="none" label="None" />
						<TableRadioRow
							value="url"
							label="Image URL"
							subLabel="Points at any hosted image"
						/>
						<TableRadioRow
							value="key"
							label="Asset key"
							subLabel="A key from your application's assets"
						/>
					</TableRadioGroup>

					{source !== 'none' && (
						<TableRowGroup title="Details">
							{source === 'key' && clientId ? (
								<TableRow
									label="Manage assets"
									subLabel="Upload or pick one of this application's assets"
									trailing={<TableRow.Arrow />}
									onPress={() =>
										navigation.navigate(
											isLarge ? LARGE_ASSET_ROUTE : SMALL_ASSET_ROUTE,
										)
									}
								/>
							) : null}
							<TextInputRow
								label="Value"
								value={value}
								onChange={v => {
									setValue(v)
									write({ source, value: v, text, assetId: undefined })
								}}
								placeholder={source === 'url' ? 'https://…' : 'e.g. big_art'}
							/>
							<TextInputRow
								label="Hover text"
								value={text}
								onChange={v => {
									setText(v)
									write({ source, value, text: v, assetId: persisted.assetId })
								}}
								placeholder="Optional tooltip"
							/>
						</TableRowGroup>
					)}
				</Stack>
			</ScrollView>
		</Page>
	)
}
