import { createDiagnostics } from '../../../shared/kmmiio/diagnostics'
import { prepareFire, seedOf } from './render/fire'
import { encodeGif } from './render/gif'
import { parts } from './send'
import { state } from './state'
import { setting } from './store'
import type { Settings } from './store'

const hookText = (hook: string): string =>
	hook === 'patched'
		? 'patched'
		: hook === 'failed'
			? 'FAILED to patch'
			: 'not found yet'

/** The settings for the report. What the preview shows is left out, because it is text you typed. */
function reportedSettings(): Record<string, unknown> {
	const keys: Array<keyof Settings> = [
		'on',
		'command',
		'button',
		'chatButton',
		'style',
		'look',
		'size',
		'height',
		'background',
		'motion',
		'glow',
		'caption',
	]
	const out: Record<string, unknown> = {}
	for (const key of keys) out[key] = setting(key)
	return out
}

/** Draws a small test GIF with one picture, and says what came out. It is small because the phone is slow and the check waits for it. */
function testGif(): { ok: boolean; detail: string } {
	const started = Date.now()
	try {
		const text = 'Test'
		const prepared = prepareFire(text, {
			style: 'fire',
			look: setting('look'),
			size: 'small',
			height: 'low',
			background: 'dark',
			motion: 'off',
			glow: false,
			seed: seedOf(text),
		})
		if (!prepared)
			return { ok: false, detail: 'The test text could not be drawn' }
		const gif = encodeGif({
			width: prepared.width,
			height: prepared.height,
			palette: prepared.palette,
			frames: [prepared.frame(0)],
			delay: 7,
			transparent: prepared.transparent,
		})
		const header = String.fromCharCode(...gif.subarray(0, 6))
		const ok = header === 'GIF89a' && gif[gif.length - 1] === 0x3b
		return {
			ok,
			detail: `a small test, ${prepared.width}x${prepared.height}, 1 picture, ${Math.round(gif.length / 1024)} KB, ${Date.now() - started} ms${ok ? '' : ' (the file looks wrong)'}`,
		}
	} catch (error) {
		return {
			ok: false,
			detail: `Drawing failed: ${error instanceof Error ? error.message : String(error)}`,
		}
	}
}

/**
 * What this plugin tells the settings screen's "Copy logs" and "Run self-check".
 *
 * The report holds counts, yes/no answers and settings. It never has a message you wrote, a chat or a server.
 */
export const diag = createDiagnostics('Flame Text', {
	credit: ['Made by MarkLong0467 (https://github.com/MarkLong0467)'],
	settings: reportedSettings,
	extra: () => {
		const skipped = Object.entries(state.skipped)
			.filter(([, count]) => count > 0)
			.map(([reason, count]) => `${reason} ${count}`)
		return [
			`Message module (sendMessage): ${state.sendModule ? 'found' : 'not found yet'}; patch ${hookText(state.sendHook)}`,
			`Discord's file code (writeFile): ${state.fileModule ? 'found' : 'not found yet'}; upload object (CloudUpload): ${state.uploadModule ? 'found' : 'not found yet'}; upload platform number: ${state.platform}; upload object search: ${state.uploadSearch}`,
			`Messages looked at while on: ${state.seen}; sent as flame GIFs: ${state.flamed}; sent as plain text on purpose: ${skipped.length ? skipped.join(', ') : 'none'}`,
			`Problems: ${state.failed}; sent as plain text because the GIF failed: ${state.fellBack}; the step the last GIF reached: ${state.stage}`,
			`Last GIF: ${state.lastSize ? `${state.lastSize}, ${state.lastFrames} pictures, ${Math.round(state.lastBytes / 1024)} KB, made in ${state.lastMs} ms` : 'none yet'}`,
			`Last problem: ${state.lastError || 'none'}`,
			`Command: module ${state.commandModule ? 'found' : 'not found yet'}; patch ${hookText(state.commandHook)}; Discord asked for its commands ${state.listCalls} time(s) and /flame was in the answer ${state.listWithOurs} time(s); copied the kind from roll-dice: ${state.kindCopied ? 'yes' : 'no'}; run ${state.commandRuns} time(s)`,
			`+ menu: watched ${state.jsx ? 'yes' : 'no'}; menu seen ${state.actionsSeen ? 'yes' : 'not yet'}; Flame Typing row added ${state.buttonDrawn} time(s); tapped ${state.buttonTaps} time(s)`,
			`Switched on or off ${state.toggles} time(s); previews drawn in the settings: ${state.previews}`,
			`Chat box button: patched ${state.chatWatched ? 'yes' : 'no'}; chat box buttons found ${state.chatSeen ? 'yes' : 'not yet'}; put in the row ${state.chatDrawn} time(s); tapped ${state.chatTaps} time(s) (${state.chatDoubled} doubled press(es) ignored); the row was drawn ${state.chatCalls} time(s), no button list found in it ${state.chatNoRow} time(s); put in place: ${state.chatHow || 'not yet'}`,
			`Chat box button state: stored ${setting('on') ? 'on' : 'off'}; the button last drew ${state.chatShown === null ? 'nothing yet' : state.chatShown ? 'on' : 'off'}`,
			`Last thing that happened: ${state.last || 'nothing yet'}`,
		]
	},
	checks: () => {
		const test = testGif()
		parts()
		return [
			{
				ok: test.ok,
				label: 'A flame GIF can be drawn',
				detail: test.detail,
			},
			{
				ok: state.sendHook === 'patched',
				label: 'Your messages can be turned into GIFs when you send',
				detail:
					state.sendHook === 'failed'
						? 'The message module was found but could not be changed'
						: 'Open a chat once so Discord loads it',
			},
			{
				ok: state.fileModule,
				label: 'Discord’s file code was found',
				detail:
					'Without it the GIF cannot be saved to send. Open a chat and try again; if it stays missing, Discord changed',
			},
			{
				ok: state.uploadModule,
				label: 'Discord’s upload object was found',
				detail: `Without it the GIF cannot be attached. ${state.uploadSearch}`,
			},
			{
				ok: true,
				label: `Upload platform number: ${state.platform === 'not found' ? 'not found, 0 is used, which is what a phone uses' : state.platform}`,
			},
			{
				ok: state.failed === 0,
				label: 'No GIF has failed since the plugin started',
				detail: state.lastError || undefined,
			},
			{
				ok: !setting('command') || state.commandHook === 'patched',
				label: '/flame was added to the / menu',
				detail:
					state.commandHook === 'failed'
						? 'The list was found but could not be changed'
						: 'Open the / menu in a chat once',
			},
			{
				ok:
					!setting('command') ||
					state.listCalls === 0 ||
					state.listWithOurs > 0,
				label: 'Discord’s answer included /flame',
				detail:
					'If this fails, Discord changed how it asks for built-in commands',
			},
			{
				ok: !setting('button') || state.jsx,
				label: 'The + menu can be watched for',
				detail: 'The JSX runtime could not be hooked',
			},
			{
				ok: !setting('chatButton') || state.chatSeen,
				label: 'The chat box buttons were found and got the flame button',
				detail:
					'Open a chat. If it never shows, Discord moved the chat box buttons and the button cannot be added',
			},
			{
				ok: !setting('button') || state.actionsSeen,
				label: 'The + menu was seen and got its Flame Typing row',
				detail:
					'Tap the + in a chat once. If it never shows, Discord changed the + menu and the row cannot be added',
			},
		]
	},
})
