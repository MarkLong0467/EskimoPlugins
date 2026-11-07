import { ActionSheetActionCreators } from '@valenced/discord/actions'
import { Design } from '@valenced/discord/design'
import { Stores } from '@valenced/discord/flux'
import { useState } from 'react'
import { Image, View } from 'react-native'
import { openToast } from '../../../shared/kmmiio/toast'
import { diag } from './diag'
import { state } from './state'
import { hideEverywhere, hideInServer } from './store'
import type { AppInfo } from './store'

/** The key of the sheet, so it can be closed again. */
const SHEET_KEY = 'MARKLONG_HIDE_SLASH_APPS'

/** The key of the toasts. */
const TOAST_KEY = 'MARKLONG_HIDE_SLASH_APPS_TOAST'

/** Texts as constants because React Native text must be passed as an expression. */
const SUBTITLE = 'Choose where to stop seeing this app in the / menu.'
const RESTORE_NOTE =
	'You can bring it back any time in the settings of the Hide Slash Apps plugin.'
const DM_NOTE =
	'This is not in a server, so it can only be hidden everywhere. Open the / menu inside a server to hide it in just that server.'

/** The name of a server, or a plain word if Discord does not have it. */
export function guildNameOf(guildId: string | undefined): string {
	if (!guildId) return ''
	try {
		const guild = (
			Stores as unknown as {
				GuildStore?: {
					getGuild?: (id: string) => { name?: string } | undefined
				}
			}
		).GuildStore?.getGuild?.(guildId)
		return guild?.name || 'this server'
	} catch {
		return 'this server'
	}
}

/** The picture of an app, from its icon hash, or its first letter on a plain square if it has none or it does not load. */
export function AppPicture({
	app,
	size = 56,
}: {
	app: AppInfo
	size?: number
}) {
	const [failed, setFailed] = useState(false)
	const radius = Math.round(size / 4)
	if (app.icon && !failed) {
		return (
			<Image
				source={{
					uri: `https://cdn.discordapp.com/app-icons/${app.id}/${app.icon}.png?size=128`,
				}}
				style={{ width: size, height: size, borderRadius: radius }}
				onError={() => setFailed(true)}
			/>
		)
	}
	return (
		<View
			style={{
				width: size,
				height: size,
				borderRadius: radius,
				alignItems: 'center',
				justifyContent: 'center',
				backgroundColor: 'rgba(127,127,127,0.28)',
			}}
		>
			<Design.Text variant="heading-lg/bold">
				{(app.name || '?').slice(0, 1).toUpperCase()}
			</Design.Text>
		</View>
	)
}

/** Closes the sheet. */
function close(): void {
	try {
		ActionSheetActionCreators.hideActionSheet(SHEET_KEY)
	} catch (error) {
		diag.fail('close sheet', error)
	}
}

/** What a hide did, shown in a toast. */
function done(text: string): void {
	openToast(TOAST_KEY, text)
}

/** What the sheet is opened with. */
interface SheetProps {
	app: AppInfo
	/** The server the `/` menu is open in, or nothing in a DM. */
	guildId?: string
}

/** The sheet: the app, and where to hide it. */
function HideSheet({ app, guildId }: SheetProps) {
	const server = guildNameOf(guildId)
	return (
		<Design.ActionSheet>
			<View style={{ padding: 16, gap: 16 }}>
				<View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
					<AppPicture app={app} />
					<View style={{ flex: 1, gap: 2 }}>
						<Design.Text variant="heading-lg/bold">{app.name}</Design.Text>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{SUBTITLE}
						</Design.Text>
					</View>
				</View>
				<Design.TableRowGroup>
					<Design.TableRow
						label="Hide everywhere"
						subLabel={`Never show ${app.name} in the / menu, in any server or DM`}
						onPress={() => {
							hideEverywhere(app)
							state.hid++
							state.lastPress = 'hid an app everywhere'
							diag.log('hide', 'Hid an app everywhere')
							close()
							done(`${app.name} is hidden everywhere`)
						}}
					/>
					{guildId ? (
						<Design.TableRow
							label={`Hide in ${server}`}
							subLabel={`Only here. ${app.name} stays in your other servers`}
							onPress={() => {
								hideInServer(app, guildId, server)
								state.hid++
								state.lastPress = 'hid an app in one server'
								diag.log('hide', 'Hid an app in one server')
								close()
								done(`${app.name} is hidden in ${server}`)
							}}
						/>
					) : null}
				</Design.TableRowGroup>
				<Design.Text variant="text-sm/medium" color="text-muted">
					{guildId ? RESTORE_NOTE : `${DM_NOTE} ${RESTORE_NOTE}`}
				</Design.Text>
				<Design.Button
					text="Cancel"
					variant="secondary"
					size="md"
					onPress={close}
				/>
			</View>
		</Design.ActionSheet>
	)
}

/**
 * Opens the sheet for an app.
 *
 * @param app The app that was long pressed.
 * @param guildId The server the menu is open in, if it is in one.
 */
export function openHideSheet(app: AppInfo, guildId?: string): void {
	try {
		state.sheets++
		ActionSheetActionCreators.openLazy(
			Promise.resolve({
				default: () => <HideSheet app={app} guildId={guildId} />,
			}),
			SHEET_KEY,
			{},
		)
		state.lastPress = 'opened the hide menu'
		diag.log('sheet', 'Opened the hide menu')
	} catch (error) {
		state.lastPress = 'the hide menu failed to open'
		diag.fail('open sheet', error)
	}
}
