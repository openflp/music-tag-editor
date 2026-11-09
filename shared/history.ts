import { HISTORY_FIELDS, HISTORY_LIMIT, type HistoryField, type HistoryMap } from './types'

export function mergeHistoryList(existing: readonly string[], incoming: readonly string[], limit = HISTORY_LIMIT): string[] {
  const unique: string[] = []
  for (const item of [...incoming, ...existing]) {
    const trimmed = item.trim()
    if (!trimmed) continue
    if (unique.some((have) => have.toLowerCase() === trimmed.toLowerCase())) continue
    unique.push(trimmed)
    if (unique.length >= limit) break
  }
  return unique
}

export function collectHistory(sources: Array<Partial<Record<HistoryField, unknown>>>): Partial<HistoryMap> {
  const entries: Partial<HistoryMap> = {}
  for (const field of HISTORY_FIELDS) {
    const values: string[] = []
    for (const source of sources) {
      const value = source[field]
      if (typeof value === 'string' && value.trim()) values.push(value.trim())
    }
    if (values.length) entries[field] = values
  }
  return entries
}

export function historyChoices(history: readonly string[], fileValues: readonly string[], query: string): string[] {
  const taken = new Set(fileValues.map((item) => item.trim().toLowerCase()).filter(Boolean))
  const needle = query.trim().toLowerCase()
  return history.filter((item) => {
    const key = item.trim().toLowerCase()
    if (!key || taken.has(key)) return false
    return !needle || key.includes(needle)
  })
}
