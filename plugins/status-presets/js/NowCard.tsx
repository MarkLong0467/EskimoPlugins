import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { View } from 'react-native'
import { readUndo, undoLastPreset } from './apply'
import { Card, Dot } from './components'
import { statusInfo, timeLabel } from './presets'
import { customLine, readNow } from './status'

/** How often the card checks your status again (milliseconds). */
const REFRESH_MS = 2000

/** Texts as constants because React Native text must be passed as an expression. */
const RIGHT_NOW = 'RIGHT NOW'
const NO_CUSTOM = 'No custom status'

/**
 * The card at the top of the settings: your status right now (the status, when it ends, and the custom status), kept up
 * to date every couple of seconds, with buttons to save it as a preset and to undo the last preset.
 */
export default function NowCard({
	onSaveCurrent,
}: {
	onSaveCurrent: () => void
}) {
	const [, setTick] = useState(0)
	useEffect(() => {
		const timer = setInterval(() => setTick(n => n + 1), REFRESH_MS)
		return () => clearInterval(timer)
	}, [])

	const now = readNow()
	const undo = readUndo()
	const info = statusInfo(now.status)
	const ends = `Ends ${timeLabel(now.expires)}`
	const custom = now.custom
		? `“${customLine(now.custom)}”${now.custom.expiresAtMs !== '0' ? ` · until ${timeLabel(now.custom.expiresAtMs)}` : ''}`
		: NO_CUSTOM

	return (
		<Card>
			<Design.Text variant="text-xs/bold" color="text-muted">
				{RIGHT_NOW}
			</Design.Text>
			<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
				<Dot color={info.color} />
				<Design.Text variant="heading-lg/bold">{info.l}</Design.Text>
			</View>
			{now.expires !== '0' && (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{ends}
				</Design.Text>
			)}
			<Design.Text variant="text-md/medium">{custom}</Design.Text>
			<View style={{ flexDirection: 'row', gap: 10 }}>
				<View style={{ flex: 1 }}>
					<Design.Button
						text="Save as preset"
						variant="secondary"
						size="sm"
						onPress={onSaveCurrent}
					/>
				</View>
				<View style={{ flex: 1 }}>
					<Design.Button
						text={
							undo
								? `Undo “${String(undo.name).slice(0, 14)}”`
								: 'Nothing to undo'
						}
						variant="secondary"
						size="sm"
						disabled={!undo}
						onPress={undoLastPreset}
					/>
				</View>
			</View>
		</Card>
	)
}
