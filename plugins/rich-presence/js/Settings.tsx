import { Design } from '@valenced/discord/design'
import { Clipboard } from '@valenced/externals/react-native-clipboard'
import { useState } from 'react'
import { ScrollView } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import {
	addProfile,
	blankProfile,
	commit,
	newId,
	profileFromJson,
	toggleProfile,
} from './actions'
import { applyAll, clearAll, planNow, standingOf } from './apply'
import { MAX_ACTIVE_LIMIT, STANDING_TEXT, TIME_MODES, TYPES } from './constants'
import { diag } from './diag'
import EditProfile from './EditProfile'
import Field from './Field'
import { HomePreview } from './Preview'
import {
	maxActive,
	merge,
	newSoundCloudProfile,
	soundCloudProfile,
} from './profiles'
import SoundCloudEditor from './SoundCloudEditor'
import { setStorage, toast } from './state'
import { block, group, part, radio, row, section, toggleRow } from './ui'
import { warnings } from './warnings'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { Profile, RichPresenceSettings } from './types'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: RichPresenceSettings }>
>

/** The note under the switches: why several presences need different Application IDs. */
const DIFFERENT_IDS_NOTE =
	'Turning on more than one? Each one needs a different Application ID or Discord shows them as one. Leave the ID empty and a different one is made up for each presence. If you type your own, use a different ID in each.'

/** A line that says what a presence is, for the list. */
function summary(p: Profile): string {
	if (p.kind === 'soundcloud') return 'Listening to SoundCloud'
	const type = TYPES.filter(t => t.v === Number(p.type))[0]?.l ?? 'Playing'
	const timer = TIME_MODES.filter(t => t.v === p.timestampMode)[0]
	return p.timestampMode === 'none' ? type : `${type} · ${timer?.l ?? 'timer'}`
}

/**
 * The settings screen. It has two levels. The list of presences comes first: a switch for each (up to three can be on), the
 * note about Application IDs, a row for each to open its editor, adding and pasting presences, the general settings and the
 * actions. Tapping a presence opens its own editor; the SoundCloud presence opens the SoundCloud settings alone.
 */
export default function Settings({ api }: Props) {
	const store = api.jsonStorage
	setStorage(store)
	const settings = merge(store.use() as Partial<RichPresenceSettings>)
	const [editing, setEditing] = useState<string | null>(null)
	const chosen = settings.profiles.find(p => p.id === editing)

	if (chosen)
		return chosen.kind === 'soundcloud' ? (
			<SoundCloudEditor
				profile={chosen}
				settings={settings}
				onBack={() => setEditing(null)}
			/>
		) : (
			<EditProfile
				key={chosen.id}
				profile={chosen}
				settings={settings}
				onBack={() => setEditing(null)}
			/>
		)

	const { shown } = planNow(settings)
	const limit = maxActive(settings)
	const hasSoundCloud = !!soundCloudProfile(settings)

	/** Adds a profile and opens it, so it can be filled in straight away. */
	const addAndOpen = (added: Profile) => {
		addProfile(added)
		setEditing(added.id)
	}

	const problems = warnings(settings)
	const names = new Map(
		settings.profiles.map(p => [p.id, p.label || p.name || p.id]),
	)
	const items = [
		problems.length
			? section(
					`Fix this (${problems.length})`,
					'These presences are set up in a way that will not work. Tap one to fix it.',
					...problems.map((w, i) =>
						row(
							`⚠ ${names.get(w.id)} (${i + 1})`,
							w.text,
							() => setEditing(w.id),
							true,
						),
					),
				)
			: null,
		part(
			`Show on my profile (${shown.length} of up to ${limit} showing)`,
			'Switch on the ones you want. Each one is its own card on your profile.',
			...settings.profiles.map(p =>
				toggleRow(
					p.label || p.name || p.id,
					STANDING_TEXT[standingOf(settings, p)],
					!!p.enabled,
					on => toggleProfile(p.id, on),
				),
			),
			row('Using more than one?', DIFFERENT_IDS_NOTE),
		),
		part(
			'Change a presence',
			'Tap one to set up its text, images, timer and more.',
			...settings.profiles.map(p => (
				<Design.TableRow
					key={`edit:${p.id}`}
					label={p.label || p.name || p.id}
					subLabel={summary(p)}
					arrow
					onPress={() => setEditing(p.id)}
				/>
			)),
		),
		part(
			'Add a presence',
			undefined,
			row(
				'Add a presence',
				'Start from a blank one',
				() => addAndOpen(blankProfile()),
				true,
			),
			hasSoundCloud
				? null
				: row(
						'Add SoundCloud',
						'Show the SoundCloud track you are listening to',
						() => {
							const added = newSoundCloudProfile(newId())
							addAndOpen(added)
							toast('SoundCloud added. Turn it on in the list')
						},
						true,
					),
			row(
				'Paste a copied presence',
				'Add one copied from another phone',
				() => {
					Promise.resolve(Clipboard.getString()).then(raw => {
						const imported = profileFromJson(raw)
						if (!imported) return toast('Clipboard has no copied presence')
						addAndOpen(imported)
						toast('Presence added')
					})
				},
			),
		),
		part(
			'General',
			undefined,
			toggleRow(
				'Show presences',
				'The main switch. Off hides every presence',
				settings.enabled,
				enabled => commit({ enabled }, true),
			),
			toggleRow(
				'Apply on start',
				'Put the presences on your profile when Discord opens',
				settings.applyOnStart,
				applyOnStart => commit({ applyOnStart }),
			),
		),
		block(
			'Limits',
			'How many show at once, and how often they refresh.',
			radio(
				'Most presences at once',
				limit,
				Array.from({ length: MAX_ACTIVE_LIMIT }, (_, i) => ({
					v: i + 1,
					l: `${i + 1}`,
					s:
						i + 1 === MAX_ACTIVE_LIMIT
							? 'About as many as Discord shows'
							: undefined,
				})),
				value => commit({ maxActive: String(value) }),
				'If more are on than this, the first ones in the list show.',
			),
			group(
				'refresh',
				<Field
					key="refresh"
					label="Refresh every (seconds)"
					description="Updates {time}, {uptime} and other variables. 0 turns it off, minimum 15."
					placeholder="0"
					maxLength={5}
					value={settings.refreshSeconds}
					onCommit={refreshSeconds => commit({ refreshSeconds })}
				/>,
			),
		),
		part(
			'Actions',
			undefined,
			row(
				'Apply everything now',
				'Send every presence that is on and restart its timer',
				() => {
					applyAll(true)
					toast('Presences applied')
				},
			),
			row(
				'Clear every presence',
				'Take all of your presences off your profile',
				() => {
					clearAll()
					toast('Presences cleared')
				},
			),
		),
		part(
			'Good to know',
			undefined,
			row(
				'Several at once',
				'Discord’s app keeps only ONE Playing at a time, so make the others Listening to, Watching, Competing in or Streaming. Those can show together, up to three.',
			),
			row(
				'Your own profile',
				"Discord doesn't show buttons on your own profile. Other people can see them on desktop, not always on mobile.",
			),
			row(
				'Share activity',
				'Your presences only show if Discord is allowed to share your activity in your privacy settings.',
			),
			row(
				'Fancy text',
				'Unusual unicode text can stop a presence from showing. Try normal letters.',
			),
		),
	]

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			stickyHeaderIndices={[0]}
			keyboardShouldPersistTaps="handled"
		>
			<HomePreview shown={shown} settings={settings} />
			<Design.Stack
				style={{ paddingVertical: 24, paddingHorizontal: 12 }}
				spacing={24}
			>
				{items}
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
