import type { PreviewSettings } from './types'

/** The id of the popup, so it can be closed again. */
export const ALERT_KEY = 'marklong.message-preview'

/** The id of the toast shown when a preview cannot be shown. */
export const TOAST_KEY = 'MARKLONG_MESSAGE_PREVIEW'

/** The key of the floating button, so it is not added twice. */
export const BUTTON_KEY = 'message-preview-button'

/** The settings used until the user changes something. */
export const DEFAULT_SETTINGS: PreviewSettings = {
	buttonType: 'pill',
	previewType: 'ephemeral',
}

/** The width and height of the floating button, in points. */
export const BUTTON_SIZE = 40

/** A message flag (64) that makes Discord draw the message as visible only to you. */
export const EPHEMERAL_FLAG = 64

/** The name Discord gives the send button's tap handler. It is the same in every language, so it finds the button. */
export const SEND_HANDLER_NAME = 'handlePressSend'
