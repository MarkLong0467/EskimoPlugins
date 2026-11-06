import { getTheme, kmmiioLib, resolveColor } from './modules'

export const SEMANTIC = {
	accessoryBackground: 'MOBILE_FLOATING_ACCESSORY_BACKGROUND',
	accessoryBorder: 'MOBILE_FLOATING_ACCESSORY_BORDER',
	text: 'TEXT_DEFAULT',
	textMuted: 'TEXT_NORMAL',
} as const

export const color = {
	get ACCESSORY_BACKGROUND() {
		return resolveColor(SEMANTIC.accessoryBackground)
	},
	get ACCESSORY_BORDER() {
		return resolveColor(SEMANTIC.accessoryBorder)
	},
	get TEXT_DEFAULT() {
		return resolveColor(SEMANTIC.text)
	},
	get TEXT_MUTED() {
		return resolveColor(SEMANTIC.textMuted)
	},
}

export const theme = {
	get current(): string {
		return getTheme()
	},
	get isLight(): boolean {
		return getTheme() === 'light' || getTheme() === 'ash'
	},
}

function resolveNumber(tokenName: string): number | undefined {
	// Numeric tokens are plain constants on the library's token module handle,
	// so we read them from there instead of re-deriving the module lookup.
	const value = kmmiioLib()?.getTokens?.()?.modules?.mobile?.[tokenName]
	return typeof value === 'number' ? value : undefined
}

export const num = {
	get CHAT_INPUT_CONTEXT_BAR_PADDING_HORIZONTAL() {
		return resolveNumber('CHAT_INPUT_CONTEXT_BAR_PADDING_HORIZONTAL') ?? 12
	},
	get CHAT_INPUT_CONTEXT_BAR_PADDING_VERTICAL() {
		return resolveNumber('CHAT_INPUT_CONTEXT_BAR_PADDING_VERTICAL') ?? 8
	},
	get CHAT_INPUT_ACTION_BUTTON_SIZE() {
		return resolveNumber('CHAT_INPUT_ACTION_BUTTON_SIZE') ?? 32
	},
	get CHAT_INPUT_ACTION_BUTTON_MARGIN() {
		return resolveNumber('CHAT_INPUT_ACTION_BUTTON_MARGIN') ?? 0
	},
	get CHAT_INPUT_HORIZONTAL_PADDING() {
		return resolveNumber('CHAT_INPUT_HORIZONTAL_PADDING') ?? 16
	},
	get CHAT_INPUT_PILL_PADDING() {
		return resolveNumber('CHAT_INPUT_PILL_PADDING') ?? 2
	},
	get CHAT_INPUT_REPLY_MENTION_ICON_SIZE() {
		return resolveNumber('CHAT_INPUT_REPLY_MENTION_ICON_SIZE') ?? 20
	},
}
