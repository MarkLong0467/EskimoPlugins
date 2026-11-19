import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { Image, ScrollView } from 'react-native'
import { iconUrl, loadKnownApps, MAX_RESULTS, searchKnown } from './known'
import { Back, block, group, row } from './ui'
import type { KnownApp } from './known'
import type { Profile } from './types'

interface Props {
	/** The presences already in the list, to mark the games that are in it. */
	profiles: Profile[]
	/** Called with the game that was picked. */
	onPick: (app: KnownApp) => void
	onBack: () => void
}

/**
 * The searchable list of the games and apps Discord knows. Picking one adds it to your presences, filled in with its name,
 * Application ID and icon, and opens it, just like a presence you added yourself.
 */
export default function KnownApps({ profiles, onPick, onBack }: Props) {
	const [apps, setApps] = useState<KnownApp[] | null>(null)
	const [failed, setFailed] = useState('')
	const [typed, setTyped] = useState('')
	const [attempt, setAttempt] = useState(0)

	useEffect(() => {
		let live = true
		setFailed('')
		loadKnownApps().then(
			list => live && setApps(list),
			error => live && setFailed(String(error?.message || error)),
		)
		return () => {
			live = false
		}
	}, [attempt])

	const results = apps ? searchKnown(apps, typed) : []
	const have = new Set(profiles.map(p => String(p.applicationId || '').trim()))

	let list
	if (failed)
		list = group(
			'failed',
			row('Could not load the list', failed),
			row('Try again', 'Fetch the list from Discord again', () => setAttempt(n => n + 1), true),
		)
	else if (!apps) list = group('loading', row('Loading…', 'Getting the list of games and apps from Discord'))
	else if (!typed.trim())
		list = group('hint', row(`${apps.length.toLocaleString()} games and apps`, 'Type a name to search, like Minecraft or Valorant'))
	else if (!results.length) list = group('none', row('Nothing found', 'Try another name or a shorter part of it'))
	else
		list = group(
			'results',
			...results.map(app => {
				const icon = iconUrl(app, 64)
				return (
					<Design.TableRow
						key={app.id}
						label={app.name}
						subLabel={have.has(app.id) ? 'Already in your presences, tap to add another' : `Playing · ${app.id}`}
						icon={icon ? <Image source={{ uri: icon }} style={{ width: 32, height: 32, borderRadius: 8 }} /> : undefined}
						arrow
						onPress={() => onPick(app)}
					/>
				)
			}),
		)

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingVertical: 24, paddingHorizontal: 12, paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack spacing={24}>
				<Back title="Presences" onPress={onBack} />
				{block(
					'Add a known game or app',
					'Pick one and it is added to your presences with its name, Application ID and icon, ready to switch on.',
					<Design.TextInput
						key="search"
						label="Search"
						placeholder="Game or app name"
						size="md"
						value={typed}
						isClearable
						autoFocus
						onChange={(next: string) => setTyped(next)}
					/>,
					list,
					results.length === MAX_RESULTS
						? group('more', row('More matches', `Showing the best ${MAX_RESULTS}. Type more of the name to narrow it down.`))
						: null,
				)}
			</Design.Stack>
		</ScrollView>
	)
}
