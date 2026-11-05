import type { CachedOwner } from './types'

/** The owner of each server that has been looked up, by server id, so the sheet shows the name at once next time. */
export const ownerCache = new Map<string, CachedOwner>()
