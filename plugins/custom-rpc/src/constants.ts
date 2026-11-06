import type { ActivityType, CustomRpcStorage } from './types'

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
	0: 'Playing',
	1: 'Streaming',
	2: 'Listening',
	3: 'Watching',
	5: 'Competing',
} as const

export const DEFAULT_NAME = 'Custom Activity'

export const PID = 2313
export const SOCKET_ID = 'Custom-RPC@Revenge-next'

export function cdnAppAssetUrl(clientId: string, key: string) {
	return `https://cdn.discordapp.com/app-assets/${clientId}/${key}.png`
}

/**
 * Mirrors `ApplicationAssetV2Utils.getApplicationAssetUrl`, including the `size`
 * ladder the client picks from (`ImageLoaderUtils.getBestMediaProxySize`). Passing
 * the size matters for rendering: Discord's own image loader asks for a sized
 * webp, so a bare unsized URL is not the same request its loader would make.
 */
export function cdnAppAssetByIdUrl(
	clientId: string,
	assetId: string,
	size?: number,
) {
	const base = `https://cdn.discordapp.com/app-assets/${clientId}/${assetId}.webp`
	return size ? `${base}?size=${size}` : base
}

export const DEFAULTS: CustomRpcStorage = {
	enabled: true,
	clientId: '',
	applicationName: DEFAULT_NAME,
	activityType: 0,
	details: '',
	state: '',
	showTimestamp: false,
	timestampStart: 0,
	timestampEnd: 0,
	largeImage: { source: 'none', value: '', text: '' },
	smallImage: { source: 'none', value: '', text: '' },
	buttons: [
		{ enabled: false, label: '', url: '' },
		{ enabled: false, label: '', url: '' },
	],
}
