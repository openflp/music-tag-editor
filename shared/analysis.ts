export const ANALYSIS_RATE = 44100
export const SLICE_MIN_SEC = 60
export const SLICE_MAX_SEC = 90
const SLICE_SEC = 75

export interface AnalysisResult {
  bpm: number
  key: string
  scale: 'major' | 'minor'
  camelot: string
  initialKey: string
}

export interface StoredRhythm {
  bpm: number | null
  initialKey: string
}

export function sliceWindow(durationSec: number): { startSec: number; lengthSec: number } {
  if (!Number.isFinite(durationSec) || durationSec <= 0) return { startSec: 0, lengthSec: 0 }
  if (durationSec <= SLICE_MAX_SEC) return { startSec: 0, lengthSec: durationSec }
  const lengthSec = Math.min(SLICE_MAX_SEC, Math.max(SLICE_MIN_SEC, SLICE_SEC))
  return { startSec: (durationSec - lengthSec) / 2, lengthSec }
}

export function roundBpm(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value * 10) / 10
}

export function partsOf(raw: string): { key: string; scale: 'major' | 'minor' } {
  const text = raw.trim().replace(/♯/g, '#').replace(/♭/g, 'b')
  if (/^\d{1,2}[ab]$/i.test(text)) {
    return { key: text.toUpperCase(), scale: /a$/i.test(text) ? 'minor' : 'major' }
  }
  const minor = /(?:minor|min|m)$/i.test(text)
  const key = text
    .replace(/\s*(major|minor|maj|min)$/i, '')
    .replace(/m$/i, '')
    .trim()
  return { key, scale: minor ? 'minor' : 'major' }
}

export function initialKeyOf(key: string, scale: string): string {
  const root = key.trim()
  if (!root) return ''
  if (/^\d{1,2}[ab]$/i.test(root)) return root.toUpperCase()
  return scale === 'minor' ? `${root}m` : root
}

export function displayKey(raw: string): string {
  const text = raw.trim()
  if (!text) return ''
  const normalized = text.replace(/♯/g, '#').replace(/♭/g, 'b')
  if (/^\d{1,2}[ab]$/i.test(normalized)) return normalized.toUpperCase()
  const { key, scale } = partsOf(text)
  if (!key) return text
  return `${key} ${scale}`
}
