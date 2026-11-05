import type { DiscordMessage } from './types'

/**
 * Yields every string in a message that Discord draws as markdown, which is where mentions can be:
 * the message text, and each embed's title, description, author name, footer text and fields.
 * The `raw` variants Discord keeps next to the parsed ones are included, because either can hold the mention.
 *
 * Values that are missing or not strings are skipped.
 */
export function* texts(message: DiscordMessage): Generator<string> {
	if (typeof message.content === 'string') yield message.content

	for (const embed of message.embeds ?? []) {
		for (const value of [
			embed?.title,
			embed?.description,
			embed?.author?.name,
			embed?.footer?.text,
			embed?.rawTitle,
			embed?.rawDescription,
		]) {
			if (typeof value === 'string') yield value
		}

		for (const field of embed?.fields ?? []) {
			if (typeof field?.name === 'string') yield field.name
			if (typeof field?.value === 'string') yield field.value
			if (typeof field?.rawName === 'string') yield field.rawName
			if (typeof field?.rawValue === 'string') yield field.rawValue
		}
	}
}
