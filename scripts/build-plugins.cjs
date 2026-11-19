'use strict'

/**
 * Runs `valenced-plugin build`, leaving out the plugins written as a single plain index.js
 * (Always Animate, Colorful Channels, Custom Sounds, Minecraft Servers, Pin DMs, Show Hidden Channels).
 * Those files start with `(function` and are shipped exactly as written; the bundler would try to compile them
 * and stop with "has no default export". Usage is the same as the bundler: `bun run build [names...] [--dev]`.
 */
const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const root = path.join(__dirname, '..')
const pluginsDir = path.join(root, 'plugins')
const args = process.argv.slice(2)
const flags = args.filter(a => a.startsWith('-'))
const asked = args.filter(a => !a.startsWith('-'))

/** A plugin whose root index.js is the plain, ready-to-ship kind. */
function isPlain(name) {
	try {
		const head = fs.readFileSync(path.join(pluginsDir, name, 'index.js'), 'utf8').slice(0, 200).trimStart()
		return head.startsWith('(function')
	} catch {
		return false
	}
}

const all = asked.length ? asked : fs.readdirSync(pluginsDir).filter(n => fs.existsSync(path.join(pluginsDir, n, 'manifest.json')))
const plain = all.filter(isPlain)
const names = all.filter(n => !isPlain(n))
if (plain.length) console.log(`Shipped as written, nothing to build: ${plain.join(', ')}`)
if (!names.length) process.exit(0)

const bin = path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'valenced-plugin.exe' : 'valenced-plugin')
const result = spawnSync(fs.existsSync(bin) ? bin : 'valenced-plugin', ['build', ...names, ...flags], { cwd: root, stdio: 'inherit' })
process.exit(result.status ?? 1)
