'use strict'

/**
 * Writes the plugin table of the repository's front page (`README.md`): one row for each plugin that is in the update index,
 * with its version, what it does and a link to its folder.
 *
 *   node tools/readme.cjs <index-folder>
 *
 * Everything between `<!-- plugins:start -->` and `<!-- plugins:end -->` is replaced. The versions come from the index (the
 * `latest` channel), the short lines from `tools/post.config.json` (the same ones the repository thread post uses), and the
 * names from each plugin's `manifest.json`. A plugin that is not in the index is not listed.
 */

const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const START = '<!-- plugins:start -->'
const END = '<!-- plugins:end -->'

/** The first sentence of a description, for a plugin that has no short line. */
const firstSentence = text => String(text || '').split(/(?<=[.!?])\s/)[0].trim()

/** Escapes what would break a table cell. */
const cell = text => String(text).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

const indexFolder = process.argv[2]
if (!indexFolder) {
	console.error('Usage: node tools/readme.cjs <index-folder>')
	process.exit(1)
}

const index = JSON.parse(fs.readFileSync(path.join(indexFolder, 'index.json'), 'utf8'))
const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'post.config.json'), 'utf8'))

/** Every plugin folder with its manifest, by plugin id. */
const folders = new Map()
for (const name of fs.readdirSync(path.join(ROOT, 'plugins'))) {
	const file = path.join(ROOT, 'plugins', name, 'manifest.json')
	if (!fs.existsSync(file)) continue
	const manifest = JSON.parse(fs.readFileSync(file, 'utf8'))
	folders.set(manifest.id, { folder: name, manifest })
}

const rows = []
for (const [id, entry] of Object.entries(index.plugins)) {
	const found = folders.get(id)
	if (!found) continue
	const { folder, manifest } = found
	const version = entry.channels?.latest ?? manifest.version
	const short = config.short?.[id] ?? firstSentence(manifest.description)
	rows.push({
		name: manifest.name,
		line: `| [${cell(manifest.name)}](plugins/${folder}) | ${cell(version)} | ${cell(short)} |`,
	})
}
rows.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

const table = [
	`${rows.length} plugins. Tap a name for what it does and how it works.`,
	'',
	'| Plugin | Version | What it does |',
	'| ------ | ------- | ------------ |',
	...rows.map(r => r.line),
].join('\n')

const file = path.join(ROOT, 'README.md')
const text = fs.readFileSync(file, 'utf8')
const a = text.indexOf(START)
const b = text.indexOf(END)
if (a < 0 || b < a) {
	console.error(`README.md needs ${START} and ${END}`)
	process.exit(1)
}
fs.writeFileSync(file, `${text.slice(0, a + START.length)}\n${table}\n${text.slice(b)}`)
console.log(`README.md: ${rows.length} plugins`)
