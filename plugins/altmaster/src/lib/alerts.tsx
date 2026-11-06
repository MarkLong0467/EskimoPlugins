import { openToast } from '../../../../shared/kmmiio/toast'

let toastCounter = 0

export function showToast(message: string) {
	toastCounter += 1
	openToast(`altmaster-toast-${toastCounter}`, message)
}

export function showInfo(title: string, message: string): void {
	showToast(`${title}: ${message}`)
}

export function showError(title: string, message: string): void {
	showToast(`${title}: ${message}`)
}
