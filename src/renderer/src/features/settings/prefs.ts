import { useSyncExternalStore } from 'react'

export const SHORTCUTS = [
  { id: 'open', def: 'Ctrl+O' },
  { id: 'folder', def: 'Ctrl+Shift+O' },
  { id: 'save', def: 'Ctrl+S' },
  { id: 'undo', def: 'Ctrl+Z' },
  { id: 'redo', def: 'Ctrl+Y' },
  { id: 'redoAlt', def: 'Ctrl+Shift+Z' },
  { id: 'palette', def: 'Ctrl+K' },
  { id: 'settings', def: 'Ctrl+,' },
  { id: 'nextTab', def: 'Ctrl+Tab' },
  { id: 'prevTab', def: 'Ctrl+Shift+Tab' },
  { id: 'tabMain', def: 'Ctrl+1' },
  { id: 'tabNote', def: 'Ctrl+2' },
  { id: 'tabLyrics', def: 'Ctrl+5' },
  { id: 'tabInfo', def: 'Ctrl+3' },
  { id: 'tabFile', def: 'Ctrl+4' },
  { id: 'selectAll', def: 'Ctrl+A' },
  { id: 'copyFiles', def: 'Ctrl+C' },
  { id: 'remove', def: 'Delete' }
] as const

export type ShortcutId = (typeof SHORTCUTS)[number]['id']

export interface CustomToken {
  id: string
  name: string
  value: string
}

interface Prefs {
  numberStart: number
  numberWidth: number
  tokens: CustomToken[]
  shortcuts: Partial<Record<ShortcutId, string>>
  confirmWrite: boolean
  confirmClose: boolean
  confirmReset: boolean
  rememberVolume: boolean
  volume: number
  showFormatBadges: boolean
}

const KEY = 'mte.preferences'
const RESERVED = new Set(['n', 'artist', 'title', 'album', 'albumartist', 'year', 'track', 'disc', 'genre', 'filename'])

const listeners = new Set<() => void>()

function empty(): Prefs {
  return {
    numberStart: 1,
    numberWidth: 0,
    tokens: [],
    shortcuts: {},
    confirmWrite: true,
    confirmClose: true,
    confirmReset: true,
    rememberVolume: true,
    volume: 80,
    showFormatBadges: true
  }
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function read(): Prefs {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return empty()
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const tokens = Array.isArray(parsed.tokens)
      ? parsed.tokens.filter((item): item is CustomToken => Boolean(item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.value === 'string'))
      : []
    return {
      numberStart: clamp(parsed.numberStart, 0, 9999, 1),
      numberWidth: clamp(parsed.numberWidth, 0, 6, 0),
      tokens,
      shortcuts: parsed.shortcuts && typeof parsed.shortcuts === 'object' ? parsed.shortcuts : {},
      confirmWrite: flag(parsed.confirmWrite, true),
      confirmClose: flag(parsed.confirmClose, true),
      confirmReset: flag(parsed.confirmReset, true),
      rememberVolume: flag(parsed.rememberVolume, true),
      volume: clamp(parsed.volume, 0, 100, 80),
      showFormatBadges: flag(parsed.showFormatBadges, true)
    }
  } catch {
    return empty()
  }
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(number)) return fallback
  return Math.max(min, Math.min(max, number))
}

let current = read()

function persist(next: Prefs, native = true): void {
  current = next
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    /* storage can be unavailable */
  }
  listeners.forEach((listener) => listener())
  if (!native) return
  const shortcuts = {
    open: electronAccelerator(shortcutOf('open')),
    save: electronAccelerator(shortcutOf('save')),
    undo: electronAccelerator(shortcutOf('undo')),
    redo: electronAccelerator(shortcutOf('redo'))
  }
  void window.musicTagEditor?.setShortcuts(shortcuts)
}

function write(next: Prefs): void {
  persist(next)
}

export function getPrefs(): Prefs {
  return current
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(subscribePrefs, getPrefs, getPrefs)
}

export function shortcutOf(id: ShortcutId): string {
  if (Object.prototype.hasOwnProperty.call(current.shortcuts, id)) return current.shortcuts[id] ?? ''
  return SHORTCUTS.find((item) => item.id === id)?.def ?? ''
}

export function useShortcut(id: ShortcutId): string {
  usePrefs()
  return shortcutOf(id)
}

export function electronAccelerator(chord: string): string {
  if (!chord) return ''
  return chord.replace('Ctrl+', 'CmdOrCtrl+')
}

export function chordFromEvent(event: KeyboardEvent): string {
  if (event.key === 'Escape') return ''
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return ''
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  parts.push(key)
  return parts.join('+')
}

export function shortcutMatches(id: ShortcutId, event: KeyboardEvent): boolean {
  const chord = shortcutOf(id)
  return Boolean(chord) && chordFromEvent(event) === chord
}

export function setShortcut(id: ShortcutId, chord: string): void {
  const shortcuts = { ...current.shortcuts }
  for (const item of SHORTCUTS) {
    if (item.id !== id && shortcutOf(item.id) === chord) shortcuts[item.id] = ''
  }
  const def = SHORTCUTS.find((item) => item.id === id)?.def ?? ''
  if (chord === def) delete shortcuts[id]
  else shortcuts[id] = chord
  write({ ...current, shortcuts })
}

export function resetShortcuts(): void {
  write({ ...current, shortcuts: {} })
}

export function setNumberStart(value: number): void {
  write({ ...current, numberStart: clamp(value, 0, 9999, 1) })
}

export function setNumberWidth(value: number): void {
  write({ ...current, numberWidth: clamp(value, 0, 6, 0) })
}

export function setConfirmWrite(on: boolean): void {
  write({ ...current, confirmWrite: on })
}

export function setConfirmClose(on: boolean): void {
  write({ ...current, confirmClose: on })
}

export function setConfirmReset(on: boolean): void {
  write({ ...current, confirmReset: on })
}

export function setRememberVolume(on: boolean): void {
  write({ ...current, rememberVolume: on })
}

export function setShowFormatBadges(on: boolean): void {
  write({ ...current, showFormatBadges: on })
}

export function setPlayerVolume(value: number): void {
  const volume = clamp(value, 0, 100, 80)
  if (volume === current.volume) return
  persist({ ...current, volume }, false)
}

export function tokenNameError(name: string): boolean {
  const clean = name.trim().toLowerCase()
  if (!/^[a-z][a-z0-9]{0,20}$/.test(clean)) return true
  if (RESERVED.has(clean)) return true
  return current.tokens.some((item) => item.name.toLowerCase() === clean)
}

export function addToken(name: string, value: string): boolean {
  const clean = name.trim().toLowerCase()
  if (tokenNameError(clean)) return false
  const tokens = [...current.tokens, { id: `${Date.now()}`, name: clean, value }]
  write({ ...current, tokens })
  return true
}

export function removeToken(id: string): void {
  write({ ...current, tokens: current.tokens.filter((item) => item.id !== id) })
}

export function planTokens(): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const item of current.tokens) tokens[item.name.toLowerCase()] = item.value
  return tokens
}

export function syncShortcuts(): void {
  const native = {
    open: electronAccelerator(shortcutOf('open')),
    save: electronAccelerator(shortcutOf('save')),
    undo: electronAccelerator(shortcutOf('undo')),
    redo: electronAccelerator(shortcutOf('redo'))
  }
  void window.musicTagEditor?.setShortcuts(native)
}
