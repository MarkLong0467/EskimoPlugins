export interface ChatBubblesStorage {
	avatarRadius: number
	bubbleChatRadius: number
	/** When `false`, the plugin uses its own (theme-following) bubble color. */
	customBubbleColor: boolean
	/** `0xAARRGGBB` chosen via Discord's native color picker; `null` until one is picked. */
	bubbleColor: number | null
}
