import { getEntries, subscribeEntries } from '../api/store'
import { getSettingsSnapshot, subscribeSettings } from '../lib/settings'
import type { ToastApiSettings, ToastEntry } from '../types'

/** Current settings, repainting on every write — including writes made by a sheet. */
export function useSettings(): ToastApiSettings {
	const { useState, useEffect } = valenced.react.React
	const [value, setValue] = useState(getSettingsSnapshot)
	useEffect(() => subscribeSettings(() => setValue(getSettingsSnapshot())), [])
	return value
}

export function useEntries(): ToastEntry[] {
	const { useState, useEffect } = valenced.react.React
	const [value, setValue] = useState(getEntries)
	useEffect(() => subscribeEntries(() => setValue(getEntries())), [])
	return value
}
