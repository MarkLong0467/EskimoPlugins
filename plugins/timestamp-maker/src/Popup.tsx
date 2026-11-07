import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { lookupModule } from '@valenced/modules/finders'
import { withProps } from '@valenced/modules/finders/filters'
import { useEffect, useMemo, useState } from 'react'
import { ScrollView, useWindowDimensions, View } from 'react-native'
import { openToast } from '../../../shared/kmmiio/toast'
import { copyText, insertText, openChannelId, sendText } from './deliver'
import { diag } from './diag'
import { state } from './state'
import { addRecent, clearRecents, setting, update } from './store'
import {
	compose,
	isStyle,
	JUMPS,
	offsetName,
	partsOf,
	preview,
	QUICK_PICKS,
	readout,
	readTime,
	relative,
	STYLES,
	shift,
	styleName,
	tag,
	zoneName,
} from './time'
import type { ComponentType } from 'react'
import type { Action } from './store'
import type { Jump, Style, Zone } from './time'

/** The key of the sheet, so it can be closed again. */
const SHEET_KEY = 'MARKLONG_TIMESTAMP_MAKER'
const TOAST_KEY = 'MARKLONG_TIMESTAMP_MAKER_TOAST'

/** Texts as constants because React Native text must be passed as an expression. */
const TITLE = 'Timestamp'
const SUBTITLE =
	'Everyone sees it in their own time zone and language. Pick a time, pick how it looks.'
const WHEN_HINT =
	'Type it any way: tomorrow 9am, in 2 hours, friday 8pm, 25 dec 18:00, 2026-12-25'
const BAD_TIME = 'I could not read that. Try “tomorrow 9am” or “in 2 hours”.'
const PREVIEW_NOTE = 'Looks like this in chat (your phone’s time zone)'
const RAW_NOTE = 'What gets sent'
const CHOOSE_STYLE = 'How it looks'
const EXTRAS = 'Extras'
const MESSAGE_HINT =
	'Text around it, for example “Meeting starts {time}”. Without {time} the timestamp goes on the end.'
const QUICK = 'Quick picks'
const FINE_TUNE = 'Fine tune'
const JUMP_TITLE = 'Jump ahead or back'
const JUMP_HINT =
	'Moves the time you have now by this much. Tap more than once to go further.'
const LATER = 'LATER'
const EARLIER = 'EARLIER'
const ZONE_HINT =
	'The clock you are typing in. The timestamp itself is the same moment for everybody.'
const ZONE_TITLE = 'Time zone'
const CHECK = '✓'
const RECENT = 'Recent'

/**
 * The scroll view that works inside a bottom sheet. A plain `ScrollView` in a sheet loses the drag to the sheet's own gesture, so
 * the list stops scrolling; Discord's sheets use the bottom-sheet library's `BottomSheetScrollView`, found here by name. Nothing
 * when it is not found, and the plain one is used.
 */
function sheetScroller(): ComponentType<Record<string, unknown>> | undefined {
	try {
		const found = lookupModule(
			withProps('BottomSheetScrollView'),
		) as unknown as unknown[]
		const exports = found[0] as { BottomSheetScrollView?: unknown } | undefined
		const view = exports?.BottomSheetScrollView
		state.sheetScroller = view
			? 'bottom sheet scroll view'
			: 'plain scroll view'
		return view ? (view as ComponentType<Record<string, unknown>>) : undefined
	} catch (error) {
		state.sheetScroller = 'plain scroll view (lookup failed)'
		diag.fail('find sheet scroll view', error)
		return undefined
	}
}

/** Closes the sheet. */
function close(): void {
	try {
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
	} catch (error) {
		diag.fail('close popup', error)
	}
}

/** The start of the current minute, so the time is not a few seconds off by the time it is sent. */
const thisMinute = (): number => Math.floor(Date.now() / 60000) * 60000

/** A row with a name, the value and two buttons that move it down and up. */
function Stepper({
	label,
	value,
	onDown,
	onUp,
}: {
	label: string
	value: string
	onDown: () => void
	onUp: () => void
}) {
	return (
		<View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
			<View style={{ width: 74 }}>
				<Design.Text variant="text-sm/semibold" color="text-muted">
					{label}
				</Design.Text>
			</View>
			<Design.Button text="−" variant="secondary" size="sm" onPress={onDown} />
			<View style={{ flex: 1, alignItems: 'center' }}>
				<Design.Text variant="text-md/semibold">{value}</Design.Text>
			</View>
			<Design.Button text="+" variant="secondary" size="sm" onPress={onUp} />
		</View>
	)
}

/** What the popup is opened with. */
export interface PopupProps {
	/** The chat the timestamp goes to. */
	channelId?: string
	/** Words for the time, if the command was given them. */
	when?: string
	/** The style to start with, if the command was given one. */
	style?: string
}

/** The popup: pick a moment, pick a style, and send, add or copy it. */
function Popup({ channelId, when: typed, style: startStyle }: PopupProps) {
	const remember = setting('remember')
	const h24 = setting('h24')
	const startingZone = setting('zone')

	const [zone, setZone] = useState<Zone>(startingZone)
	const [when, setWhen] = useState<number>(() => {
		const read = typed
			? readTime(typed, Date.now(), {
					zone: startingZone,
					order: setting('order'),
					rollForward: setting('rollForward'),
				})
			: undefined
		return read ?? thisMinute()
	})
	const [style, setStyle] = useState<Style>(() =>
		isStyle(startStyle) ? startStyle : remember ? setting('style') : 'f',
	)
	const [alsoRelative, setAlsoRelative] = useState(
		remember ? setting('alsoRelative') : false,
	)
	const [code, setCode] = useState(remember ? setting('code') : false)
	const [message, setMessage] = useState(remember ? setting('message') : '')
	const [words, setWords] = useState(typed ?? '')
	const [bad, setBad] = useState(false)
	const screen = useWindowDimensions()
	const sheetScroll = useMemo(() => sheetScroller(), [])
	const Scroller = sheetScroll ?? ScrollView
	const [now, setNow] = useState(Date.now())
	const [, redraw] = useState(0)

	// The relative style counts live, so the preview moves.
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 15000)
		return () => clearInterval(timer)
	}, [])

	const channel = channelId ?? openChannelId()
	const step = setting('minuteStep')
	const options = { style, alsoRelative, code, message }
	const text = useMemo(
		() => compose(when, options),
		[when, style, alsoRelative, code, message],
	)
	const shown = readout(when, zone, h24)
	const whenLine = `${shown.date} · ${shown.time}`

	const move = (
		unit: 'year' | 'month' | 'day' | 'hour' | 'minute',
		amount: number,
	) => {
		setWhen(current => shift(current, zone, unit, amount))
		setWords('')
		setBad(false)
	}

	const read = (value: string) => {
		setWords(value)
		if (!value.trim()) {
			setBad(false)
			return
		}
		const moment = readTime(value, Date.now(), {
			zone,
			order: setting('order'),
			rollForward: setting('rollForward'),
		})
		if (moment === undefined) {
			setBad(true)
			return
		}
		setBad(false)
		setWhen(moment)
	}

	const pick = (value: string) => {
		const moment = readTime(value, Date.now(), {
			zone,
			order: setting('order'),
			rollForward: false,
		})
		if (moment !== undefined) {
			setWhen(moment)
			setWords('')
			setBad(false)
		}
	}

	const changeZone = (next: Zone) => {
		setZone(next)
		update({ zone: next })
	}
	const zoneOffset =
		zone === 'device' ? -new Date(when).getTimezoneOffset() : zone

	const finish = (action: Action) => {
		if (bad) return
		let toast = ''
		if (action === 'send') {
			if (!sendText(channel, text)) {
				openToast(TOAST_KEY, 'Could not send. Open a chat and try again')
				return
			}
			toast = 'Timestamp sent'
		} else if (action === 'insert') {
			const way = insertText(channel, text)
			if (!way) {
				openToast(TOAST_KEY, 'Could not add it to the message')
				return
			}
			toast =
				way === 'copy'
					? 'Copied. Paste it into your message'
					: 'Added to your message'
		} else {
			if (!copyText(text)) {
				openToast(TOAST_KEY, 'Could not copy')
				return
			}
			toast = 'Copied'
		}
		addRecent(when, style)
		if (remember) update({ style, alsoRelative, code, message })
		close()
		openToast(TOAST_KEY, toast)
	}

	const primary = setting('action')
	const labels: Record<Action, string> = {
		send: 'Send',
		insert: 'Add to message',
		copy: 'Copy',
	}
	const others = (['send', 'insert', 'copy'] as Action[]).filter(
		a => a !== primary,
	)
	const disabled = (action: Action) => bad || (action !== 'copy' && !channel)

	const recents = setting('recents')
	const sample = preview(when, style === 'R' ? 'F' : style, h24, now)
	const big = style === 'R' ? relative(when, now) : sample
	const detail =
		style === 'R' ? preview(when, 'F', h24, now) : relative(when, now)
	const sentLine =
		alsoRelative && style !== 'R' ? `${big} (${relative(when, now)})` : big

	const jump = (unit: Jump['unit'], amount: number) => {
		setWhen(current => shift(current, zone, unit, amount))
		setWords('')
		setBad(false)
	}

	return (
		<Design.ActionSheet scrollable>
			<Scroller
				style={
					sheetScroll
						? undefined
						: { maxHeight: Math.round(screen.height * 0.78) }
				}
				nestedScrollEnabled
				keyboardShouldPersistTaps="handled"
				showsVerticalScrollIndicator={false}
			>
				<View style={{ padding: 16, paddingBottom: 40, gap: 16 }}>
					<View style={{ gap: 2 }}>
						<Design.Text variant="heading-lg/bold">{TITLE}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{SUBTITLE}
						</Design.Text>
					</View>

					<Design.Card>
						<View style={{ gap: 6 }}>
							<Design.Text variant="text-xs/bold" color="text-muted">
								{PREVIEW_NOTE}
							</Design.Text>
							<Design.Text variant="heading-lg/bold" color="text-brand">
								{sentLine}
							</Design.Text>
							<Design.Text variant="text-sm/medium" color="text-muted">
								{detail}
							</Design.Text>
							<View style={{ height: 6 }} />
							<Design.Text variant="text-xs/bold" color="text-muted">
								{RAW_NOTE}
							</Design.Text>
							<Design.Text variant="text-sm/medium" selectable>
								{text}
							</Design.Text>
						</View>
					</Design.Card>

					<View style={{ gap: 6 }}>
						<Design.TextInput
							label="When"
							placeholder="tomorrow 9am"
							size="md"
							value={words}
							onChange={read}
						/>
						<Design.Text
							variant="text-sm/medium"
							color={bad ? 'text-danger' : 'text-muted'}
						>
							{bad ? BAD_TIME : WHEN_HINT}
						</Design.Text>
					</View>

					{setting('quickPicks') ? (
						<View style={{ gap: 8 }}>
							<Design.Text variant="text-md/semibold">{QUICK}</Design.Text>
							<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
								{QUICK_PICKS.map(item => (
									<Design.Button
										key={item.label}
										text={item.label}
										variant="secondary"
										size="sm"
										onPress={() => pick(item.when)}
									/>
								))}
							</View>
						</View>
					) : null}

					<View style={{ gap: 10 }}>
						<Design.Text variant="text-md/semibold">{FINE_TUNE}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{whenLine}
						</Design.Text>
						<Stepper
							label="Year"
							value={String(readYear(when, zone))}
							onDown={() => move('year', -1)}
							onUp={() => move('year', 1)}
						/>
						<Stepper
							label="Month"
							value={readMonth(when, zone)}
							onDown={() => move('month', -1)}
							onUp={() => move('month', 1)}
						/>
						<Stepper
							label="Day"
							value={String(readDay(when, zone))}
							onDown={() => move('day', -1)}
							onUp={() => move('day', 1)}
						/>
						<Stepper
							label="Hour"
							value={readHour(when, zone, h24)}
							onDown={() => move('hour', -1)}
							onUp={() => move('hour', 1)}
						/>
						<Stepper
							label="Minute"
							value={readMinute(when, zone)}
							onDown={() => move('minute', -step)}
							onUp={() => move('minute', step)}
						/>
					</View>

					<View style={{ gap: 8 }}>
						<Design.Text variant="text-md/semibold">{JUMP_TITLE}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{JUMP_HINT}
						</Design.Text>
						<Design.Text variant="text-xs/bold" color="text-muted">
							{LATER}
						</Design.Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
							{JUMPS.map(item => (
								<Design.Button
									key={`later-${item.label}`}
									text={`+ ${item.label}`}
									variant="secondary"
									size="sm"
									onPress={() => jump(item.unit, item.amount)}
								/>
							))}
						</View>
						<Design.Text variant="text-xs/bold" color="text-muted">
							{EARLIER}
						</Design.Text>
						<View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
							{JUMPS.map(item => (
								<Design.Button
									key={`earlier-${item.label}`}
									text={`− ${item.label}`}
									variant="tertiary"
									size="sm"
									onPress={() => jump(item.unit, -item.amount)}
								/>
							))}
						</View>
					</View>

					<View style={{ gap: 8 }}>
						<Design.Text variant="text-md/semibold">{CHOOSE_STYLE}</Design.Text>
						<Design.TableRowGroup>
							{STYLES.map(item => (
								<Design.TableRow
									key={item.id}
									label={preview(when, item.id, h24, now)}
									subLabel={`${item.name} · ${tag(when, item.id)}`}
									trailing={
										style === item.id ? (
											<Design.Text variant="text-md/bold" color="text-brand">
												{CHECK}
											</Design.Text>
										) : undefined
									}
									onPress={() => setStyle(item.id)}
								/>
							))}
						</Design.TableRowGroup>
					</View>

					<View style={{ gap: 8 }}>
						<Design.Text variant="text-md/semibold">{EXTRAS}</Design.Text>
						<Design.TableRowGroup>
							<Design.TableSwitchRow
								label="Also show how long from now"
								subLabel="Adds the relative style after it, like (in 2 hours)"
								value={alsoRelative && style !== 'R'}
								onValueChange={(on: boolean) => setAlsoRelative(on)}
							/>
							<Design.TableSwitchRow
								label="Show the raw tag"
								subLabel="Wraps it in backticks so chat shows the tag as text instead of a time"
								value={code}
								onValueChange={(on: boolean) => setCode(on)}
							/>
						</Design.TableRowGroup>
						<Design.TextInput
							label="Message"
							placeholder="Meeting starts {time}"
							size="md"
							value={message}
							onChange={setMessage}
						/>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{MESSAGE_HINT}
						</Design.Text>
					</View>

					<View style={{ gap: 8 }}>
						<Design.Text variant="text-md/semibold">{ZONE_TITLE}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{ZONE_HINT}
						</Design.Text>
						<Stepper
							label="Zone"
							value={zone === 'device' ? 'Phone' : offsetName(zone)}
							onDown={() => changeZone(clampZone(zoneOffset - 30))}
							onUp={() => changeZone(clampZone(zoneOffset + 30))}
						/>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{zoneName(zone, when)}
						</Design.Text>
						{zone !== 'device' ? (
							<Design.Button
								text="Use this phone’s time zone"
								variant="tertiary"
								size="sm"
								onPress={() => changeZone('device')}
							/>
						) : null}
					</View>

					{recents.length ? (
						<View style={{ gap: 8 }}>
							<Design.Text variant="text-md/semibold">{RECENT}</Design.Text>
							<Design.TableRowGroup>
								{recents.map(item => (
									<Design.TableRow
										key={`${item.at}:${item.style}`}
										label={preview(item.at, item.style, h24, now)}
										subLabel={`${styleName(item.style)} · ${tag(item.at, item.style)}`}
										onPress={() => {
											setWhen(item.at)
											setStyle(item.style)
											setWords('')
											setBad(false)
										}}
									/>
								))}
							</Design.TableRowGroup>
							<Design.Button
								text="Clear recent"
								variant="tertiary"
								size="sm"
								onPress={() => {
									clearRecents()
									redraw(n => n + 1)
								}}
							/>
						</View>
					) : null}

					<View style={{ gap: 10 }}>
						<Design.Button
							text={labels[primary]}
							variant="primary"
							size="md"
							disabled={disabled(primary)}
							onPress={() => finish(primary)}
						/>
						<View style={{ flexDirection: 'row', gap: 10 }}>
							{others.map(action => (
								<View key={action} style={{ flex: 1 }}>
									<Design.Button
										text={labels[action]}
										variant="secondary"
										size="md"
										disabled={disabled(action)}
										onPress={() => finish(action)}
									/>
								</View>
							))}
						</View>
						<Design.Button
							text="Cancel"
							variant="tertiary"
							size="md"
							onPress={close}
						/>
					</View>
				</View>
			</Scroller>
		</Design.ActionSheet>
	)
}

const clampZone = (minutes: number): Zone =>
	Math.max(-12 * 60, Math.min(14 * 60, minutes))

const MONTH_NAMES = [
	'Jan',
	'Feb',
	'Mar',
	'Apr',
	'May',
	'Jun',
	'Jul',
	'Aug',
	'Sep',
	'Oct',
	'Nov',
	'Dec',
]
const readYear = (moment: number, zone: Zone): number =>
	partsOf(moment, zone).year
const readMonth = (moment: number, zone: Zone): string =>
	MONTH_NAMES[partsOf(moment, zone).month] ?? ''
const readDay = (moment: number, zone: Zone): number =>
	partsOf(moment, zone).day
const readMinute = (moment: number, zone: Zone): string =>
	String(partsOf(moment, zone).minute).padStart(2, '0')
function readHour(moment: number, zone: Zone, h24: boolean): string {
	const p = partsOf(moment, zone)
	if (h24) return String(p.hour).padStart(2, '0')
	return `${p.hour % 12 === 0 ? 12 : p.hour % 12} ${p.hour < 12 ? 'AM' : 'PM'}`
}

/**
 * Opens the popup.
 *
 * @param props The chat, and the words and style the command was given.
 */
export function openPopup(props: PopupProps): void {
	try {
		state.popups++
		ActionSheetActionCreators.openLazy(
			Promise.resolve({ default: () => <Popup {...props} /> }),
			SHEET_KEY,
			{},
		)
		state.last = 'opened the popup'
		diag.log('popup', 'Opened the popup')
	} catch (error) {
		state.last = 'the popup failed to open'
		diag.fail('open popup', error)
	}
}
