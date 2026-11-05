'use strict'

/**
 * Builds the plugins and runs every test. Used by `bun run test`.
 *
 * 1. `valenced-plugin build` compiles each plugin under `plugins/` to `plugins/<name>/build/js/index.js`.
 *    The tests load that file, so they test what would actually ship.
 * 2. Every `tests/*.test.cjs` file runs in its own Node process, so one test cannot affect another.
 *
 * Pass names to run only some tests: `bun run test split-large-messages`.
 * Use `--no-build` to skip the build step when the plugins are already built.
 */

const { spawnSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const root = path.join(__dirname, '..')
const args = process.argv.slice(2)
const skipBuild = args.includes('--no-build')
const only = args.filter(arg => !arg.startsWith('--'))

const tests = fs
	.readdirSync(__dirname)
	.filter(file => file.endsWith('.test.cjs'))
	.map(file => file.replace(/\.test\.cjs$/, ''))
	.filter(name => only.length === 0 || only.includes(name))
	.sort()

if (tests.length === 0) {
	console.error(`No tests found${only.length ? ` for: ${only.join(', ')}` : ''}`)
	process.exit(1)
}

if (!skipBuild) {
	console.log(`Building ${only.length ? only.join(', ') : 'all plugins'}...`)
	const bun = spawnSync('bun', ['run', 'build', ...only], { cwd: root, stdio: 'inherit' })
	if (bun.status !== 0) {
		console.error('Build failed.')
		process.exit(bun.status ?? 1)
	}
}

const failed = []
for (const name of tests) {
	const result = spawnSync(process.execPath, [path.join(__dirname, `${name}.test.cjs`)], { cwd: root, stdio: 'inherit' })
	if (result.status !== 0) failed.push(name)
}

console.log(`\n${tests.length - failed.length} of ${tests.length} test files passed.`)
if (failed.length) {
	console.log(`Failed: ${failed.join(', ')}`)
	process.exit(1)
}
