import type { ComponentType, ReactNode } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'

export type ToastPosition = 'top' | 'bottom'
export type ToastIconSide = 'left' | 'right'
export type ToastVariant =
	| 'default'
	| 'success'
	| 'critical'
	| 'warning'
	| 'info'
export type ToastDurationMode = 'toast' | 'default' | 'override'

export type ToastTextVariant = string

export interface ToastIconEntity {
	type: string
	unicode?: string
	src?: string
	alt?: string
}

export interface ToastInput {
	/**
	 * Optional dedupe token: a toast whose key is already on screen is dropped
	 * and `show()` returns the id of the one already showing. The key is not the
	 * handle — `update()` and `close()` take the id.
	 */
	key?: string
	content: ReactNode
	subtitle?: ReactNode
	/** Packager asset id, or a function returning arbitrary nodes. */
	icon?: number | (() => ReactNode)
	/** Mana-style `{ type: 'emoji' | 'image', ... }` icon. */
	iconEntity?: ToastIconEntity
	IconComponent?: ComponentType<any>
	/** Semantic token name or `#hex`. Resolved before it reaches the icon. */
	iconColor?: string
	recolorLegacyIcon?: boolean
	/** A second icon, drawn on the side opposite the first one. */
	secondIcon?: number | (() => ReactNode)
	secondIconEntity?: ToastIconEntity
	SecondIconComponent?: ComponentType<any>
	secondIconColor?: string
	/** Overrides the **Side** setting in the Icon sheet for this toast alone. */
	iconSide?: ToastIconSide
	variant?: ToastVariant
	containerStyle?: StyleProp<ViewStyle>
	duration?: number
	position?: ToastPosition
	onDismiss?: () => void
	/**
	 * Makes the toast a button. Runs on tap with the toast's id, so the handler
	 * can `update()` or `close()` it. Without it the toast ignores taps.
	 */
	onPress?: (id: string) => void
	/**
	 * Close the toast once `onPress` has run. Defaults to `true`; pass `false` to
	 * leave it on screen after the tap.
	 */
	closeOnPress?: boolean
}

export interface ToastEntry extends ToastInput {
	id: string
	key: string
	content: ReactNode
	variant: ToastVariant
	durationMs: number
	position: ToastPosition
	createdAt: number
}

export interface ToastApiSettings {
	position: ToastPosition
	/** How many toasts may be on screen at once. Oldest is dropped past this. `0` is unlimited. */
	maxVisible: number

	durationMode: ToastDurationMode
	defaultDurationMs: number
	overrideDurationMs: number
	minDurationMs: number
	maxDurationMs: number

	radius: number
	paddingY: number
	paddingX: number
	gap: number
	borderWidth: number
	shadow: boolean
	maxWidth: number
	iconSize: number
	/** Which side of the text the toast's icon sits on. */
	iconSide: ToastIconSide
	/**
	 * Draw a second icon opposite the first. When a toast only supplies one icon
	 * of its own, the variant's glyph (success check, warning triangle, …) fills
	 * the other side. An explicit `secondIcon` on the input always shows.
	 */
	showSecondIcon: boolean
	lineClamp: number

	textVariant: ToastTextVariant
	/** `0` keeps the variant's own size. */
	textSize: number
	/** Semantic token name or `#hex`. Empty keeps `mobile-text-heading-primary`. */
	textColor: string
	fontFamily: string
	/** `#hex`. Empty keeps `MOBILE_TOAST_BACKGROUND_DEFAULT`. */
	backgroundColor: string
	/** `#hex`. Empty keeps `BORDER_SUBTLE`. */
	borderColor: string

	showSubtitle: boolean
	subtitleVariant: ToastTextVariant

	/**
	 * Draw the toasts Discord asks for — its own, and every other plugin's —
	 * through this layer instead of letting them render themselves.
	 */
	overrideDiscordToasts: boolean
}
