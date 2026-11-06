import { Design } from '@valenced/discord/design'
import { useEffect, useState } from 'react'
import { ScrollView, View } from 'react-native'
import { DebugSection } from '../../../shared/kmmiio/Debug'
import { IntroCard } from '../../../shared/kmmiio/Intro'
import { store } from './config'
import { diag } from './diag'
import { findMoment, PASSTHROUGH } from './moment'
import { state } from './state'
import type { PluginSettingsComponent } from '@valenced/plugins/types'
import type { ComponentProps } from 'react'
import type { LocaleSettings } from './config'

type Props = ComponentProps<
	PluginSettingsComponent<{ jsonStorage: LocaleSettings }>
>

/** Texts as constants because React Native text must be passed as an expression. */
const INTRO =
	'Pick the language dates and times are written in, whatever language Discord is in. For example en-gb shows 24-hour times and day/month/year dates. Discord’s own changes to the locale are ignored while this plugin is on.'
const NOT_FOUND =
	'Discord’s date library was not found, so there is nothing to pick yet.'
const SEARCH_LABEL = 'Search locales'
const PREVIEW_TITLE = 'How it looks now'

/** The name of a language in English, if this phone can give it. */
function languageName(code: string): string | undefined {
	try {
		const names = new (
			Intl as unknown as {
				DisplayNames: new (
					locales: string[],
					options: { type: string },
				) => { of(code: string): string | undefined }
			}
		).DisplayNames(['en'], { type: 'language' })
		const name = names.of(code)
		return name && name !== code ? name : undefined
	} catch {
		return undefined
	}
}

/** The settings screen: a preview, the list of locales and the debugging tools. */
export default function Settings({ api }: Props) {
	store.attach(api.jsonStorage)
	api.jsonStorage.use()
	const [, redraw] = useState(0)
	const [search, setSearch] = useState('')
	useEffect(() => {
		const stopStore = store.subscribe(() => redraw(n => n + 1))
		const stopDiag = diag.subscribe(() => redraw(n => n + 1))
		return () => {
			stopStore()
			stopDiag()
		}
	}, [])

	const moment = findMoment()
	const saved = store.get('locale')
	// Setting the locale here, with the symbol, makes the preview and Discord use the chosen one right away.
	if (moment) {
		try {
			moment.locale(saved, PASSTHROUGH)
			state.applied = saved
		} catch (error) {
			diag.fail('apply', error)
		}
	}

	const all = moment?.locales() ?? []
	const query = search.trim().toLowerCase()
	const shown = query
		? all.filter(
				code =>
					code.toLowerCase().includes(query) ||
					(languageName(code) ?? '').toLowerCase().includes(query),
			)
		: all

	let preview: string[] = []
	if (moment) {
		try {
			preview = [
				moment().format('LLLL'),
				moment().format('L LT'),
				moment().subtract(3, 'hours').calendar(),
				moment().subtract(2, 'days').fromNow(),
			]
		} catch (error) {
			diag.fail('preview', error)
		}
	}

	return (
		<ScrollView
			style={{ flex: 1 }}
			contentContainerStyle={{ paddingBottom: 38 }}
			keyboardShouldPersistTaps="handled"
		>
			<Design.Stack style={{ paddingVertical: 20 }} spacing={22}>
				<IntroCard text={INTRO} />
				{moment ? null : (
					<View style={{ marginHorizontal: 16 }}>
						<Design.Card>
							<Design.Text variant="text-md/medium" color="text-danger">
								{NOT_FOUND}
							</Design.Text>
						</Design.Card>
					</View>
				)}
				{preview.length ? (
					<Design.TableRowGroup
						title={PREVIEW_TITLE}
						description={`Locale: ${saved}${state.ready ? '' : '. Still loading every locale…'}`}
					>
						{preview.map(line => (
							<Design.TableRow key={line} label={line} />
						))}
					</Design.TableRowGroup>
				) : null}
				<View style={{ paddingHorizontal: 16 }}>
					<Design.TextInput
						label={SEARCH_LABEL}
						placeholder="en-gb, french, deutsch…"
						size="md"
						value={search}
						onChange={(value: string) => setSearch(value)}
					/>
				</View>
				<Design.TableRowGroup
					title="Locales"
					description={
						query ? `${shown.length} of ${all.length} match` : undefined
					}
				>
					<Design.TableRadioGroup
						defaultValue={saved}
						onChange={(value: string) => {
							store.set({ locale: value })
							diag.log('locale', `chose ${value}`)
						}}
					>
						{shown.map(code => (
							<Design.TableRadioRow
								key={code}
								label={code}
								subLabel={languageName(code)}
								value={code}
							/>
						))}
					</Design.TableRadioGroup>
				</Design.TableRowGroup>
				<DebugSection diag={diag} />
			</Design.Stack>
		</ScrollView>
	)
}
