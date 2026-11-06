/**
 * State that every plugin bundle with the library inside shares.
 *
 * The library is bundled into each plugin, so each bundle has its own copy of the code. A few things must still be seen
 * by all of them, such as which plugins are running (Declutter asks whether Server Drawer is). Those live on
 * `globalThis` under a name, and the first bundle to ask makes them.
 */
export function shared<T>(key: string, make: () => T): T {
	const holder = globalThis as unknown as Record<string, T | undefined>
	const name = `__marklongKmmiio_${key}`
	let value = holder[name]
	if (value === undefined) {
		value = make()
		holder[name] = value
	}
	return value
}
