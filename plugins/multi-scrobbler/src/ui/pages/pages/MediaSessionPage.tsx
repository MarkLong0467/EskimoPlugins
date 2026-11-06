/// <reference types="@valenced/types/hidden" />

import { useEffect, useState } from 'react'
import { kmmiioLib } from '../../../lib/modules'

interface MediaInfo {
	packageName: string
	appName: string
	title: string | null
	artist: string | null
	album: string | null
	duration: number
	position: number
	stateLabel: string
}

const COMPANION_MANIFEST_URL =
	'https://rn.kmmiio99o.dev/dev.kmmiio99o.mediasession.json'

async function fetchLatestCompanionVersion(): Promise<number | null> {
	try {
		const controller = new AbortController()
		const timeout = setTimeout(() => controller.abort(), 5000)
		const res = await fetch(COMPANION_MANIFEST_URL, {
			signal: controller.signal,
		})
		clearTimeout(timeout)
		if (!res.ok) return null
		const manifest = await res.json()
		return typeof manifest?.versionCode === 'number'
			? manifest.versionCode
			: null
	} catch {
		return null
	}
}

export default function MediaSessionPage() {
	const { Page } = valenced.components as typeof import('@valenced/components')
	const { ScrollView } = valenced.react.ReactNative
	const { Stack, TableRowGroup, TableRow, Text } =
		valenced.discord.design.Design

	const [media, setMedia] = useState<MediaInfo | null>(null)
	const [companionInstalled, setCompanionInstalled] = useState<boolean | null>(
		null,
	)
	const [companionEnabled, setCompanionEnabled] = useState<boolean | null>(null)
	const [listenerOk, setListenerOk] = useState<boolean | null>(null)
	const [companionUpdate, setCompanionUpdate] = useState<number | null>(null)

	useEffect(() => {
		let alive = true
		const kmmiio = kmmiioLib()

		const refresh = async () => {
			if (!kmmiio?.getCurrentMediaInfo) return
			try {
				const info = await kmmiio.getCurrentMediaInfo()
				if (alive) setMedia(info)
			} catch {}
		}

		const checkCompanion = async () => {
			if (!kmmiio?.isCompanionInstalled) return
			try {
				const installed = await kmmiio.isCompanionInstalled()
				if (alive) setCompanionInstalled(installed)
				if (installed && kmmiio.isCompanionListenerEnabled) {
					const enabled = await kmmiio.isCompanionListenerEnabled()
					if (alive) setCompanionEnabled(enabled)
				}
			} catch {}
		}

		const checkPerm = async () => {
			if (!kmmiio?.isNotificationListenerEnabled) return
			try {
				const ok = await kmmiio.isNotificationListenerEnabled()
				if (alive) setListenerOk(ok)
			} catch {}
		}

		const checkUpdate = async () => {
			if (!kmmiio?.isCompanionInstalled || !kmmiio?.getCompanionVersion) return
			try {
				const installed = await kmmiio.isCompanionInstalled()
				if (!installed) return
				const [remote, local] = await Promise.all([
					fetchLatestCompanionVersion(),
					kmmiio.getCompanionVersion() as Promise<number>,
				])
				if (alive && remote !== null && local > 0 && remote > local)
					setCompanionUpdate(remote)
			} catch {}
		}

		refresh()
		checkCompanion()
		checkPerm()
		checkUpdate()

		const tick = setInterval(refresh, 5000)
		const updateTick = setInterval(checkUpdate, 15 * 60 * 1000)

		return () => {
			alive = false
			clearInterval(tick)
			clearInterval(updateTick)
		}
	}, [])

	const openNotifSettings = async () => {
		const kmmiio = kmmiioLib()
		await kmmiio?.openNotificationListenerSettings?.()
	}

	const installCompanion = async () => {
		const kmmiio = kmmiioLib()
		await kmmiio?.installCompanion?.()
	}

	// If the companion is installed and media data is flowing through its
	// provider, the bridge works — even if the listener check is unavailable
	// in this build or returns false for formatting reasons.
	const bridgeActive =
		companionInstalled === true && (companionEnabled === true || media !== null)

	const getStatusText = () => {
		if (bridgeActive) return 'MediaSession Bridge active'
		if (companionInstalled && companionEnabled === false)
			return 'Companion installed but listener not enabled'
		if (listenerOk) return 'Using system notification listener'
		return 'No notification listener available'
	}

	const getStatusColor = () => {
		if (bridgeActive) return 'text-feedback-positive'
		if (listenerOk) return 'text-feedback-warning'
		return 'text-feedback-critical'
	}

	return (
		<Page>
			<ScrollView contentContainerStyle={{ padding: 0 }}>
				<Stack>
					<TableRowGroup title="MediaSession Bridge">
						<TableRow
							label="Status"
							subLabel={getStatusText()}
							trailing={
								<Text variant="text-sm/medium" color={getStatusColor()}>
									{bridgeActive ? 'Active' : 'Inactive'}
								</Text>
							}
						/>
						{!companionInstalled && (
							<TableRow
								label="Install Companion App"
								subLabel="Recommended: MediaSession Bridge companion"
								trailing={<TableRow.Arrow />}
								onPress={installCompanion}
							/>
						)}
						{companionUpdate !== null && (
							<TableRow
								label="Companion update available"
								subLabel={`Tap to download version code ${companionUpdate}`}
								trailing={<TableRow.Arrow />}
								onPress={installCompanion}
							/>
						)}
						{companionInstalled && companionEnabled === false && (
							<TableRow
								label="Open Companion App"
								subLabel="Enable the notification listener"
								trailing={<TableRow.Arrow />}
								onPress={openNotifSettings}
							/>
						)}
						{!companionInstalled && !listenerOk && (
							<TableRow
								label="Alternative: System Listener"
								subLabel="Enable any notification listener in settings"
								trailing={<TableRow.Arrow />}
								onPress={openNotifSettings}
							/>
						)}
					</TableRowGroup>
				</Stack>
			</ScrollView>
		</Page>
	)
}
