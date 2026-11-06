import type { ComponentType } from 'react'

interface Intercept {
	replacement: ComponentType<any>
	extraProps?: Record<string, any> | ((props: any) => Record<string, any>)
	collapseAncestors?: number
}

interface PropsIntercept {
	predicate: (props: any, type: any, rest: any[]) => boolean
	replacement: ComponentType<any> | null
}

interface PropsTransform {
	predicate: (props: any, type: any, rest: any[]) => boolean
	transform: (props: any) => any
}

interface TypeDetector {
	key: string
	predicate: (type: any) => boolean
	onDetected: (type: any) => void
	persistent: boolean
	justFired?: boolean
	negative?: WeakSet<any>
}

const intercepts = new Map<any, Intercept>()
const propsIntercepts: PropsIntercept[] = []
const propsTransforms: PropsTransform[] = []
let typeDetectors: TypeDetector[] = []
const detectorKeys = new Set<string>()
let isPatched = false

// Elements are created child-first, so a collapse mark on a child is already present by the
// time the parent's own call is intercepted - that is what makes walking the collapse upward
// possible.
const collapseMarks = new WeakMap<object, number>()
let collapseMarkCount = 0

// display: none alone doesn't reclaim space on every layout, so this also zeroes
// width/flex/margin and hides overflow.
const COLLAPSE_STYLE = {
	display: 'none',
	width: 0,
	minWidth: 0,
	maxWidth: 0,
	flexGrow: 0,
	flexShrink: 0,
	flexBasis: 0,
	margin: 0,
	padding: 0,
	borderWidth: 0,
	overflow: 'hidden',
}

export function registerIntercept(
	original: any,
	replacement: ComponentType<any>,
	extraProps?: Record<string, any> | ((props: any) => Record<string, any>),
	options?: { collapseAncestors?: number },
) {
	intercepts.set(original, {
		replacement,
		extraProps,
		collapseAncestors: options?.collapseAncestors,
	})
}

export function registerPropsIntercept(
	predicate: (props: any, type: any, rest: any[]) => boolean,
	replacement: ComponentType<any> | null,
) {
	propsIntercepts.push({ predicate, replacement })
}

export function registerPropsTransform(
	predicate: (props: any, type: any, rest: any[]) => boolean,
	transform: (props: any) => any,
) {
	propsTransforms.push({ predicate, transform })
}

export function registerTypeDetector(
	key: string,
	predicate: (type: any) => boolean,
	onDetected: (type: any) => void,
	options?: { persistent?: boolean },
) {
	if (detectorKeys.has(key)) return
	detectorKeys.add(key)
	typeDetectors.push({
		key,
		predicate,
		onDetected,
		persistent: options?.persistent ?? false,
	})
}

export function hasTypeDetector(key: string): boolean {
	return detectorKeys.has(key)
}

function runTypeDetectors(type: any) {
	if (typeDetectors.length === 0) return
	if (intercepts.size > 0 && intercepts.has(type)) return
	if (!type || (typeof type !== 'function' && typeof type !== 'object')) return

	let consumed = false
	for (const detector of typeDetectors) {
		if (detector.negative?.has(type)) continue

		let matched = false
		try {
			matched = detector.predicate(type)
		} catch {
			// ignore
		}
		if (!matched) {
			;(detector.negative ??= new WeakSet()).add(type)
			continue
		}

		try {
			detector.onDetected(type)
		} catch {
			// ignore
		}

		if (!detector.persistent) {
			detector.justFired = true
			consumed = true
		}
	}

	if (consumed) {
		typeDetectors = typeDetectors.filter(d => d.persistent || !d.justFired)
	}
}

function unwrapComponent(type: any): any {
	let cur = type
	let depth = 0
	while (cur && typeof cur === 'object' && depth++ < 8) {
		if (
			typeof cur.type === 'function' ||
			(cur.type && typeof cur.type === 'object')
		) {
			cur = cur.type
		} else if (typeof cur.render === 'function') {
			cur = cur.render
		} else {
			break
		}
	}
	return cur
}

export function hasName(type: any, name: string): boolean {
	if (!type || (typeof type !== 'function' && typeof type !== 'object'))
		return false
	if (type.name === name || type.displayName === name) return true
	const t = type.type
	if (t && (t.name === name || t.displayName === name)) return true
	return unwrapComponent(type)?.name === name
}

function inspectCollapseChild(child: any): number {
	if (child == null || child === false || typeof child !== 'object') return 0
	return collapseMarks.get(child) ?? 0
}

function inheritedCollapseDepth(props: any, rest: any[] = []): number {
	let deepest = 0

	const children = props?.children
	if (children != null) {
		if (Array.isArray(children)) {
			for (const child of children)
				deepest = Math.max(deepest, inspectCollapseChild(child))
		} else {
			deepest = Math.max(deepest, inspectCollapseChild(children))
		}
	}

	for (const child of rest)
		deepest = Math.max(deepest, inspectCollapseChild(child))
	return deepest
}

function mergeExtraProps(props: any, extraProps: any): any {
	const value =
		typeof extraProps === 'function' ? extraProps(props) : extraProps
	return value ? { ...props, ...value } : props
}

// Returns a replacement type if this element should be intercepted, null to render nothing,
// or undefined to pass through unchanged.
function resolveReplacement(
	type: any,
	props: any,
	rest: any[],
): { type: any; props: any; collapse?: number } | null | undefined {
	const direct = intercepts.get(type)
	if (direct) {
		return {
			type: direct.replacement,
			props: direct.extraProps
				? mergeExtraProps(props, direct.extraProps)
				: props,
			collapse: direct.collapseAncestors,
		}
	}

	runTypeDetectors(type)

	// A detector may have just registered an intercept for this exact type - honor it in the
	// same pass so the first render is caught, not just the next one.
	const afterDetect = intercepts.get(type)
	if (afterDetect) {
		return {
			type: afterDetect.replacement,
			props: afterDetect.extraProps
				? mergeExtraProps(props, afterDetect.extraProps)
				: props,
			collapse: afterDetect.collapseAncestors,
		}
	}

	let effectiveProps = props
	if (effectiveProps) {
		for (const { predicate, transform } of propsTransforms) {
			try {
				if (predicate(effectiveProps, type, rest)) {
					effectiveProps = transform(effectiveProps)
				}
			} catch {
				// ignore
			}
		}
	}

	if (effectiveProps) {
		for (const { predicate, replacement } of propsIntercepts) {
			try {
				if (predicate(effectiveProps, type, rest)) {
					return replacement
						? { type: replacement, props: effectiveProps }
						: null
				}
			} catch {
				// ignore
			}
		}
	}

	// A wrapper whose only child was already collapsed - zero it out too and pass the
	// remaining budget up. Only walk children when something has actually collapsed.
	if (collapseMarkCount > 0) {
		const inherited = inheritedCollapseDepth(effectiveProps, rest)
		if (inherited > 0) {
			return {
				type,
				props: {
					...effectiveProps,
					style: [effectiveProps?.style, COLLAPSE_STYLE],
				},
				collapse: inherited - 1,
			}
		}
	}

	if (effectiveProps !== props) {
		return { type, props: effectiveProps }
	}

	return undefined
}

function EmptyPatch() {
	return null
}

// Mutates the [type, props, ...rest] argument array in place and returns the collapse depth
// the created element should carry (for upward propagation).
function applyResolved(e: any[]): number | undefined {
	const type = e[0]
	const props = e[1]
	const resolved = resolveReplacement(type, props, e)
	if (resolved === null) {
		e[0] = EmptyPatch
		return undefined
	}
	if (resolved) {
		e[0] = resolved.type
		e[1] = resolved.props
		if (resolved.collapse && resolved.collapse > 0) {
			return resolved.collapse
		}
	}
	return undefined
}

export function patchCreateElement(
	cleanups: (fn: () => void) => void,
): boolean {
	if (isPatched) return false
	isPatched = true

	const unpatch: (() => void)[] = []

	if (typeof valenced.react.React.createElement === 'function') {
		unpatch.push(
			valenced.patcher.instead(
				valenced.react.React,
				'createElement',
				(args: any[], original: (...a: any[]) => any) => {
					applyResolved(args)
					return Reflect.apply(original, valenced.react.React, args)
				},
			),
		)
	}

	for (const key of ['jsx', 'jsxs'] as const) {
		if (typeof valenced.react.ReactJSXRuntime?.[key] === 'function') {
			unpatch.push(
				valenced.patcher.instead(
					valenced.react.ReactJSXRuntime,
					key,
					(args: any[], original: (...a: any[]) => any) => {
						const depth = applyResolved(args)
						const result = Reflect.apply(
							original,
							valenced.react.ReactJSXRuntime,
							args,
						)
						if (depth && result && typeof result === 'object') {
							collapseMarks.set(result, depth)
							collapseMarkCount++
						}
						return result
					},
				),
			)
		}
	}

	cleanups(() => {
		isPatched = false
		for (const fn of unpatch.splice(0)) {
			try {
				fn()
			} catch {
				// ignore
			}
		}
		intercepts.clear()
		propsIntercepts.length = 0
		propsTransforms.length = 0
		typeDetectors = []
		detectorKeys.clear()
		collapseMarkCount = 0
	})

	return true
}
