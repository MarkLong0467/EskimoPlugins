import { Design } from '@valenced/discord/design'
import { Image, Linking, View } from 'react-native'
import { LICENSE, ORIGINAL_AUTHOR, PORTER } from './credits'

/** kmmiio99o's picture, the same one their own library plugin shows. */
const AVATAR_URL = 'https://avatars.githubusercontent.com/u/164557248?v=4'

/** Texts as constants because React Native text must be passed as an expression. */
const PORT_NOTE = `A 1:1 port to Valenced by ${PORTER.name}. The plugin, its ideas and its behaviour are all ${ORIGINAL_AUTHOR.name}'s work.`

/** Opens a link, and does nothing if the phone cannot. */
function open(url: string): void {
	Linking.openURL(url).catch(() => {})
}

/**
 * The credit for kmmiio99o at the bottom of a plugin's settings: who made the plugin, who ported it, and where to find
 * the original.
 *
 * @param name The plugin's name, as it should read in the card.
 * @param version The plugin's version.
 */
export function AboutCard({
	name,
	version,
}: {
	name: string
	version: string
}) {
	const byline = `by ${ORIGINAL_AUTHOR.name} · v${version}`
	return (
		<Design.Stack spacing={16}>
			<View style={{ marginHorizontal: 16 }}>
				<Design.Card>
					<Design.Stack spacing={14}>
						<View
							style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}
						>
							<Image
								source={{ uri: AVATAR_URL }}
								style={{ width: 56, height: 56, borderRadius: 28 }}
							/>
							<View style={{ flex: 1, gap: 2 }}>
								<Design.Text variant="heading-lg/bold">{name}</Design.Text>
								<Design.Text variant="text-sm/medium" color="text-muted">
									{byline}
								</Design.Text>
							</View>
						</View>
						<Design.Text variant="text-sm/medium" color="text-muted">
							{PORT_NOTE}
						</Design.Text>
					</Design.Stack>
				</Design.Card>
			</View>
			<Design.TableRowGroup title="Credits">
				<Design.TableRow
					label={ORIGINAL_AUTHOR.name}
					subLabel="Original author · kmmiio99o.dev"
					arrow
					onPress={() => open(ORIGINAL_AUTHOR.website)}
				/>
				<Design.TableRow
					label="GitHub"
					subLabel="github.com/kmmiio99o"
					arrow
					onPress={() => open(ORIGINAL_AUTHOR.github)}
				/>
				<Design.TableRow
					label="Discord profile"
					subLabel={`User ID ${ORIGINAL_AUTHOR.discordId}`}
					arrow
					onPress={() => open(ORIGINAL_AUTHOR.discord)}
				/>
				<Design.TableRow
					label="Original plugins"
					subLabel="Revenge Next version, on git.gay"
					arrow
					onPress={() => open(ORIGINAL_AUTHOR.source)}
				/>
				<Design.TableRow
					label={`Ported by ${PORTER.name}`}
					subLabel={`Licensed ${LICENSE}, like the original`}
					arrow
					onPress={() => open(PORTER.github)}
				/>
			</Design.TableRowGroup>
		</Design.Stack>
	)
}
