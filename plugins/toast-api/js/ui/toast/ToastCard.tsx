import { getIconComponent, VARIANT_ICON } from '../../lib/icons'
import { resolveColor, resolveShadowStyles } from '../../lib/tokens'
import type { ToastApiSettings, ToastEntry } from '../../types'

/** The colour legacy toasts give every icon unless a payload asks for another. */
const MONOCHROME = 'MOBILE_TEXT_HEADING_PRIMARY'

type IconKind = 'component' | 'variant' | 'entity' | 'nodes' | 'asset' | 'none'
type IconSlot = 'primary' | 'second'

/**
 * Which glyph each side of the text draws.
 *
 * Legacy's precedence: `IconComponent`, then the variant's glyph, then an
 * entity, then an asset. With **Show a second icon** on, a supplied icon takes
 * the primary slot and the variant moves to the other side instead of showing
 * twice.
 */
function resolveKinds(
	entry: ToastEntry,
	settings: ToastApiSettings,
): { primary: IconKind; second: IconKind } {
	const variantName = VARIANT_ICON[entry.variant]
	const explicitPrimary =
		entry.IconComponent != null ||
		entry.iconEntity != null ||
		entry.icon != null
	const explicitSecond =
		entry.SecondIconComponent != null ||
		entry.secondIconEntity != null ||
		entry.secondIcon != null

	let primary: IconKind = 'none'
	if (entry.IconComponent != null) primary = 'component'
	else if (variantName && !(settings.showSecondIcon && explicitPrimary))
		primary = 'variant'
	else if (entry.iconEntity != null) primary = 'entity'
	else if (typeof entry.icon === 'number') primary = 'asset'
	else if (typeof entry.icon === 'function') primary = 'nodes'
	else if (variantName) primary = 'variant'

	let second: IconKind = 'none'
	if (explicitSecond) {
		if (entry.SecondIconComponent != null) second = 'component'
		else if (entry.secondIconEntity != null) second = 'entity'
		else if (typeof entry.secondIcon === 'number') second = 'asset'
		else second = 'nodes'
	} else if (
		settings.showSecondIcon &&
		variantName != null &&
		primary !== 'variant' &&
		primary !== 'none'
	) {
		second = 'variant'
	}

	return { primary, second }
}

function ToastIcon({
	entry,
	settings,
	kind,
	slot,
}: {
	entry: ToastEntry
	settings: ToastApiSettings
	kind: IconKind
	slot: IconSlot
}) {
	const { View, Image, Text: NativeText } = valenced.react.ReactNative
	const size = { width: settings.iconSize, height: settings.iconSize }
	const iconColor = resolveColor(
		(slot === 'second' ? entry.secondIconColor : entry.iconColor) ?? MONOCHROME,
	)

	if (kind === 'component') {
		const Component =
			slot === 'second' ? entry.SecondIconComponent : entry.IconComponent
		if (!Component) return null
		return <Component size="sm" color={iconColor} style={size} />
	}

	if (kind === 'variant') {
		const name = VARIANT_ICON[entry.variant]
		const Component = name ? getIconComponent(name) : undefined
		if (!Component) return null
		return <Component color={iconColor} style={size} />
	}

	if (kind === 'entity') {
		const entity = slot === 'second' ? entry.secondIconEntity : entry.iconEntity
		if (!entity) return null
		if (entity.type === 'emoji' && entity.unicode) {
			return (
				<NativeText
					style={{
						fontSize: settings.iconSize,
						lineHeight: settings.iconSize * 1.25,
					}}
				>
					{entity.unicode}
				</NativeText>
			)
		}
		if (entity.src) {
			return (
				<Image source={{ uri: entity.src }} style={size} resizeMode="contain" />
			)
		}
		return null
	}

	if (kind === 'nodes') {
		const icon = slot === 'second' ? entry.secondIcon : entry.icon
		if (typeof icon !== 'function') return null
		return <View>{icon()}</View>
	}

	if (kind === 'asset') {
		const asset = slot === 'second' ? entry.secondIcon : entry.icon
		if (typeof asset !== 'number') return null
		// Legacy only tints a packager asset when the payload asked for it; otherwise
		// the asset's own artwork is left untouched.
		const recolour = slot === 'primary' && entry.recolorLegacyIcon
		const tint = recolour ? { tintColor: iconColor } : null
		const colour = recolour ? { color: iconColor } : { disableColor: true }
		const Icon = getIconComponent('Icon')
		if (Icon) {
			return (
				<Icon
					source={asset}
					resizeMode="contain"
					style={[size, tint]}
					{...colour}
				/>
			)
		}
		return <Image source={asset} style={[size, tint]} resizeMode="contain" />
	}

	return null
}

export function ToastCard({
	entry,
	settings,
	maxWidth,
	onPress,
	fill,
}: {
	entry: ToastEntry
	settings: ToastApiSettings
	maxWidth: number
	/** When present the card becomes a button that calls this on tap. */
	onPress?: () => void
	/**
	 * Stretch to the parent instead of hugging the text. The width spring sets
	 * this so a shrinking toast animates too — otherwise the card would just fit
	 * its shortened text and nothing would move.
	 */
	fill?: boolean
}) {
	const { View, Pressable } = valenced.react.ReactNative
	const { Text } = valenced.discord.design.Design

	const containerStyle: any = {
		flexDirection: 'row',
		alignItems: 'center',
		borderRadius: settings.radius,
		paddingTop: settings.paddingY,
		paddingBottom: settings.paddingY,
		paddingLeft: settings.paddingX,
		paddingRight: settings.paddingX,
		backgroundColor: resolveColor(
			settings.backgroundColor || 'MOBILE_TOAST_BACKGROUND_DEFAULT',
		),
		borderColor: resolveColor(settings.borderColor || 'BORDER_SUBTLE'),
		borderWidth: settings.borderWidth,
		maxWidth,
	}
	if (fill) containerStyle.width = '100%'
	if (settings.shadow) {
		const shadow = resolveShadowStyles()
		if (shadow) Object.assign(containerStyle, shadow)
	}

	const textOverride = settings.textColor
		? resolveColor(settings.textColor)
		: undefined
	const titleStyle: any = {}
	if (settings.textSize > 0) titleStyle.fontSize = settings.textSize
	if (settings.fontFamily) titleStyle.fontFamily = settings.fontFamily
	if (textOverride) titleStyle.color = textOverride

	const subtitleStyle: any = {}
	if (settings.fontFamily) subtitleStyle.fontFamily = settings.fontFamily
	if (textOverride) subtitleStyle.color = textOverride

	const body =
		typeof entry.content === 'function'
			? (entry.content as (...args: any[]) => any)()
			: entry.content
	const subtitle =
		settings.showSubtitle && entry.subtitle != null
			? typeof entry.subtitle === 'function'
				? (entry.subtitle as (...args: any[]) => any)()
				: entry.subtitle
			: null

	const kinds = resolveKinds(entry, settings)
	const iconSide = entry.iconSide ?? settings.iconSide
	const first =
		kinds.primary === 'none' ? null : (
			<ToastIcon
				entry={entry}
				settings={settings}
				kind={kinds.primary}
				slot="primary"
			/>
		)
	const second =
		kinds.second === 'none' ? null : (
			<ToastIcon
				entry={entry}
				settings={settings}
				kind={kinds.second}
				slot="second"
			/>
		)
	const leading = iconSide === 'left' ? first : second
	const trailing = iconSide === 'left' ? second : first

	// Legacy leaves 8 px before the text whenever the icon sits on the left, even
	// when there is no icon — that is what keeps default toasts pixel-identical.
	const contentStyle: any = { flexShrink: 1 }
	if (leading != null || (trailing == null && iconSide === 'left')) {
		contentStyle.marginLeft = 8
	}
	if (trailing != null) contentStyle.marginRight = 8

	const content = (
		<>
			{leading}
			<View style={contentStyle}>
				<Text
					variant={settings.textVariant as any}
					color="mobile-text-heading-primary"
					lineClamp={settings.lineClamp}
					style={titleStyle}
				>
					{body}
				</Text>
				{subtitle != null && (
					<Text
						variant={settings.subtitleVariant as any}
						color="mobile-text-heading-primary"
						lineClamp={settings.lineClamp}
						style={subtitleStyle}
					>
						{subtitle}
					</Text>
				)}
			</View>
			{trailing}
		</>
	)

	if (onPress) {
		return (
			<Pressable
				onPress={onPress}
				accessibilityRole="button"
				accessibilityLabel={
					typeof entry.content === 'string' ? entry.content : undefined
				}
				style={[containerStyle, entry.containerStyle]}
			>
				{content}
			</Pressable>
		)
	}

	return (
		<View
			pointerEvents="none"
			accessibilityElementsHidden
			style={[containerStyle, entry.containerStyle]}
		>
			{content}
		</View>
	)
}
