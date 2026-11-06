import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, Linking, Pressable, Text, View } from 'react-native'
import ActionSheetBody from './ActionSheetBody'
import { setting } from './config'
import {
	formatCamera,
	formatCoordinates,
	formatDate,
	formatDimensions,
	formatLens,
	formatSettings,
	formatSize,
	googleMapsUrl,
	mapTile,
} from './format'
import { loadPicture } from './picture'
import type { PictureInfo } from './picture'
import type { PictureFile, ViewerSource } from './types'

const TITLE_DETAILS = 'Details'
const TITLE_CAMERA = 'Camera'
const TITLE_LOCATION = 'Location'
const LOADING = 'Reading the picture...'
const NO_METADATA = 'This picture has no metadata.'
const MAP_HINT = 'Tap to open in Google Maps'
const MAP_SIZE = 256

/** Opens a place in Google Maps. */
export function openMaps(latitude: number, longitude: number): void {
	Linking.openURL(googleMapsUrl(latitude, longitude)).catch(() => {})
}

/** A row that shows a value, left out when there is none. */
function Row({ label, value }: { label: string; value?: string }) {
	if (!value) return null
	return <Design.TableRow label={label} subLabel={value} />
}

/** The map: one OpenStreetMap picture with a pin on the place. Tapping it opens Google Maps. */
function MapPreview({
	latitude,
	longitude,
}: {
	latitude: number
	longitude: number
}) {
	const tile = mapTile(latitude, longitude)
	return (
		<Pressable onPress={() => openMaps(latitude, longitude)}>
			<View
				style={{
					width: '100%',
					height: 180,
					overflow: 'hidden',
					borderRadius: 12,
					alignItems: 'center',
					justifyContent: 'center',
				}}
			>
				<View style={{ width: MAP_SIZE, height: MAP_SIZE }}>
					<Image
						source={{
							uri: tile.url,
							headers: { 'User-Agent': 'RawViewer (Valenced plugin)' },
						}}
						style={{ width: MAP_SIZE, height: MAP_SIZE }}
					/>
					<View
						style={{
							position: 'absolute',
							left: tile.x * MAP_SIZE - 7,
							top: tile.y * MAP_SIZE - 7,
							width: 14,
							height: 14,
							borderRadius: 7,
							backgroundColor: '#e53935',
							borderWidth: 2,
							borderColor: '#ffffff',
						}}
					/>
				</View>
			</View>
		</Pressable>
	)
}

/** What the sheet shows for a picture that was read. */
export function InfoRows({
	info,
	width,
	height,
	map,
}: {
	info: PictureInfo
	width?: number
	height?: number
	map: boolean
}) {
	const meta = info.metadata
	const when = meta
		? formatDate(meta.dateOriginal ?? meta.date, meta.offsetOriginal)
		: ''
	const place =
		meta?.latitude != null && meta.longitude != null
			? { latitude: meta.latitude, longitude: meta.longitude }
			: null
	const dimensions = formatDimensions(
		meta?.width ?? width,
		meta?.height ?? height,
	)

	return (
		<>
			{when ? (
				<Design.TableRowGroup>
					<Row label="Taken" value={when} />
				</Design.TableRowGroup>
			) : null}
			{place ? (
				<Design.TableRowGroup title={TITLE_LOCATION}>
					{map ? (
						<MapPreview latitude={place.latitude} longitude={place.longitude} />
					) : null}
					<Design.TableRow
						label={formatCoordinates(place.latitude, place.longitude)}
						subLabel={map ? MAP_HINT : 'Open in Google Maps'}
						onPress={() => openMaps(place.latitude, place.longitude)}
					/>
					{meta?.altitude != null ? (
						<Row label="Altitude" value={`${Math.round(meta.altitude)} m`} />
					) : null}
				</Design.TableRowGroup>
			) : null}
			<Design.TableRowGroup title={TITLE_DETAILS}>
				<Row label="File" value={info.file.filename} />
				<Row label="Size" value={formatSize(info.size)} />
				<Row label="Dimensions" value={dimensions} />
			</Design.TableRowGroup>
			{meta ? (
				<Design.TableRowGroup title={TITLE_CAMERA}>
					<Row label="Camera" value={formatCamera(meta)} />
					<Row label="Lens" value={formatLens(meta)} />
					<Row label="Settings" value={formatSettings(meta)} />
					<Row
						label="Flash"
						value={
							meta.flash == null ? '' : meta.flash ? 'Fired' : 'Did not fire'
						}
					/>
					<Row label="Software" value={meta.software} />
					<Row label="Artist" value={meta.artist} />
					<Row label="Copyright" value={meta.copyright} />
				</Design.TableRowGroup>
			) : (
				<Design.TableRow label={NO_METADATA} />
			)}
		</>
	)
}

/** The sheet with everything the picture's metadata says. It reads the picture when it opens. */
export default function MetadataSheet({
	source,
	file,
}: {
	source: ViewerSource
	file: PictureFile
}) {
	const [info, setInfo] = useState<PictureInfo | null>(null)
	const [error, setError] = useState('')

	useEffect(() => {
		let alive = true
		loadPicture(file).then(
			result => alive && setInfo(result),
			reason => alive && setError(String(reason?.message ?? reason)),
		)
		return () => {
			alive = false
		}
	}, [file.url])

	return (
		<ActionSheetBody>
			{info ? (
				<InfoRows
					info={info}
					width={source.width ?? undefined}
					height={source.height ?? undefined}
					map={setting('mapPreview')}
				/>
			) : (
				<Text style={{ color: '#999999', padding: 8 }}>
					{error ? `Could not read the picture: ${error}` : LOADING}
				</Text>
			)}
		</ActionSheetBody>
	)
}
