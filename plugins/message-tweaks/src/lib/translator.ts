import { Dispatcher } from '@valenced/discord/common/flux'
import { openToast } from '../../../../shared/kmmiio/toast'
import { normalizeTargetCode } from './lang'
import { getIcon } from './modules'
import {
	getMessageStore,
	getSettings,
	getStorage,
	markLocalEdit,
} from './state'

export type TranslatorService = 'google' | 'deepl'

const PLACEHOLDER_REGEX = /<(a?):\w+:\d+>|<@!?\d+>|<#\d+>/g

// Session-only cache of message id -> original content, so a translated
// message can be reverted. Survives nothing (matches dislate).
const translatedCache = new Map<string, string>()

export function isTranslated(messageId: string): boolean {
	return translatedCache.has(messageId)
}

// Protect emojis/mentions so the translation APIs don't mangle them, then put
// them back on the result. Same mechanic as dislate.
function protectPlaceholders(text: string): {
	clean: string
	placeholders: string[]
} {
	const placeholders: string[] = []
	const clean = text.replace(PLACEHOLDER_REGEX, match => {
		placeholders.push(match)
		return ` [[${placeholders.length - 1}]] `
	})
	return { clean, placeholders }
}

function restorePlaceholders(text: string, placeholders: string[]): string {
	return placeholders.reduce(
		(out, original, index) =>
			out.replace(new RegExp(`\\[\\[\\s*${index}\\s*\\]\\]`, 'g'), original),
		text,
	)
}

async function requestTranslate(
	text: string,
	target: string,
	service: TranslatorService,
): Promise<string> {
	if (service === 'deepl') {
		const response = await fetch('https://deeplx.1stg.me/translate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				text,
				source_lang: 'auto',
				target_lang: target.toUpperCase(),
			}),
		})
		const data = await response.json()
		if (data?.code !== 200) {
			throw new Error(data?.message ?? 'DeepL request failed')
		}
		return String(data?.data ?? '')
	}

	const url =
		'https://translate.googleapis.com/translate_a/single?' +
		new URLSearchParams({
			client: 'gtx',
			sl: 'auto',
			tl: target,
			dt: 't',
			dj: '1',
			source: 'input',
			q: text,
		}).toString()
	const response = await fetch(url)
	const data = await response.json()
	return (data?.sentences ?? []).map((s: any) => s?.trans ?? '').join('')
}

function dispatchUpdate(channelId: string, messageId: string, content: string) {
	try {
		const msg = getMessageStore()?.getMessage?.(channelId, messageId)
		Dispatcher.dispatch({
			type: 'MESSAGE_UPDATE',
			message: {
				...(msg ?? {}),
				id: messageId,
				channel_id: channelId,
				content,
				edited_timestamp: null,
			},
		})
	} catch {}
}

function showErrorToast(text: string) {
	openToast('message-tweaks-translate-error', text, getIcon('CircleErrorIcon'))
}

/**
 * Translate a message in place (MESSAGE_UPDATE) or revert it back to the
 * cached original when it has been translated already.
 */
export async function translateMessage(
	channelId: string,
	messageId: string,
	fallbackContent: string,
): Promise<void> {
	const store = getMessageStore()
	const content =
		store?.getMessage?.(channelId, messageId)?.content ?? fallbackContent

	if (translatedCache.has(messageId)) {
		const original = translatedCache.get(messageId)
		if (original != null) {
			translatedCache.delete(messageId)
			// Keep the ghost edit out of the sender's edit trail.
			markLocalEdit(channelId, messageId)
			dispatchUpdate(channelId, messageId, original)
		}
		return
	}

	if (typeof content !== 'string' || content.trim() === '') return

	const settings = getSettings()
	const target = normalizeTargetCode(
		settings.translatorService,
		settings.translatorTargetLang || 'en',
	)
	try {
		const { clean, placeholders } = protectPlaceholders(content)
		const translated = (
			await requestTranslate(clean, target, settings.translatorService)
		).trim()
		if (!translated) return

		const restored = restorePlaceholders(translated, placeholders)
		const suffix = ` \`[${target.toLowerCase()}]\``
		const finalContent = settings.translatorImmersive
			? `${content}\n${restored}${suffix}`
			: `${restored}${suffix}`

		translatedCache.set(messageId, content)
		// Keep the ghost edit out of the sender's edit trail.
		markLocalEdit(channelId, messageId)
		dispatchUpdate(channelId, messageId, finalContent)
	} catch (e) {
		showErrorToast(
			`Failed to translate message: ${e instanceof Error ? e.message : String(e)}`,
		)
	}
}

export function setTranslatorTargetLang(code: string) {
	try {
		getStorage()?.set({ ...getSettings(), translatorTargetLang: code })
	} catch {}
}

export function setTranslatorService(service: TranslatorService) {
	try {
		const s = getSettings()
		getStorage()?.set({
			...s,
			translatorService: service,
			// Keep the selected language across services (case-insensitive
			// migration) so switching never drops back to English.
			translatorTargetLang: normalizeTargetCode(
				service,
				s.translatorTargetLang,
			),
		})
	} catch {}
}
