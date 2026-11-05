/** One HypeSquad house. */
export interface House {
	/** What Discord's API calls the house: 1, 2 or 3. */
	id: number
	name: string
	/** The bit in a user's flags that marks this house. */
	flag: number
}

/** The part of Discord's `UserStore` this plugin uses. */
export interface UserStore {
	getCurrentUser?():
		| { publicFlags?: number | null; flags?: number | null }
		| undefined
	addChangeListener?(listener: () => void): void
	removeChangeListener?(listener: () => void): void
}

/** Options for one call through Discord's own connection. */
export interface HttpRequest {
	url: string
	body?: object
}

/** Discord's own server connection (the module with `get`, `post` and `del`). */
export interface DiscordHttp {
	post?(request: HttpRequest): Promise<unknown>
	del?(request: HttpRequest): Promise<unknown>
	delete?(request: HttpRequest): Promise<unknown>
}

/**
 * What a failed request can look like. The plugin throws these plain objects itself and Discord's connection throws
 * its own errors with the same fields, so every field is optional.
 */
export interface RequestError {
	/** The request took longer than `TIMEOUT_MS`. */
	timedOut?: boolean
	/** The HTTP status Discord answered with. */
	status?: number
	/** Discord's answer: a parsed object, or JSON text. */
	body?: unknown
	response?: { status?: number }
	message?: string
}
