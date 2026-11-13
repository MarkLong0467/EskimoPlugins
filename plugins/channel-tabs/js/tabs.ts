import { store } from './config'
import { openChannel, toast } from './discord'
import type { Tab } from './config'

/** The saved tabs. */
export const tabsOf = (): Tab[] => store.get('tabs')

/** Whether a channel is saved as a tab. */
export const isSaved = (id: string): boolean =>
	tabsOf().some(tab => tab.id === id)

/** Saves a channel as a tab, at the end. A channel that is saved already is left where it is. */
export function addTab(tab: Tab): void {
	if (!isSaved(tab.id)) store.set({ tabs: [...tabsOf(), tab] })
}

/** Takes one tab away. If it was the second half of a split screen, the split ends. */
export function removeTab(id: string): void {
	store.set({ tabs: tabsOf().filter(tab => tab.id !== id) })
	if (store.get('split')?.id === id) store.set({ split: null })
}

/** Takes every tab away, and ends the split. */
export function removeAll(): void {
	store.set({ tabs: [], split: null })
}

/** Ends the split screen. */
export function endSplit(): void {
	store.set({ split: null })
}

/**
 * Puts a saved tab in the second half of the screen. Tapping the one that is there already ends the split. A tab cannot be in
 * both halves, so the channel that is open on the first half says so with a toast.
 */
export function toggleSplit(tab: Tab, current: string): void {
	if (tab.id === current) {
		toast('That channel is already open on the other half.')
		return
	}
	store.set({ split: store.get('split')?.id === tab.id ? null : tab })
}

/**
 * Starts a split screen with the first saved tab that is not the open channel, or ends the one that is there. A toast says so
 * if there is nothing to put in the second half.
 */
export function splitButton(current: string): void {
	if (store.get('split')) {
		endSplit()
		return
	}
	const other = tabsOf().find(tab => tab.id !== current)
	if (other) store.set({ split: other })
	else toast('Save another channel as a tab first, then split the screen.')
}

/**
 * Opens a saved tab. The tab in the second half takes the first half's place instead, and the channel that was open goes to
 * the second half, so the two swap sides.
 */
export function selectTab(tab: Tab, current: Tab): void {
	if (tab.id === current.id) return
	if (store.get('split')?.id === tab.id) store.set({ split: current })
	openChannel(tab)
}

/** Saves the open channel, or says why not. */
export function addCurrent(current: Tab): void {
	if (isSaved(current.id)) {
		toast('This channel is already a tab.')
		return
	}
	addTab(current)
	if (!store.get('tabs').some(tab => tab.id === current.id))
		toast('Could not save this tab.')
}

