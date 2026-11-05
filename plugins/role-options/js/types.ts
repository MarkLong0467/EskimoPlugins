/** A role, as Discord's role store keeps it. Only the fields the plugin reads are listed. */
export interface Role {
	id: string
	name: string
	guild_id?: string
	/** The role's single color as a number (0 means no color). */
	color?: number
	/** The newer color fields: a role can have a gradient of up to three colors. */
	colors?: {
		primary_color?: number
		secondary_color?: number
		tertiary_color?: number
	}
	/** The role icon's hash, or nothing if the role has none. */
	icon?: string | null
}

/**
 * Something with `props`, such as a React element. Discord's menus are lists of these, or lists of plain items, and
 * the plugin looks into them without knowing their exact type.
 */
export interface Node {
	props?: Record<string, unknown> & { children?: unknown }
	[field: string]: unknown
}

/** One item of a menu that is a list of items (`props.items`). Discord adds more fields than the label. */
export interface SheetItem {
	label?: string
	[field: string]: unknown
}

/** One thing the plugin adds to the role menu. */
export interface RoleOption {
	/** The text of the menu item. */
	label: string
	/** What happens when it is tapped. May be asynchronous. */
	run(role: Role): unknown
}

/** The role a menu was last about, kept so an option can work even when Discord's own copy action gives no id. */
export interface Seen {
	roleId: string | null
	guildId: string | null
	/** When it was noted (milliseconds). */
	at: number
}
