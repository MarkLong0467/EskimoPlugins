import { KmmiioFooter } from '../../../shared/kmmiio/Footer'
import secret from '../secret'
import { DEFAULTS } from './defaults'
import { diag } from './diag'
import { sha256Hex } from './lib/sha256'
import { TranslatorGroup } from './lib/translatorSettings'
import type { PluginApi } from '@valenced/plugins/types'
import type { ReactNode } from 'react'
import type { MessageTweaksStorage } from './types'

const REQUIRED_HASH = (secret.passkeyHash ?? '').trim().toLowerCase()

function LockedHeading() {
	const { Text } = valenced.discord.design.Design
	return (
		<Text variant="heading-lg/bold" style={{ textAlign: 'center' }}>
			Warning!
		</Text>
	)
}

function PasscodeGate({ children }: { children: ReactNode }) {
	const { useEffect, useRef, useState } = valenced.react.React
	const { View } = valenced.react.ReactNative
	const { Stack, Text, TextInput, Button } = valenced.discord.design.Design

	const [unlocked, setUnlocked] = useState(false)
	const [value, setValue] = useState('')
	const [error, setError] = useState<string | null>(null)
	const inputRef = useRef<any>(null)

	// If no passkey hash is configured the settings stay fully locked: there is
	// no secret to match, so nothing can ever unlock them (fail-closed).
	const noSecret = REQUIRED_HASH === ''

	// autoFocus opens the keyboard before the tab switch settles, so the field
	// ends up unfocused. Focus it after layout instead.
	useEffect(() => {
		if (noSecret) return
		const t = setTimeout(() => {
			inputRef.current?.focus?.()
		}, 100)
		return () => clearTimeout(t)
	}, [noSecret])

	if (unlocked) return <>{children}</>

	if (noSecret) {
		return (
			<View style={{ flex: 1, paddingTop: 48, paddingHorizontal: 32 }}>
				<Stack spacing={16}>
					<LockedHeading />
					<Text variant="text-md/medium" style={{ textAlign: 'center' }}>
						You're entering a page that violates people's privacy.
					</Text>
					<Text variant="text-sm/medium" style={{ textAlign: 'center' }}>
						No passkey is configured on this build, so these settings are locked
						down.
					</Text>
				</Stack>
			</View>
		)
	}

	return (
		<View
			style={{
				flex: 1,
				paddingTop: 48,
				paddingHorizontal: 32,
			}}
		>
			<Stack spacing={16}>
				<LockedHeading />
				<Text variant="text-md/medium" style={{ textAlign: 'center' }}>
					You're entering a page that violates people's privacy.
				</Text>
				<TextInput
					{...({ ref: inputRef } as any)}
					value={value}
					onChange={v => {
						setValue(v)
						setError(null)
					}}
					placeholder="Passkey"
					secureTextEntry
					isClearable
					returnKeyType="done"
					errorMessage={error ?? undefined}
				/>
				<Button
					text="Unlock"
					variant="primary"
					grow
					size="md"
					onPress={() => {
						if (sha256Hex(value) === REQUIRED_HASH) setUnlocked(true)
						else setError('Incorrect passkey.')
					}}
				/>
			</Stack>
		</View>
	)
}

export default function Settings({
	api,
}: {
	api: PluginApi<{ jsonStorage: MessageTweaksStorage }>
}) {
	const { Page } = valenced.components as any
	const { ScrollView, View } = valenced.react.ReactNative
	const {
		Stack,
		SegmentedControl,
		SegmentedControlPages,
		TableRowGroup,
		TableSwitchRow,
		useSegmentedControlState,
	} = valenced.discord.design.Design
	const { useState } = valenced.react.React

	const [pageWidth, setPageWidth] = useState(0)

	const s = { ...DEFAULTS, ...(api.jsonStorage.use() ?? {}) }
	const set = (patch: Partial<MessageTweaksStorage>) =>
		api.jsonStorage.set({ ...s, ...patch })

	const segmented = useSegmentedControlState({
		items: [
			{
				id: 'display',
				label: 'Display',
				page: (
					<ScrollView contentContainerStyle={{ padding: 0 }}>
						<Stack>
							<TableRowGroup title="Display">
								<TableSwitchRow
									label="Precise timestamps"
									value={s.preciseTimestamp}
									onValueChange={v => set({ preciseTimestamp: v })}
								/>
								<TableSwitchRow
									label="Username next to nickname"
									value={s.showUsername}
									onValueChange={v => set({ showUsername: v })}
								/>
							</TableRowGroup>
							<TranslatorGroup s={s} set={set} />
						</Stack>
					</ScrollView>
				),
			},
			{
				id: 'logging',
				label: 'Logging',
				page: (
					<ScrollView contentContainerStyle={{ padding: 0 }}>
						<Stack>
							<TableRowGroup title="Logging">
								<TableSwitchRow
									label="Unspoiler everything"
									value={s.unspoilAll}
									onValueChange={v => set({ unspoilAll: v })}
								/>
								<TableSwitchRow
									label="Keep deleted messages in chat"
									value={s.keepDeleted}
									onValueChange={v => set({ keepDeleted: v })}
								/>
								<TableSwitchRow
									label="Log my own edits & deletions too"
									value={s.logOwnEdits}
									onValueChange={v => set({ logOwnEdits: v })}
								/>
								<TableSwitchRow
									label="Show edit history"
									value={s.showEditTrail}
									onValueChange={v => set({ showEditTrail: v })}
								/>
							</TableRowGroup>
						</Stack>
					</ScrollView>
				),
			},
			{
				id: 'local',
				label: 'Local',
				page: (
					<PasscodeGate>
						<ScrollView contentContainerStyle={{ padding: 0 }}>
							<Stack>
								<TableRowGroup title="Local">
									<TableSwitchRow
										label="Show “Edit Locally”"
										value={s.showLocalEditButton}
										onValueChange={v => set({ showLocalEditButton: v })}
									/>
									<TableSwitchRow
										label="Show “Hide for Me”"
										value={s.showHideButton}
										onValueChange={v => set({ showHideButton: v })}
									/>
								</TableRowGroup>
							</Stack>
						</ScrollView>
					</PasscodeGate>
				),
			},
			{
				id: 'debug',
				label: 'Debug',
				page: (
					<ScrollView contentContainerStyle={{ padding: 0 }}>
						<Stack>
							<KmmiioFooter diag={diag} />
						</Stack>
					</ScrollView>
				),
			},
		],
		pageWidth,
	})

	return (
		<Page>
			<View
				style={{ flex: 1 }}
				onLayout={e => setPageWidth(e.nativeEvent.layout.width)}
			>
				<View
					style={{
						paddingTop: 12,
						paddingBottom: 20,
						paddingHorizontal: 16,
					}}
				>
					<SegmentedControl
						state={segmented}
						variant="default"
						keyboardShouldPersistTaps="handled"
					/>
				</View>
				<SegmentedControlPages state={segmented} style={{ flex: 1 }} />
			</View>
		</Page>
	)
}
