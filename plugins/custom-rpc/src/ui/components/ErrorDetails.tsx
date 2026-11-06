import { useState } from 'react'

/**
 * Renders the untruncated failure payload. Deliberately plain and copyable:
 * when a request fails we need the raw shape, not a prettified summary.
 */
export default function ErrorDetails({ details }: { details: string }) {
	const [expanded, setExpanded] = useState(false)
	const [copied, setCopied] = useState(false)
	const { ScrollView, View, Text } = valenced.react.ReactNative
	const { TableRowGroup, TableRow } = valenced.discord.design.Design

	if (!details) return null

	const copy = () => {
		try {
			;(valenced as any).externals?.ReactNativeClipboard?.Clipboard?.setString(
				details,
			)
		} catch {}
		setCopied(true)
	}

	return (
		<TableRowGroup title="Request details">
			<TableRow
				label={expanded ? 'Hide raw response' : 'Show raw response'}
				subLabel={
					copied ? 'Copied to clipboard' : 'Exact failure payload, no redaction'
				}
				trailing={<TableRow.Arrow />}
				onPress={() => {
					copy()
					setExpanded(v => !v)
				}}
			/>
			{copied ? <TableRow label="Copy again" onPress={copy} /> : null}
			{expanded ? (
				<View style={{ padding: 12 }}>
					<ScrollView horizontal>
						<Text
							style={{
								color: '#b5bac1',
								fontFamily: 'monospace',
								fontSize: 11,
							}}
						>
							{details}
						</Text>
					</ScrollView>
				</View>
			) : null}
		</TableRowGroup>
	)
}
