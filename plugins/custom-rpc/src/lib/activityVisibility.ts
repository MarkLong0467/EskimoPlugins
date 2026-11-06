/**
 * Why an activity is (not) reaching the user's profile.
 *
 * `SelfPresenceStore.shouldShowActivity` filters every local activity before it
 * is published, and for a `PLAYING` activity it delegates to
 * `shouldShareApplicationActivity` in `utils/LibraryApplicationUtils.tsx`:
 *
 *   return ShowCurrentGame.getSetting()
 *     && StatusSetting.getSetting() !== Constants.INVISIBLE
 *     && (app == null || !app.hasFlag(Constants.PRIVATE))
 *
 * The first condition is the "Share my activity" toggle. With it off the client
 * keeps accepting `SET_ACTIVITY` and keeps reporting success — the activity is
 * filtered out of the presence, nothing appears on the profile, and no error is
 * surfaced anywhere. And because `LocalActivityStore` only recomputes when the
 * activity *changes*, turning the setting back on does not re-publish what is
 * already stored: the payload has to be re-sent.
 *
 * Only that first condition is checked here. `INVISIBLE` and `PRIVATE` are
 * minified onto different require results in the client, so they cannot be
 * resolved reliably; guessing them would risk nagging about a condition that is
 * not actually the problem. When the toggle is on we therefore stay quiet.
 */

import { createModuleGetter } from './modules'

/**
 * `ShowCurrentGame` is a genuine, non-minified export of `modules/user_settings/
 * UserSettings`, and that module is initialised by the core client long before
 * any plugin runs.
 *
 * Both setting names are listed deliberately: on-device a single-prop
 * `withProps('ShowCurrentGame')` matched nothing, while the two-prop form
 * resolved the module and read `showCurrentGame`/`status` back correctly. The
 * lookup is therefore done by the pair that is known to work, with the
 * single-prop form kept only as a fallback.
 */
const userSettingsFn = createModuleGetter<any>(
	valenced.modules.finders.filters.withProps(
		'ShowCurrentGame',
		'StatusSetting',
	),
	exports => exports,
)

export type ActivityVisibility = {
	/** False only when we positively know Discord is filtering the activity. */
	shared: boolean
	/** Set when the "Share my activity" toggle is off. */
	shareDisabled: boolean
	/** True when `UserSettings` could not be reached, so stay quiet. */
	unknown: boolean
}

const UNKNOWN: ActivityVisibility = {
	shared: true,
	shareDisabled: false,
	unknown: true,
}

/** Whether Discord will publish the activity for `clientId`. */
export function getActivityVisibility(_clientId: string): ActivityVisibility {
	const settings = userSettingsFn()
	if (!settings) return UNKNOWN

	try {
		const showCurrentGame = settings.ShowCurrentGame?.getSetting?.()
		if (typeof showCurrentGame !== 'boolean') return UNKNOWN
		return {
			shared: showCurrentGame,
			shareDisabled: !showCurrentGame,
			unknown: false,
		}
	} catch {
		return UNKNOWN
	}
}

/**
 * Turn "Share my activity" on ourselves, exactly the way the client does.
 *
 * `ShowCurrentGame` is a proto setting (`status.showCurrentGame`, a `BoolValue`),
 * so `updateSetting` dispatches `USER_SETTINGS_PROTO_UPDATE` locally and then
 * hands the change to `PreloadedUserSettingsActionCreators.updateAsync` to sync
 * it to the account. The local write is the part that matters, because presence
 * filtering happens on the client.
 */
export async function enableShareActivity(): Promise<boolean> {
	const setting = userSettingsFn()?.ShowCurrentGame as
		| { updateSetting?: (next: boolean | ((prev: any) => boolean)) => unknown }
		| undefined
	if (typeof setting?.updateSetting !== 'function') {
		console.log(
			'[CustomRPC] enableShareActivity: no updateSetting on ShowCurrentGame',
		)
		return false
	}

	try {
		// The updater form is idempotent, so a double tap cannot flip it back off.
		await setting.updateSetting(() => true)
	} catch (error) {
		console.log('[CustomRPC] enableShareActivity failed', String(error))
		return false
	}
	return true
}

export function getNativeAlertParts(): {
	AlertModal: any
	AlertActionButton: any
	openAlert:
		| ((
				key: string,
				alert: any,
				onDismiss?: () => unknown,
				options?: { dismissable?: boolean },
		  ) => void)
		| undefined
	dismissAlert: ((key: string) => void) | undefined
} {
	let design: any
	let actions: any
	try {
		design = (valenced as any).discord?.design?.Design
	} catch {}
	try {
		actions = (valenced as any).discord?.actions?.AlertActionCreators
	} catch {}
	return {
		AlertModal: design?.AlertModal,
		AlertActionButton: design?.AlertActionButton ?? design?.Button,
		openAlert: actions?.openAlert,
		dismissAlert: actions?.dismissAlert,
	}
}

let loggedDiagnostics = false

/**
 * One-shot report of every dependency this feature needs. Without this a
 * resolution failure is indistinguishable from "there was nothing to report".
 */
export function logVisibilityDiagnostics(): void {
	if (loggedDiagnostics) return
	loggedDiagnostics = true

	const settings = userSettingsFn()
	const { AlertModal, AlertActionButton, openAlert } = getNativeAlertParts()

	console.log(
		'[CustomRPC] activity visibility diagnostics',
		JSON.stringify({
			userSettings: !!settings,
			showCurrentGame: settings?.ShowCurrentGame?.getSetting?.() ?? null,
			hasUpdateSetting:
				typeof settings?.ShowCurrentGame?.updateSetting === 'function',
			alertModal: !!AlertModal,
			alertActionButton: !!AlertActionButton,
			openAlert: typeof openAlert === 'function',
			visibility: getActivityVisibility(''),
		}),
	)
}
