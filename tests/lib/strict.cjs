'use strict'

/**
 * A patcher that follows the rules of Valenced's real one, which the test harness's own patcher is looser about.
 *
 * Valenced runs every hook as `value = hook(value)` and uses what it returns, so:
 * - a `before` hook must return the arguments (an array),
 * - an `after` hook must return the result (a hook that returns nothing makes the result `undefined`),
 * - an `instead` hook gets `(args, original)` and returns the result.
 *
 * The harness patcher keeps the old value when a hook returns nothing, which hides a missing `return`. This one does what
 * Valenced does, and notes each hook that looks like it forgot to return in `violations`.
 */

/**
 * @returns A patcher with `before`, `after` and `instead` like `valenced.patcher`, and the list of mistakes it saw.
 */
function createStrictPatcher() {
	const violations = []
	const slots = new WeakMap()

	function slotFor(parent, key) {
		let perParent = slots.get(parent)
		if (!perParent) slots.set(parent, (perParent = new Map()))
		let slot = perParent.get(key)
		if (!slot) {
			const target = parent[key]
			slot = { target, before: [], instead: [], after: [] }
			slot.wrapper = function (...args) {
				let current = args
				for (const hook of slot.before) {
					const next = hook(current)
					if (!Array.isArray(next)) violations.push(`before hook on ${String(key)} did not return the arguments`)
					current = Array.isArray(next) ? next : current
				}
				const call = (index, callArgs) => {
					if (index < 0) return slot.target.apply(this, callArgs)
					const original = (...inner) => call(index - 1, inner)
					return slot.instead[index].call(this, callArgs, original)
				}
				let result = call(slot.instead.length - 1, current)
				for (const hook of slot.after) {
					const before = result
					result = hook(result)
					if (result === undefined && before !== undefined) violations.push(`after hook on ${String(key)} returned nothing, so the result was lost`)
				}
				return result
			}
			parent[key] = slot.wrapper
			perParent.set(key, slot)
		}
		return { slot, perParent }
	}

	/** The priority each hook was added with. Valenced runs the highest first, and the newest first among equals. */
	const priorities = new WeakMap()

	function add(kind) {
		return (parent, key, hook, options) => {
			if (typeof parent?.[key] !== 'function') throw new TypeError(`Cannot patch ${String(key)}: it is not a function`)
			const { slot, perParent } = slotFor(parent, key)
			const priority = options?.priority ?? 0
			priorities.set(hook, priority)
			const at = slot[kind].findIndex(other => (priorities.get(other) ?? 0) <= priority)
			if (at < 0) slot[kind].push(hook)
			else slot[kind].splice(at, 0, hook)
			return () => {
				const index = slot[kind].indexOf(hook)
				if (index < 0) return false
				slot[kind].splice(index, 1)
				if (!slot.before.length && !slot.instead.length && !slot.after.length) {
					if (parent[key] === slot.wrapper) parent[key] = slot.target
					perParent.delete(key)
				}
				return true
			}
		}
	}

	return { patcher: { before: add('before'), after: add('after'), instead: add('instead') }, violations }
}

/** Makes a runtime use the strict patcher. Returns the list of mistakes it saw. */
function useStrictPatcher(runtime) {
	const { patcher, violations } = createStrictPatcher()
	runtime.valenced.patcher = patcher
	return violations
}

module.exports = { createStrictPatcher, useStrictPatcher }
