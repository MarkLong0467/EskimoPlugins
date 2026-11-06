import {
	presentAltsSheet,
	presentLinkedAltsSheet,
	presentReportSheet,
} from '../ui/sheets'
import { showError, showToast } from './alerts'
import { checkUser, describeError } from './api'
import type { CheckResult } from './api'

export async function checkFlow(targetId: string): Promise<void> {
	showToast('Checking alt accounts…')
	let data: CheckResult | null = null
	try {
		data = await checkUser(targetId)
	} catch (err) {
		showError('AltMaster', describeError(err))
		return
	}

	const entries: any[] = data?.entries ?? []
	if (entries.length === 0) {
		showToast('No linked accounts found for this user.')
		return
	}

	await presentAltsSheet(targetId, entries)
}

export function reportFlow(mainId: string): void {
	presentReportSheet(mainId)
}

export async function falsePositiveFlow(userId: string): Promise<void> {
	showToast('Checking for false positives…')
	let data: CheckResult | null = null
	try {
		data = await checkUser(userId)
	} catch (err) {
		showError('AltMaster', describeError(err))
		return
	}

	const connectedAlts = (data?.entries ?? []).filter(
		(entry: any) => entry.mainId === userId,
	)
	if (connectedAlts.length === 0) {
		showToast('No alt accounts are connected to this profile.')
		return
	}

	await presentLinkedAltsSheet(userId, connectedAlts)
}
