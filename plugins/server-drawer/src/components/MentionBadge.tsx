const { View, Text, StyleSheet } = valenced.react.ReactNative

export default function MentionBadge({ count }: { count: number }) {
	if (count <= 0) return null
	return (
		<View style={st.outline}>
			<View style={st.badge}>
				<Text style={st.text}>{count > 99 ? '99+' : String(count)}</Text>
			</View>
		</View>
	)
}

const st = StyleSheet.create({
	outline: {
		position: 'absolute',
		bottom: -3,
		right: -3,
		padding: 2,
		borderRadius: 999,
		backgroundColor: '#1a1a2e',
		alignItems: 'center',
		justifyContent: 'center',
	},
	badge: {
		minWidth: 19,
		height: 19,
		borderRadius: 999,
		backgroundColor: '#ed4245',
		alignItems: 'center',
		justifyContent: 'center',
		paddingHorizontal: 5,
	},
	text: {
		color: '#fff',
		fontSize: 10,
		fontWeight: '700',
		lineHeight: 19,
	},
})
