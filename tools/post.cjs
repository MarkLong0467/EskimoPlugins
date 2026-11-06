'use strict'

/**
 * Writes `post.json`: the list of plugins for the repository thread post, made from `index.json`.
 *
 *   node tools/post.cjs <index-folder>
 *
 * `tools/publish.cjs` calls this every time it publishes, so the list always matches the index. The "Repo Post" plugin
 * reads `post.json` from the same place as `index.json` and edits the post to match.
 *
 * - every plugin in the index is listed, by name, with the version of its `latest` channel,
 * - the short line of each plugin is in `tools/post.config.json`; a plugin without one gets the first sentence of its
 *   description, cut short,
 * - the lines above and below the list are also in that file.
 */

const fs = require('node:fs')
const path = require('node:path')

/** The longest a fallback description gets (characters). */
const FALLBACK_MAX = 100

/** The first sentence of a description, cut at a word if it is long, with a lower-case start like the other lines. */
function fallbackShort(description) {
	const sentence = String(description || '').split(/(?<=[.!?])\s/)[0] || ''
	const text = sentence.replace(/\.$/, '').trim()
	if (text.length <= FALLBACK_MAX) return text
	const cut = text.slice(0, FALLBACK_MAX - 1)
	return `${cut.slice(0, cut.lastIndexOf(' ') > 40 ? cut.lastIndexOf(' ') : cut.length)}…`
}

/** Compares names the way a person sorts them: ignoring case. */
const byName = (a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase())

/**
 * Makes the contents of `post.json`.
 *
 * @param {object} index The parsed `index.json`.
 * @param {object} config The parsed `tools/post.config.json`.
 */
function makePost(index, config) {
	const plugins = Object.entries(index.plugins || {})
		.map(([id, entry]) => ({
			id,
			name: entry.name,
			version: entry.channels && entry.channels.latest ? entry.channels.latest : '',
			short: (config.short && config.short[id]) || fallbackShort(entry.description),
			suffix: (config.suffix && config.suffix[id]) || '',
		}))
		.filter(p => p.version)
		.sort(byName)
	return {
		format: 1,
		header: config.header || [],
		footer: config.footer || [],
		plugins,
	}
}

/** Writes `post.json` next to `index.json`. Returns the number of plugins listed. */
function writePost(indexDir) {
	const index = JSON.parse(fs.readFileSync(path.join(indexDir, 'index.json'), 'utf8'))
	const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'post.config.json'), 'utf8'))
	const post = makePost(index, config)
	fs.writeFileSync(path.join(indexDir, 'post.json'), `${JSON.stringify(post, null, 2)}\n`)
	return post.plugins.length
}

module.exports = { makePost, writePost, fallbackShort }

if (require.main === module) {
	const dir = process.argv[2]
	if (!dir) {
		console.error('usage: node tools/post.cjs <index-folder>')
		process.exit(1)
	}
	console.log(`post.json: ${writePost(dir)} plugins`)
}
