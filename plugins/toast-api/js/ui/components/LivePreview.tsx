import { toasts } from '../../api/api'
import { VARIANT_ICON } from '../../lib/icons'
import { useSettings } from '../hooks'
import { ToastCard } from '../toast/ToastCard'
import type { ReactNode } from 'react'
import type { ToastVariant } from '../../types'

export const SAMPLE_CONTENT = 'Saved to your library'
export const SAMPLE_SUBTITLE = 'Synced across your devices'

/**
 * A toast rendered with the current settings, so a change shows up before a real
 * toast fires. The entry comes from `toasts.preview()` — the same normalisation
 * `show()` runs — so the sheet renders what a dependent would get.
 */
export function LivePreview({
	content = SAMPLE_CONTENT,
	subtitle,
	variant = 'default',
}: {
	content?: ReactNode
	subtitle?: ReactNode
	variant?: ToastVariant
}) {
	const settings = useSettings()
	const { View, Dimensions } = valenced.react.ReactNative
	const { Card } = valenced.discord.design.Design

	const screen = Dimensions.get('window')
	const maxWidth =
		settings.maxWidth > 0 ? settings.maxWidth : Math.max(0, screen.width - 64)

	// A second icon only shows when the variant has a glyph to put there, so the
	// preview supplies one only in that case.
	const twoIcons = settings.showSecondIcon && VARIANT_ICON[variant] != null

	const entry = toasts.preview({
		content,
		subtitle,
		variant,
		...(twoIcons ? { iconEntity: { type: 'emoji', unicode: '✨' } } : {}),
	})

	return (
		<Card style={{ padding: 16 }}>
			<View style={{ alignItems: 'center' }}>
				<ToastCard entry={entry} settings={settings} maxWidth={maxWidth} />
			</View>
		</Card>
	)
}
