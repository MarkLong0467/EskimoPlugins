'use strict'

/** Tests for Pastelize. Run with: node tests/pastelize.test.cjs (build first: `bun run test` does it). */

const { createReporter } = require('./lib/harness.cjs')
const { startPort, textOf, sleep } = require('./lib/ports.cjs')

const { check, done } = createReporter('Pastelize')

/** The colour the chat takes for a hue, worked out here a second way (through chroma, not through the plugin's formula). */
function expected(hue, saturation = 0.75, lightness = 0.6) {
	const c = (1 - Math.abs(2 * lightness - 1)) * saturation
	const x = c * (1 - Math.abs(((hue / 60) % 2) - 1))
	const m = lightness - c / 2
	const [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(hue / 60) % 6].map(part => Math.round((part + m) * 255))
	return { native: (0xff000000 | (r << 16) | (g << 8) | b) | 0, rgb: (r << 16) | (g << 8) | b, hex: `#${[r, g, b].map(part => part.toString(16).padStart(2, '0')).join('')}` }
}

/** Published results of MurmurHash3 (32 bits, seed 0). */
const HASHES = { test: 0xba6bd213, 'Hello, world!': 0xc0363e43, 'The quick brown fox jumps over the lazy dog': 0x2e4ff723 }

;(async () => {
	let RowManager
	/** What Discord would make for a message: the row's data, before the plugin touches it. */
	let next
	const s = await startPort('pastelize', {
		before: runtime => {
			RowManager = class RowManager {
				generate(input) {
					this.last = input
					return next
				}
			}
			runtime.finders.loadModule({ default: RowManager })
		},
	})
	check('the plugin starts without errors', s.errors.length === 0, s.errors)
	check('every hook returned what Valenced needs', s.violations.length === 0, s.violations)
	await sleep(10)

	const manager = new RowManager()
	const generate = (data, record = {}) => {
		next = { message: data }
		return manager.generate({ rowType: 1, message: record }).message
	}
	const plain = (id, more = {}) => ({ authorId: id, username: 'someone', roleColor: null, usernameColor: -1, colorString: -1, shouldShowRoleOnName: false, content: [], ...more })

	// The colours.
	for (const [key, hash] of Object.entries(HASHES)) {
		const row = generate(plain(key))
		check(`"${key}" gets the colour of its MurmurHash3`, row.usernameColor === expected(hash % 360).native, [row.usernameColor, expected(hash % 360).native])
	}
	let row = generate(plain('test'))
	check('the colour is set everywhere the chat reads it', row.roleColor === row.usernameColor && row.colorString === row.usernameColor && row.shouldShowRoleOnName === true)
	check('this is the same object Discord made, and `this` was kept', manager.last.rowType === 1)
	check('two people get two colours', generate(plain('1')).usernameColor !== generate(plain('2')).usernameColor)
	check('one person always gets the same colour', generate(plain('1')).usernameColor === generate(plain('1')).usernameColor)

	// Role colours.
	row = generate(plain('test', { roleColor: -65536, usernameColor: -65536, colorString: -65536 }), { colorString: '#ff0000' })
	check('a name with a role colour keeps it', row.usernameColor === -65536 && row.roleColor === -65536)
	row = generate(plain('test', { shouldShowRoleDot: true, roleColors: null }))
	check('with role colours shown as a dot, the colour still goes on the name', row.shouldShowRoleOnName === true && row.shouldShowRoleDot === false)
	s.api.jsonStorage.set({ everyone: true })
	row = generate(plain('test', { roleColor: -65536, usernameColor: -65536, colorString: -65536, roleColors: { primaryColor: 1 } }), { colorString: '#ff0000' })
	check('with "Colour everyone" it is recoloured, and a gradient is dropped', row.usernameColor === expected(HASHES.test % 360).native && row.roleColors === null, row)
	s.api.jsonStorage.set({ everyone: false })

	// Webhooks.
	row = generate(plain('999', { username: 'test' }), { webhookId: '555' })
	check('a webhook is coloured by the name it posts under', row.usernameColor === expected(HASHES.test % 360).native)
	s.api.jsonStorage.set({ webhookName: false })
	row = generate(plain('999', { username: 'someone' }), { webhookId: 'test' })
	check('or by its ID', row.usernameColor === expected(HASHES.test % 360).native)
	s.api.jsonStorage.set({ webhookName: true })

	// Replies.
	row = generate(plain('1', { referencedMessage: { message: plain('test') } }))
	check('the name on the reply line is coloured too', row.referencedMessage.message.colorString === expected(HASHES.test % 360).native)
	row = generate(plain('1', { referencedMessage: { message: plain('test', { roleColor: -65536, colorString: -65536 }) } }))
	check('unless it has a role colour', row.referencedMessage.message.colorString === -65536)

	// Mentions.
	const mention = (more = {}) => ({ type: 'mention', userId: 'test', ...more })
	const soft = expected(HASHES.test % 360, 0.85, 0.75)
	row = generate(plain('1', { content: [{ type: 'text', content: 'hi ' }, mention(), { type: 'strong', content: [mention()] }, mention({ colorString: '#ff0000', color: 1 })] }))
	check('a mention of someone with no role colour is coloured', row.content[1].colorString === soft.hex && row.content[1].color === soft.rgb && row.content[1].roleColor === soft.rgb, row.content[1])
	check('also one inside other formatting', row.content[2].content[0].colorString === soft.hex)
	check('a mention that has a role colour keeps it', row.content[3].colorString === '#ff0000' && row.content[3].color === 1)
	s.api.jsonStorage.set({ mentions: false })
	row = generate(plain('1', { content: [mention()] }))
	check('with mentions off they are left alone', row.content[0].colorString === undefined)
	s.api.jsonStorage.set({ mentions: true })

	// Rows that are not messages.
	next = { separator: true }
	check('a row that is not a message is passed through', manager.generate({ rowType: 2 }) === next)
	next = { message: { content: [] } }
	check('so is a message with no author', manager.generate({ rowType: 1 }).message.usernameColor === undefined)
	next = undefined
	check('and a row Discord did not make', manager.generate({ rowType: 1 }) === undefined)

	// The settings.
	const settings = await s.mountSettings()
	const settingsText = textOf(settings.tree)
	check('the settings have the switches and a preview', /Colour everyone/.test(settingsText) && /Colour mentions/.test(settingsText) && /Wumpus/.test(settingsText))
	check('the settings list what was found', /names/.test(settingsText) && /What it found/.test(settingsText), settingsText.slice(-200))

	s.stop()
	row = generate(plain('test'))
	check('after stopping names are left as Discord made them', row.usernameColor === -1 && row.shouldShowRoleOnName === false)
	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})
