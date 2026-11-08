/** The pure parts of Plugin Auditor, bundled by `tests/plugin-auditor.test.cjs` so they can be tested without a phone. */
export {
	findDuplicates,
	stringsOf,
} from '../../plugins/plugin-auditor/js/duplicates'
export { base64Url, sha256, utf8 } from '../../plugins/plugin-auditor/js/hash'
export {
	classify,
	findLinks,
	hostOf,
} from '../../plugins/plugin-auditor/js/links'
export { RULES } from '../../plugins/plugin-auditor/js/rules'
export { scanPlugin } from '../../plugins/plugin-auditor/js/scan'
export {
	lookupDomain,
	lookupFile,
	resetPacing,
	testKey,
	uploadFile,
	vtLog,
} from '../../plugins/plugin-auditor/js/virustotal'
