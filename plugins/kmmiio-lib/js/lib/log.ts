export interface LogEntry {
	id: string
	module: string
	action: string
	attempt: number
	found: boolean
	detail?: string
	timestamp: number
}

const logs: LogEntry[] = []
const seen = new Set<string>()
const MAX_LOGS = 200
const listeners = new Set<() => void>()

function notify() {
	for (const fn of listeners) fn()
}

function key(id: string, module: string, action: string) {
	return `${id}|${module}|${action}`
}

export function addLog(entry: Omit<LogEntry, 'timestamp'>) {
	const k = key(entry.id, entry.module, entry.action)
	if (seen.has(k)) return
	seen.add(k)
	if (logs.length >= MAX_LOGS) logs.shift()
	logs.push({ ...entry, timestamp: Date.now() })
	notify()
}

export function logUsage(
	pluginId: string,
	module: string,
	action: string,
	found: boolean,
	detail?: string,
) {
	addLog({ id: pluginId, module, action, attempt: 1, found, detail })
}

export function getLogs(): readonly LogEntry[] {
	return logs
}

export function getLogsForPlugin(pluginId: string): LogEntry[] {
	return logs.filter(l => l.id === pluginId)
}

export function clearLogs(pluginId?: string) {
	if (pluginId) {
		for (let i = logs.length - 1; i >= 0; i--) {
			if (logs[i].id === pluginId) {
				seen.delete(key(logs[i].id, logs[i].module, logs[i].action))
				logs.splice(i, 1)
			}
		}
	} else {
		logs.length = 0
		seen.clear()
	}
	notify()
}

export function onLogChange(fn: () => void): () => void {
	listeners.add(fn)
	return () => {
		listeners.delete(fn)
	}
}
