const TAG = '[kmmiio-lib/patcher]'

function failed(kind: string, error: unknown) {
	console.warn(TAG, `${kind} did not apply:`, error)
}

export function safeInstead<
	Parent extends Record<Key, any>,
	Key extends keyof Parent,
>(
	parent: Parent,
	key: Key,
	hook: (args: any[], original: Parent[Key]) => any,
): () => void {
	try {
		return valenced.patcher.instead(parent, key, hook as any)
	} catch (error) {
		failed(`instead(${String(key)})`, error)
		return () => {}
	}
}

export function safeInsteadJSX(
	component: any,
	hook: (args: any[], jsx: any) => any,
): () => void {
	try {
		return valenced.react.jsxRuntime.insteadJSX(component, hook)
	} catch (error) {
		failed('insteadJSX', error)
		return () => {}
	}
}

export function safeAfterJSX(
	component: any,
	hook: (element: any) => any,
): () => void {
	try {
		return valenced.react.jsxRuntime.afterJSX(component, hook)
	} catch (error) {
		failed('afterJSX', error)
		return () => {}
	}
}
