import type { ToastApiSettings } from './types'

export const DEFAULTS: ToastApiSettings = {
	position: 'top',
	maxVisible: 3,

	durationMode: 'toast',
	defaultDurationMs: 2000,
	overrideDurationMs: 3000,
	minDurationMs: 0,
	maxDurationMs: 0,

	// Discord's legacy toast uses radii.xxl (32). 8 is radii.sm.
	radius: 8,
	paddingY: 8,
	paddingX: 12,
	gap: 8,
	borderWidth: 1,
	shadow: true,
	// 0 follows the legacy container: screen width minus 32.
	maxWidth: 0,
	iconSize: 24,
	iconSide: 'left',
	showSecondIcon: false,
	lineClamp: 3,

	textVariant: 'text-sm/semibold',
	textSize: 0,
	textColor: '',
	fontFamily: '',
	backgroundColor: '',
	borderColor: '',

	showSubtitle: true,
	subtitleVariant: 'text-sm/normal',

	overrideDiscordToasts: false,
}
