import { useEffect, useState } from 'react'
import { userStore } from './house'
import { currentHouse, subscribe } from './state'

/**
 * A React hook that returns the house you are in (1, 2, 3, or 0 for none) and draws the component again whenever it
 * changes: after a switch made here, and when Discord's own user data changes.
 */
export function useHouse(): number {
	const [, setTick] = useState(0)

	useEffect(() => {
		const update = () => setTick(count => count + 1)
		const unsubscribe = subscribe(update)
		const users = userStore()
		users?.addChangeListener?.(update)
		return () => {
			unsubscribe()
			users?.removeChangeListener?.(update)
		}
	}, [])

	return currentHouse()
}
