import { kmmiio } from '../lib/kmmiio'
import { getYouBarComponent } from '../lib/modules'
import { getPendingCount, subscribe } from '../lib/sessionState'
import { openDevicesSettings, safeToken } from './ui'

const { createElement } = valenced.react.React
const RN = valenced.react.ReactNative

let youBarRef: any

function usePendingCount(): number {
	const React = valenced.react.React
	const [count, setCount] = React.useState(getPendingCount())
	React.useEffect(() => subscribe(() => setCount(getPendingCount())), [])
	return count
}

function YouBarWithBadge(props: any) {
	const count = usePendingCount()
	if (!youBarRef) return null
	const bar = createElement(youBarRef, props)
	const bg = safeToken(() => kmmiio()?.rawColor?.('RED_400'))
	const fg = safeToken(() => kmmiio()?.rawColor?.('WHITE'))
	return createElement(
		RN.View,
		{ collapsable: false, style: { position: 'relative' } },
		bar,
		count > 0
			? createElement(
					RN.Pressable,
					{
						onPress: openDevicesSettings,
						style: {
							position: 'absolute',
							top: -6,
							right: -6,
							minWidth: 22,
							height: 22,
							paddingHorizontal: 6,
							borderRadius: 11,
							backgroundColor: bg,
							alignItems: 'center',
							justifyContent: 'center',
							zIndex: 99,
						},
					},
					createElement(
						RN.Text,
						{
							style: {
								color: fg,
								fontSize: 11,
								fontWeight: '700',
								lineHeight: 20,
							},
						},
						`+${Math.min(count, 99)}`,
					),
				)
			: null,
	)
}

export function transformYouBar(type: any, _props: any, args: any[]): void {
	if (type !== getYouBarComponent()) return
	youBarRef = type
	args[0] = YouBarWithBadge
}
