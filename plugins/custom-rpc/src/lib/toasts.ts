import { openToast } from '../../../../shared/kmmiio/toast'

export function showToast(content: string, _icon?: string) {
	openToast(
		`custom-rpc-${Date.now()}-${Math.random().toString(36).slice(2)}`,
		content,
	)
}
