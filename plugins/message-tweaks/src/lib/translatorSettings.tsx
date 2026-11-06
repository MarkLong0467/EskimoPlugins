import { langNameFor, normalizeTargetCode, targetLangsFor } from './lang'
import { getSettings } from './state'
import { setTranslatorService, setTranslatorTargetLang } from './translator'
import type { MessageTweaksStorage } from '../types'

const LANG_SHEET_KEY = 'message-tweaks-translator-lang'
const SERVICE_SHEET_KEY = 'message-tweaks-translator-service'

function actionSheet() {
	return valenced.discord.actions?.ActionSheetActionCreators
}

function closeSheet(key: string) {
	try {
		actionSheet()?.hideActionSheet?.(key)
	} catch {}
}

function openLazy(sheetKey: string, component: any) {
	try {
		actionSheet()?.openLazy?.(
			Promise.resolve({ default: component }),
			sheetKey,
			{ sheetKey },
		)
	} catch {}
}

export function openLanguagePicker() {
	openLazy(LANG_SHEET_KEY, LanguagePicker)
}

export function openServicePicker() {
	openLazy(SERVICE_SHEET_KEY, ServicePicker)
}

export function TranslatorGroup({
	s,
	set,
}: {
	s: MessageTweaksStorage
	set: (patch: Partial<MessageTweaksStorage>) => void
}) {
	const { TableRow, TableRowGroup, TableSwitchRow } =
		valenced.discord.design.Design

	const targetName = langNameFor(s.translatorService, s.translatorTargetLang)
	const serviceName =
		s.translatorService === 'deepl' ? 'DeepL' : 'Google Translate'

	return (
		<TableRowGroup title="Translator">
			<TableSwitchRow
				label="Enable translation"
				subLabel="Add a Translate Message option to the message menu"
				value={s.translatorEnabled}
				onValueChange={v => set({ translatorEnabled: v })}
			/>
			<TableSwitchRow
				label="Immersive translation"
				subLabel="Show the original message above the translation"
				value={s.translatorImmersive}
				onValueChange={v => set({ translatorImmersive: v })}
			/>
			<TableRow
				label="Translate to"
				subLabel={targetName ?? s.translatorTargetLang}
				onPress={openLanguagePicker}
				arrow
			/>
			<TableRow
				label="Translator service"
				subLabel={serviceName}
				onPress={openServicePicker}
				arrow
			/>
		</TableRowGroup>
	)
}

function LanguagePicker({ sheetKey }: { sheetKey: string }) {
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
	} = Design

	const service = getSettings().translatorService
	const current = normalizeTargetCode(
		service,
		getSettings().translatorTargetLang,
	)

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Translate to" />
			<TableRadioGroup
				value={current}
				onChange={(code: any) => {
					if (typeof code !== 'string') return
					setTranslatorTargetLang(code)
					closeSheet(sheetKey)
				}}
			>
				{Object.entries(targetLangsFor(service)).map(([name, code]) => (
					<TableRadioRow key={code} label={name} value={code} />
				))}
			</TableRadioGroup>
		</ActionSheet>
	)
}

function ServicePicker({ sheetKey }: { sheetKey: string }) {
	const Design = valenced.discord.design.Design as any
	const {
		ActionSheet,
		BottomSheetTitleHeader,
		TableRadioGroup,
		TableRadioRow,
	} = Design

	const current = getSettings().translatorService

	return (
		<ActionSheet>
			<BottomSheetTitleHeader title="Translator service" />
			<TableRadioGroup
				value={current}
				onChange={(service: any) => {
					if (service !== 'google' && service !== 'deepl') return
					setTranslatorService(service)
					closeSheet(sheetKey)
				}}
			>
				<TableRadioRow label="Google Translate" value="google" />
				<TableRadioRow label="DeepL" value="deepl" />
			</TableRadioGroup>
		</ActionSheet>
	)
}
