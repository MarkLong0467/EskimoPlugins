import { kmmiio } from '../lib/kmmiio'
import {
	getCircleInformationIcon,
	getOpenUserSettings,
	getSessionsSection,
} from '../lib/modules'

const { createElement } = valenced.react.React
const RN = valenced.react.ReactNative

export function safeToken(fn: () => string | undefined): string | undefined {
	try {
		const value = fn()
		if (typeof value === 'string' && value.length > 0) return value
	} catch {}
	return undefined
}

export function openDevicesSettings(): void {
	try {
		getOpenUserSettings()?.openUserSettings?.(getSessionsSection())
	} catch {
		// ignore
	}
}

export function buildNewMark(): any {
	const bg = safeToken(() => kmmiio()?.rawColor?.('RED_400'))
	const fg = safeToken(() => kmmiio()?.rawColor?.('WHITE'))
	return createElement(
		RN.View,
		{
			style: {
				backgroundColor: bg,
				borderRadius: 4,
				paddingHorizontal: 6,
				paddingVertical: 2,
				alignSelf: 'flex-start',
			},
		},
		createElement(
			RN.Text,
			{
				style: {
					color: fg,
					fontSize: 10,
					fontWeight: '700',
					letterSpacing: 0.4,
				},
			},
			'New',
		),
	)
}

export function buildCountBadge(text: string): any {
	const bg = safeToken(() => kmmiio()?.rawColor?.('RED_400'))
	const fg = safeToken(() => kmmiio()?.rawColor?.('WHITE'))
	return createElement(
		RN.View,
		{
			pointerEvents: 'none',
			style: {
				backgroundColor: bg,
				borderRadius: 10,
				minWidth: 20,
				height: 20,
				paddingHorizontal: 6,
				alignItems: 'center',
				justifyContent: 'center',
			},
		},
		createElement(
			RN.Text,
			{ style: { color: fg, fontSize: 11, fontWeight: '700', lineHeight: 18 } },
			text,
		),
	)
}

/** Resolves a themed token name (semantic first, raw palette second). */
function resolveColorToken(name: string): string | undefined {
	try {
		const lib = kmmiio()
		const resolved = lib?.resolveColor?.(name) ?? lib?.rawColor?.(name)
		if (typeof resolved === 'string' && resolved.startsWith('#')) {
			return resolved
		}
	} catch {
		// ignore
	}
	return undefined
}

/** The info callout box: icon + title on top, body below, feedback-tinted. */
export function buildSecurityCallout(): any {
	const Design = (valenced as any)?.discord?.design?.Design
	const Text = Design?.Text
	const Icon = getCircleInformationIcon()
	if (!Text || !Icon) return null

	const style: any = {
		padding: 16,
		borderWidth: 1,
		borderRadius: 12,
		rowGap: 8,
	}
	const backgroundColor = resolveColorToken('BACKGROUND_FEEDBACK_INFO')
	if (backgroundColor != null) style.backgroundColor = backgroundColor
	const borderColor = resolveColorToken('BORDER_FEEDBACK_INFO')
	if (borderColor != null) style.borderColor = borderColor
	const iconColor = resolveColorToken('TEXT_FEEDBACK_INFO')

	const titleRow = createElement(
		RN.View,
		{ style: { flexDirection: 'row', alignItems: 'center', gap: 8 } },
		createElement(Icon, {
			color: iconColor,
			style: { width: 18, height: 18 },
		}),
		createElement(
			Text,
			{ variant: 'text-md/semibold', color: 'text-feedback-info' },
			'Check for unrecognised devices',
		),
	)

	return createElement(
		RN.View,
		{ style },
		titleRow,
		createElement(
			Text,
			{ variant: 'text-sm/medium', color: 'text-feedback-info' },
			"If you see an entry you don't recognise, log out of that device and change your Discord account password immediately",
		),
	)
}

/** A small hint explaining the long-press multi-select. */
export function buildLongPressHint(): any {
	const Text = (valenced as any)?.discord?.design?.Design?.Text
	if (!Text) return null
	return createElement(
		Text,
		{ variant: 'text-sm/medium', color: 'text-subtle' },
		'Long-press a device to select multiple and log them out at once.',
	)
}

/** Callout + hint stacked in one list element. */
export function buildDevicesNotice(): any {
	const callout = buildSecurityCallout()
	const hint = buildLongPressHint()
	return createElement(RN.View, { style: { gap: 8 } }, callout, hint)
}
