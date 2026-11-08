import { Design } from '@valenced/discord/design'
import { useEffect, useRef, useState } from 'react'
import { Image, Pressable, ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { makeGif, whyNot } from './flame'
import { state } from './state'
import { setting, store } from './store'
import { switchFlame } from './toggle'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Made } from './flame'
import type { Settings as FlameSettings } from './store'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: FlameSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Turns the words you send into a burning, animated GIF of your text on fire. Switch it on, type a message and send it: the GIF goes out instead of the text. Switch it on and off with the Flame Typing row in the + menu, or with /flame if you turn that on. The GIF is drawn on your phone, nothing is sent anywhere to make it.'
const TOAST_KEY = 'MARKLONG_FLAME_TEXT_SETTINGS'
const PREVIEW_PLACEHOLDER = 'Type something to see it burn'
const PREVIEW_LIMIT = 300
const PREVIEW_TITLE = 'Preview'
const LOOK_TITLE = 'Look'

/** One choice among a few. */
interface Choice<T> {
	value: T
	label: string
}

const STYLES: Array<Choice<FlameSettings['style']>> = [
	{ value: 'fire', label: 'Fire' },
	{ value: 'blue', label: 'Blue' },
	{ value: 'green', label: 'Green' },
	{ value: 'purple', label: 'Purple' },
]
const LOOKS: Array<Choice<FlameSettings['look']>> = [
	{ value: 'classic', label: 'Classic' },
	{ value: 'wild', label: 'Wild' },
]
const SIZES: Array<Choice<FlameSettings['size']>> = [
	{ value: 'small', label: 'Small' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'large', label: 'Large' },
]
const HEIGHTS: Array<Choice<FlameSettings['height']>> = [
	{ value: 'low', label: 'Low' },
	{ value: 'medium', label: 'Medium' },
	{ value: 'high', label: 'High' },
]
const BACKGROUNDS: Array<Choice<FlameSettings['background']>> = [
	{ value: 'dark', label: 'Dark' },
	{ value: 'white', label: 'White' },
	{ value: 'transparent', label: 'See-through' },
]
const MOTIONS: Array<Choice<FlameSettings['motion']>> = [
	{ value: 'off', label: 'Still' },
	{ value: 'light', label: 'Light' },
	{ value: 'normal', label: 'Normal' },
	{ value: 'smooth', label: 'Smooth' },
]

const BACKDROPS: Record<FlameSettings['background'], string> = {
	dark: '#160c0c',
	white: '#ffffff',
	transparent: '#313338',
}

/** A row of choices to pick one from. */
function Chips<T extends string | number>({
	title,
	hint,
	options,
	value,
	onPick,
}: {
	title: string
	hint?: string
	options: Array<Choice<T>>
	value: T
	onPick: (value: T) => void
}) {
	return (
		<View style={{ gap: 8 }}>
			<Design.Text variant="text-md/semibold">{title}</Design.Text>
			<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
				{options.map(option => {
					const picked = option.value === value
					return (
						<Pressable
							key={String(option.value)}
							accessibilityRole="button"
							accessibilityLabel={option.label}
							accessibilityState={{ selected: picked }}
							onPress={() => onPick(option.value)}
							style={{
								paddingHorizontal: 14,
								paddingVertical: 8,
								borderRadius: 999,
								borderWidth: 1.5,
								borderColor: picked ? '#ff6a00' : 'rgba(128,128,128,0.3)',
								backgroundColor: picked
									? 'rgba(255,106,0,0.22)'
									: 'rgba(128,128,128,0.12)',
							}}
						>
							<Design.Text variant="text-sm/semibold">
								{option.label}
							</Design.Text>
						</Pressable>
					)
				})}
			</View>
			{hint ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{hint}
				</Design.Text>
			) : null}
		</View>
	)
}

/** The headline: how it is going. */
function headline(): { label: string; detail: string } {
	if (state.sendHook === 'failed')
		return {
			label: 'Something is not working',
			detail:
				'Your messages cannot be turned into GIFs. Press Copy logs below and send the report.',
		}
	if (state.failed > 0 && state.lastError)
		return {
			label: 'The last GIF did not work',
			detail: `${state.lastError}. Press Copy logs below and send the report.`,
		}
	if (setting('on'))
		return {
			label: 'On',
			detail: 'Your messages are sent as burning GIFs.',
		}
	return {
		label: 'Off',
		detail: 'Your messages are sent as normal text. Turn it on below.',
	}
}

/** The GIF drawn for the words in the box, drawn again when the words or the look change. */
function Preview({ text, seed }: { text: string; seed: number }) {
	const [made, setMade] = useState<Made | undefined>()
	const [busy, setBusy] = useState(false)
	const [problem, setProblem] = useState('')
	const turn = useRef(0)
	const look = [
		setting('style'),
		setting('look'),
		setting('size'),
		setting('height'),
		setting('background'),
		setting('motion'),
		setting('glow'),
	].join()

	useEffect(() => {
		const mine = ++turn.current
		const clean = text.trim()
		if (clean === '') {
			setMade(undefined)
			setBusy(false)
			setProblem('')
			return
		}
		const reason = whyNot({ content: clean }, undefined)
		if (reason === 'unsupported' || reason === 'toobig') {
			setMade(undefined)
			setBusy(false)
			setProblem(
				reason === 'unsupported'
					? 'The flame font has no letter for something in this text, such as an emoji. Messages like this are sent as normal text.'
					: 'That would make a picture that is too big.',
			)
			return
		}
		setBusy(true)
		setProblem('')
		const wait = setTimeout(() => {
			makeGif(clean, seed)
				.then(result => {
					if (turn.current !== mine) return
					state.previews++
					setMade(result)
					setBusy(false)
				})
				.catch(error => {
					if (turn.current !== mine) return
					diag.fail('preview', error)
					setProblem('The preview could not be drawn. Press Copy logs below.')
					setBusy(false)
				})
		}, 450)
		return () => clearTimeout(wait)
	}, [text, seed, look])

	const ratio = made ? made.width / made.height : 3
	const facts = made
		? `${made.width} × ${made.height}, ${made.frames} picture${made.frames === 1 ? '' : 's'}, ${Math.max(1, Math.round(made.bytes.length / 1024))} KB, drawn in ${(made.ms / 1000).toFixed(1)} s`
		: ''
	return (
		<View style={{ gap: 8 }}>
			<View
				style={{
					borderRadius: 16,
					overflow: 'hidden',
					backgroundColor: BACKDROPS[setting('background')],
					minHeight: 140,
					alignItems: 'center',
					justifyContent: 'center',
					padding: 8,
				}}
			>
				{made ? (
					<Image
						accessibilityLabel="Preview of the flame GIF"
						source={{ uri: `data:image/gif;base64,${made.base64}` }}
						style={{ width: '100%', aspectRatio: ratio, maxHeight: 260 }}
						resizeMode="contain"
					/>
				) : (
					<Design.Text variant="text-sm/medium" color="text-muted">
						{busy ? 'Lighting it…' : PREVIEW_PLACEHOLDER}
					</Design.Text>
				)}
			</View>
			{problem ? (
				<Design.Text variant="text-sm/medium" color="text-danger">
					{problem}
				</Design.Text>
			) : made ? (
				<Design.Text variant="text-sm/medium" color="text-muted">
					{facts}
				</Design.Text>
			) : null}
		</View>
	)
}

/** The settings screen. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [words, setWords] = useState(setting('previewText'))
	const [seed, setSeed] = useState(0)
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopDiag()
		}
	}, [])

	const status = headline()
	const set = (patch: Partial<FlameSettings>, text?: string) => {
		store.set(patch)
		diag.log('settings', Object.keys(patch).join(', '))
		if (text) openToast(TOAST_KEY, text)
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={24}>
				<IntroCard text={INTRO} />

				<Design.TableRowGroup title="Flame text">
					<Design.TableSwitchRow
						label="Turn my messages into flame GIFs"
						subLabel="While this is on, what you send becomes a burning GIF. Links, code, mentions, emoji and messages with files are sent as normal text."
						value={setting('on')}
						onValueChange={(on: boolean) => switchFlame(on, true)}
					/>
					<Design.TableRow label={status.label} subLabel={status.detail} />
				</Design.TableRowGroup>

				<View style={{ marginHorizontal: 16, gap: 12 }}>
					<Design.Text variant="text-lg/semibold">{PREVIEW_TITLE}</Design.Text>
					<Design.TextInput
						label="Try some words"
						placeholder="Flame"
						size="md"
						value={words}
						onChange={(text: string) => {
							setWords(text)
							store.set({ previewText: text.slice(0, PREVIEW_LIMIT) })
						}}
					/>
					<Preview text={words} seed={seed} />
					<Design.Button
						text="Shuffle the flames"
						variant="secondary"
						size="md"
						onPress={() => setSeed(n => n + 1)}
					/>
				</View>

				<View style={{ marginHorizontal: 16, gap: 20 }}>
					<Design.Text variant="text-lg/semibold">{LOOK_TITLE}</Design.Text>
					<Chips
						title="Style"
						hint="Classic: solid red letters with a crown of fire on top. Wild: tall flames rising off the letters."
						options={LOOKS}
						value={setting('look')}
						onPick={look => set({ look })}
					/>
					<Chips
						title="Fire"
						options={STYLES}
						value={setting('style')}
						onPick={style => set({ style })}
					/>
					<Chips
						title="Size"
						options={SIZES}
						value={setting('size')}
						onPick={size => set({ size })}
					/>
					<Chips
						title="Flame height"
						options={HEIGHTS}
						value={setting('height')}
						onPick={height => set({ height })}
					/>
					<Chips
						title="Background"
						hint="See-through looks best on a dark chat, but its edges are not as soft because a GIF cannot be half see-through."
						options={BACKGROUNDS}
						value={setting('background')}
						onPick={background => set({ background })}
					/>
					<Chips
						title="Movement"
						hint="More pictures make smoother flames, a bigger file and a longer wait before it sends."
						options={MOTIONS}
						value={setting('motion')}
						onPick={motion => set({ motion })}
					/>
				</View>

				<Design.TableRowGroup title="Glow">
					<Design.TableSwitchRow
						label="Glow around the flames"
						subLabel="A soft red light around the letters. Not used with a see-through background."
						value={setting('glow')}
						onValueChange={(glow: boolean) => set({ glow })}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Sending">
					<Design.TableSwitchRow
						label="Add the words as text"
						subLabel="Sends your words under the GIF too, so they can be searched and read aloud."
						value={setting('caption')}
						onValueChange={(caption: boolean) => set({ caption })}
					/>
				</Design.TableRowGroup>
				<Design.TableRowGroup title="Ways to switch it on and off">
					<Design.TableSwitchRow
						label="Flame Typing in the + menu"
						subLabel="Adds a Flame Typing row to the + menu in the chat box (with Camera, Photos and Poll). Tap it to switch flame text on or off."
						value={setting('button')}
						onValueChange={(button: boolean) =>
							set(
								{ button },
								button
									? 'Flame Typing is in the + menu'
									: 'Flame Typing left the + menu',
							)
						}
					/>
					<Design.TableSwitchRow
						label="/flame command"
						subLabel="Adds /flame to the slash commands. /flame switches it on or off. /flame text:hello sends one GIF without changing the switch. Off unless you turn it on."
						value={setting('command')}
						onValueChange={(command: boolean) =>
							set({ command }, command ? '/flame added' : '/flame removed')
						}
					/>
				</Design.TableRowGroup>

				<Design.TableRowGroup title="Good to know">
					<Design.TableRow
						label="Made on your phone"
						subLabel="The letters and flames are drawn by the plugin itself. No website is used and nothing leaves your phone to make the GIF."
					/>
					<Design.TableRow
						label="If it cannot make the GIF"
						subLabel="Your message is sent as the text you wrote, so nothing is lost."
					/>
					<Design.TableRow
						label="Letters"
						subLabel="Letters, numbers and the usual marks work. Accents are dropped. Emoji and other alphabets cannot be drawn, so those messages are sent as text."
					/>
					<Design.TableRow
						label="Long messages"
						subLabel="Any length works. A long message is wrapped into a paragraph, and the letters get smaller to fit. Drawing takes longer for long messages and for Smooth movement, and the GIF appears in the chat when it is ready."
					/>
				</Design.TableRowGroup>

				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
