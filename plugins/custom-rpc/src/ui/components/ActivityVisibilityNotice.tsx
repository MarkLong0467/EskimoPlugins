import { useEffect } from 'react'
import { AppState } from 'react-native'
import { applyActivity } from '../../lib/activity'
import {
	enableShareActivity,
	getActivityVisibility,
	getNativeAlertParts,
	logVisibilityDiagnostics,
} from '../../lib/activityVisibility'
import { getSettings } from '../../lib/state'
import { showToast } from '../../lib/toasts'

const ALERT_KEY = 'custom-rpc-activity-blocked'

let shown = false

/**
 * Raise Discord's own alert when the activity is being filtered out of the
 * presence, using the stable `valenced.discord` surface (`AlertModal` /
 * `AlertActionButton` opened through `AlertActionCreators.openAlert`) rather than
 * scanning for modules — the client's own property names are minified, so
 * `withProps` cannot find them, and the AlertModal module is lazy.
 *
 * Renders nothing; the alert is opened imperatively, exactly like the client's
 * own alerts. `shown` keeps it to one prompt per blocked state.
 */
export function maybePromptActivityBlocked(): void {
	const { shared, shareDisabled, unknown } = getActivityVisibility(
		getSettings().clientId,
	)
	if (shared) {
		shown = false
		if (unknown) logVisibilityDiagnostics()
		return
	}
	if (!shareDisabled || shown) return

	const { AlertModal, AlertActionButton, openAlert, dismissAlert } =
		getNativeAlertParts()
	if (typeof openAlert !== 'function' || !AlertModal || !AlertActionButton) {
		logVisibilityDiagnostics()
		return
	}
	shown = true

	const confirm = async () => {
		if (!(await enableShareActivity())) {
			showToast('Couldn\'t turn on "Share my activity" — try again.')
		}
		// `LocalActivityStore` only recomputes when the activity changes, so the
		// payload has to be re-sent for the profile to pick it up.
		applyActivity()
		dismissAlert?.(ALERT_KEY)
		shown = false
	}

	openAlert(
		ALERT_KEY,
		<AlertModal
			title="Activity not showing"
			content='Discord is hiding your activity because "Share my activity" is off. Turn it on and the presence will be re-sent.'
			actions={
				<>
					<AlertActionButton
						variant="primary"
						text="Turn on and reapply"
						onPress={confirm}
					/>
					<AlertActionButton
						variant="secondary"
						text="Dismiss"
						onPress={() => {
							dismissAlert?.(ALERT_KEY)
							shown = false
						}}
					/>
				</>
			}
		/>,
		undefined,
		{ dismissable: true },
	)
}

export default function ActivityVisibilityNotice() {
	useEffect(() => {
		logVisibilityDiagnostics()
		maybePromptActivityBlocked()
		const sub = AppState.addEventListener('change', state => {
			if (state === 'active') maybePromptActivityBlocked()
		})
		return () => sub.remove()
	}, [])

	return null
}
