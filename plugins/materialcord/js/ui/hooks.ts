import { getSettingsSnapshot, subscribeSettings } from '../lib/settings'
import type { MaterialCordSettings } from '../types'

/** Current settings, repainting on every write — including writes from Discord's theme picker. */
export function useSettings(): MaterialCordSettings {
	const { useState, useEffect } = valenced.react.React
	const [value, setValue] = useState(getSettingsSnapshot)
	useEffect(() => subscribeSettings(() => setValue(getSettingsSnapshot())), [])
	return value
}
