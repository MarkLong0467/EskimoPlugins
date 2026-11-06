import { dbgError } from './log'
import { onImportedPath } from './modules'
import { getEditTrail, getSettings, isDeleted, isHidden } from './state'

function textNode(text: string): any[] {
	return [{ type: 'text', content: text }]
}

function subtextNode(text: string): any {
	return { type: 'subtext', content: [{ type: 'text', content: text }] }
}

// Unspoiler text: spoilers are `{ type: "spoiler", content: [...] }` nodes;
// flatten their content array in place.
function unspoilNodes(nodes: any[] | undefined): any[] {
	if (!Array.isArray(nodes)) return nodes as any
	const out: any[] = []
	for (const node of nodes) {
		if (node && typeof node === 'object' && node.type === 'spoiler') {
			const inner = unspoilNodes(node.content)
			if (Array.isArray(inner)) {
				for (const child of inner) out.push(child)
			} else if (inner != null) {
				out.push(inner)
			}
		} else {
			out.push(node)
		}
	}
	return out
}

// Old versions of an edited message, rendered as muted `subtext` lines above
// the current content. Native subtext nodes already append a trailing newline,
// so one node per version, no extra `br`.
function editTrailNodes(versions: string[]): any[] {
	return versions.map(subtextNode)
}

function preciseTimestamp(ts: string | number | Date): string {
	try {
		const d = new Date(ts)
		if (Number.isNaN(d.getTime())) return ''
		const pad = (n: number) => String(n).padStart(2, '0')
		return (
			`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
			`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
		)
	} catch {
		return ''
	}
}

function applyTweaks(ret: any, message: any) {
	if (!ret || typeof ret !== 'object') return
	const s = getSettings()
	const channelId: string = message?.channel_id ?? ''
	const messageId: string = message?.id ?? ''

	try {
		if (s.showHideButton && isHidden(channelId, messageId)) {
			ret.content = textNode('')
			return
		}
	} catch (e) {
		dbgError('render', 'hidden tweak failed', e)
	}

	try {
		// Unspoil media/embeds: shouldObscureSpoiler=false is handled before
		// original(); flatten the inline-text spoiler AST here.
		if (s.unspoilAll && ret.content) {
			if (Array.isArray(ret.content)) {
				ret.content = unspoilNodes(ret.content)
			} else if (typeof ret.content === 'string') {
				// strip || wrappers from plain-text content as a fallback
				ret.content = ret.content.replace(/\|\|([\s\S]+?)\|\|/g, '$1')
			}
		}
	} catch (e) {
		dbgError('render', 'unspoiler tweak failed', e)
	}

	try {
		if (s.showEditTrail) {
			const trail = getEditTrail(channelId, messageId)
			if (trail != null && trail.versions.length > 0) {
				const cur = ret.content
				const currentNodes = Array.isArray(cur)
					? cur
					: typeof cur === 'string'
						? textNode(cur)
						: []
				ret.content = [...editTrailNodes(trail.versions), ...currentNodes]
			}
		}
	} catch (e) {
		dbgError('render', 'edit trail tweak failed', e)
	}

	try {
		// Deleted rows are kept in chat: highlight them (patcher on
		// hasEphemeralAppearance) and swap the "edited" label for "message deleted".
		if (s.keepDeleted && isDeleted(channelId, messageId)) {
			ret.edited = 'message deleted'
		}
	} catch (e) {
		dbgError('render', 'deleted marker tweak failed', e)
	}

	try {
		// ret.username is only set on group-first rows; writing it on grouped rows
		// splits same-author runs into separate "groups" (no avatar, since
		// avatars are gated by isFirst).
		if (
			s.showUsername &&
			typeof ret.username === 'string' &&
			message?.author?.username
		) {
			const nick =
				ret.username === message.author.username
					? ret.username
					: `${ret.username} (@${message.author.username})`
			ret.username = nick
		}
	} catch (e) {
		dbgError('render', 'username tweak failed', e)
	}

	try {
		// Same guard: only rewrite timestamps Discord already shows (group-first
		// messages), don't fabricate headers for grouped rows.
		if (s.preciseTimestamp && typeof ret.timestamp === 'string') {
			const formatted = preciseTimestamp(message?.timestamp)
			if (formatted) {
				ret.timestamp = formatted
				ret.timestampTooltip = formatted
			}
		}
	} catch (e) {
		dbgError('render', 'timestamp tweak failed', e)
	}
}

export function patchMessageRenderer(): () => void {
	const unpatch: Array<() => void> = []

	const unsub = onImportedPath(
		'modules/messages/native/renderer/createMessageContent.tsx',
		(ns: any) => {
			if (!ns) return
			unpatch.push(
				valenced.patcher.instead(
					ns,
					'default',
					(args: any[], original: any) => {
						try {
							// Null out the row's obscurity flag before content is built; the message
							// object's options are what shouldObscureSpoiler reads, so this reveals
							// every spoiler at once.
							if (getSettings().unspoilAll) {
								const msgOpt = args?.[0]?.message?.options
								if (msgOpt) {
									msgOpt.shouldObscureSpoiler = false
								}
							}
						} catch {}
						const ret = original(...args)
						try {
							const message = args?.[0]?.message ?? args?.[0]
							applyTweaks(ret, message)
						} catch (e) {
							dbgError('render', 'applyTweaks error', e)
						}
						return ret
					},
				),
			)
		},
	)
	unpatch.push(unsub)

	return () => {
		for (const un of unpatch) un?.()
	}
}

// Hidden messages get the native "ephemeral" row look (tinted background +
// gutter color) by patching hasEphemeralAppearance on MessageRecordUtils.
export function patchEphemeralAppearance(): () => void {
	const unpatch: Array<() => void> = []

	const unsub = onImportedPath(
		'modules/messages/MessageRecordUtils.tsx',
		(ns: any) => {
			let owner: any = ns
			let fn = ns?.hasEphemeralAppearance
			if (!fn && ns?.default?.hasEphemeralAppearance) {
				owner = ns.default
				fn = ns.default.hasEphemeralAppearance
			}
			if (!fn) {
				return
			}
			unpatch.push(
				valenced.patcher.instead(
					owner,
					'hasEphemeralAppearance',
					(args: any[], original: any) => {
						try {
							const msg = args?.[0]
							const channelId = msg?.channel_id ?? msg?.channelId ?? ''
							const messageId = msg?.id ?? ''
							// Hidden rows use Discord's native ephemeral look (gray tint); deleted rows
							// keep their own red tint via createBackgroundHighlight. Only hidden
							// rows are forced into ephemeral appearance.
							if (
								getSettings().showHideButton &&
								isHidden(channelId, messageId)
							) {
								return true
							}
						} catch {}
						return original(...args)
					},
				),
			)
		},
	)
	unpatch.push(unsub)

	return () => {
		for (const un of unpatch) un?.()
	}
}

// Deleted rows get red tint + red gutter instead of the native gray ephemeral
// look. createBackgroundHighlight can't tell callers apart, so short-circuit it
// for deleted messages with the same { backgroundColor, gutterColor } shape
// Discord's own branches use. Native cells only accept int32 ARGB colors
// (e.g. editedColor: -6908002, highlightColor: 693659122); hex strings are
// silently ignored, so RED_400 (#f23f43) is hardcoded as AARRGGBB ints:
// background ~16% alpha = 0x29F23F43, solid gutters = 0xFFF23F43 (signed).
const DELETED_BG = 703741763
const DELETED_GUTTER = -901309

export function patchDeletedBackground(): () => void {
	const unpatch: Array<() => void> = []

	const unsub = onImportedPath(
		'modules/messages/native/renderer/RowGeneratorUtils.tsx',
		(ns: any) => {
			let owner: any = ns
			let fn = ns?.createBackgroundHighlight
			if (!fn && ns?.default?.createBackgroundHighlight) {
				owner = ns.default
				fn = ns.default.createBackgroundHighlight
			}
			if (!fn) {
				return
			}
			unpatch.push(
				valenced.patcher.instead(
					owner,
					'createBackgroundHighlight',
					(args: any[], original: any) => {
						try {
							// The arg object carries the row context; unwrap it the
							// same way Discord does (message = message.message).
							const row = args?.[0]
							const msg = row?.message ?? row
							const channelId = msg?.channel_id ?? msg?.channelId ?? ''
							const messageId = msg?.id ?? ''
							if (!getSettings().keepDeleted) {
								return original(...args)
							}
							if (isDeleted(channelId, messageId)) {
								return {
									backgroundColor: DELETED_BG,
									gutterColor: DELETED_GUTTER,
									firstChildGutterColor: DELETED_GUTTER,
								}
							}
						} catch {}
						return original(...args)
					},
				),
			)
		},
	)
	unpatch.push(unsub)

	return () => {
		for (const un of unpatch) un?.()
	}
}
