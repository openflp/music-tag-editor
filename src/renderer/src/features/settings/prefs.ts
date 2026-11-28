import { useSyncExternalStore } from 'react'
import type { NativeShortcuts } from '@shared/types'
import { isMac } from '@/shared/lib/platform'

export const SHORTCUTS = [
  { id: 'open', def: 'Ctrl+O' },
  { id: 'folder', def: 'Ctrl+Shift+O' },
  { id: 'openFile', def: 'Ctrl+Enter' },
  { id: 'formatBadges', def: 'Ctrl+Shift+F' },
  { id: 'play', def: 'Space' },
  { id: 'save', def: 'Ctrl+S' },
  { id: 'undo', def: 'Ctrl+Z' },
  { id: 'redo', def: isMac ? 'Ctrl+Shift+Z' : 'Ctrl+Y' },
  { id: 'redoAlt', def: isMac ? 'Ctrl+Y' : 'Ctrl+Shift+Z' },
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
  { id: 'remove', def: isMac ? 'Ctrl+Backspace' : 'Delete' },
  { id: 'sidebar', def: 'Ctrl+B' },
  { id: 'player', def: 'Ctrl+Shift+B' },
  { id: 'refresh', def: 'F5' },
  { id: 'clear', def: 'Ctrl+Shift+W' },
  { id: 'quit', def: 'Ctrl+Q' },
  { id: 'onTop', def: 'Ctrl+Shift+T' },
  { id: 'zoomIn', def: 'Ctrl++' },
  { id: 'zoomOut', def: 'Ctrl+-' },
  { id: 'zoomReset', def: 'Ctrl+0' },
  { id: 'reload', def: 'Ctrl+R' },
  { id: 'helpShortcuts', def: 'F1' },
  { id: 'github', def: 'Ctrl+Shift+G' },
  { id: 'report', def: 'Ctrl+Shift+U' }
] as const

export type ShortcutId = (typeof SHORTCUTS)[number]['id']

export interface CustomToken {
  id: string
  name: string
  value: string
  enabled: boolean
}

interface Prefs {
  numberStart: number
  numberWidth: number
  builtinOff: string[]
  tokens: CustomToken[]
  checkUpdates: boolean
  shortcuts: Partial<Record<ShortcutId, string>>
  confirmWrite: boolean
  confirmClose: boolean
  confirmReset: boolean
  confirmClearLoad: boolean
  rememberVolume: boolean
  volume: number
  showFormatBadges: boolean
  languageOrder: string[]
}

const KEY = 'mte.preferences'
const RESERVED = new Set(['n', 'artist', 'title', 'album', 'albumartist', 'year', 'track', 'disc', 'genre', 'filename'])

const listeners = new Set<() => void>()

function empty(): Prefs {
  return {
    numberStart: 1,
    numberWidth: 0,
    builtinOff: [],
    tokens: [],
    checkUpdates: false,
    shortcuts: {},
    confirmWrite: true,
    confirmClose: true,
    confirmReset: true,
    confirmClearLoad: true,
    rememberVolume: true,
    volume: 80,
    showFormatBadges: true,
    languageOrder: []
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
    const tokens = Array.isArray(parsed.tokens) ? parsed.tokens.flatMap((item) => tokenOf(item)) : []
    const builtinOff = Array.isArray(parsed.builtinOff)
      ? parsed.builtinOff.filter((item): item is string => typeof item === 'string' && RESERVED.has(item))
      : []
    return {
      numberStart: clamp(parsed.numberStart, 0, 9999, 1),
      numberWidth: clamp(parsed.numberWidth, 0, 6, 0),
      tokens,
      builtinOff,
      checkUpdates: flag(parsed.checkUpdates, false),
      shortcuts: parsed.shortcuts && typeof parsed.shortcuts === 'object' ? parsed.shortcuts : {},
      confirmWrite: flag(parsed.confirmWrite, true),
      confirmClose: flag(parsed.confirmClose, true),
      confirmReset: flag(parsed.confirmReset, true),
      confirmClearLoad: flag(parsed.confirmClearLoad, true),
      rememberVolume: flag(parsed.rememberVolume, true),
      volume: clamp(parsed.volume, 0, 100, 80),
      showFormatBadges: flag(parsed.showFormatBadges, true),
      languageOrder: Array.isArray(parsed.languageOrder)
        ? [...new Set(parsed.languageOrder.filter((item): item is string => typeof item === 'string'))]
        : []
    }
  } catch {
    return empty()
  }
}

function tokenOf(item: unknown): CustomToken[] {
  if (!item || typeof item !== 'object') return []
  const row = item as Record<string, unknown>
  if (typeof row.id !== 'string' || typeof row.name !== 'string' || typeof row.value !== 'string') return []
  return [{ id: row.id, name: row.name, value: row.value, enabled: row.enabled !== false }]
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
  void window.musicTagEditor?.setShortcuts(nativeShortcuts())
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

const ELECTRON_KEYS: Record<string, string> = {
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right'
}

// Ключи, которые main (assertAccelerator) принимает; остальное в нативное меню не отдаём.
const NATIVE_KEY = /^([A-Z0-9]|Delete|Backspace|Enter|Space|Home|End|Up|Down|Left|Right|F([1-9]|1[0-2]))$/

export function electronAccelerator(chord: string): string {
  if (!chord) return ''
  const parts = chord.split('+')
  const key = parts.pop() ?? ''
  const native = ELECTRON_KEYS[key] ?? key
  if (!NATIVE_KEY.test(native)) return ''
  const mods = parts.map((part) => (part === 'Ctrl' ? 'CmdOrCtrl' : part))
  return [...mods, native].join('+')
}

// Буква/цифра берётся из event.key, пока это ASCII (учитывает Dvorak/AZERTY).
// На не-латинской раскладке (ru) и при Option на macOS event.key даёт другой символ,
// тогда используем физический код клавиши.
function keyName(event: KeyboardEvent): string {
  if (/^[a-z0-9]$/i.test(event.key)) return event.key.toUpperCase()
  if (/^Key[A-Z]$/.test(event.code)) return event.code.slice(3)
  if (/^Digit[0-9]$/.test(event.code)) return event.code.slice(5)
  if (event.key === ' ') return 'Space'
  return event.key.length === 1 ? event.key.toUpperCase() : event.key
}

// «Ctrl» в хордах = основной модификатор платформы: Cmd на macOS, Ctrl в остальных.
export function chordFromEvent(event: KeyboardEvent): string {
  if (event.key === 'Escape') return ''
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return ''
  // физический Ctrl на macOS — это emacs-привязки в полях ввода, не шорткат приложения
  if (isMac && event.ctrlKey && !event.metaKey) return ''
  const parts: string[] = []
  if (isMac ? event.metaKey : event.ctrlKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  parts.push(keyName(event))
  return parts.join('+')
}

const PLUS_CHORDS = new Set(['Ctrl+=', 'Ctrl++', 'Ctrl+Shift+=', 'Ctrl+Shift++'])

export function shortcutMatches(id: ShortcutId, event: KeyboardEvent): boolean {
  const chord = shortcutOf(id)
  if (!chord) return false
  const got = chordFromEvent(event)
  if (got === chord) return true
  // «+» на основной клавиатуре — это Shift+=, на цифровой — «+». Оба увеличивают масштаб.
  return id === 'zoomIn' && PLUS_CHORDS.has(chord) && PLUS_CHORDS.has(got)
}

const MAC_KEYS: Record<string, string> = {
  Delete: '⌦',
  Backspace: '⌫',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Tab: '⇥',
  Enter: '↩'
}

/** Для показа пользователю: на macOS ⌥⇧⌘K, иначе как есть. */
export function formatChord(chord: string): string {
  if (!chord || !isMac) return chord
  const parts = chord.split('+')
  const key = parts.pop() ?? ''
  return `${parts.includes('Alt') ? '⌥' : ''}${parts.includes('Shift') ? '⇧' : ''}${parts.includes('Ctrl') ? '⌘' : ''}${MAC_KEYS[key] ?? key}`
}

/** Для aria-keyshortcuts. */
export function ariaChord(chord: string): string {
  return chord
    .split('+')
    .map((part) => (part === 'Ctrl' ? (isMac ? 'Meta' : 'Control') : part))
    .join('+')
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

export function setConfirmClearLoad(on: boolean): void {
  write({ ...current, confirmClearLoad: on })
}

export function setRememberVolume(on: boolean): void {
  write({ ...current, rememberVolume: on })
}

export function setShowFormatBadges(on: boolean): void {
  write({ ...current, showFormatBadges: on })
}

/** Порядок строк в списке языков: id встроенных ('ru', 'en') и языковых пакетов. */
export function setLanguageOrder(ids: string[]): void {
  persist({ ...current, languageOrder: [...new Set(ids)] }, false)
}

export function setPlayerVolume(value: number): void {
  const volume = clamp(value, 0, 100, 80)
  if (volume === current.volume) return
  persist({ ...current, volume }, false)
}

export function tokenNameError(name: string, exceptId?: string): boolean {
  const clean = name.trim().toLowerCase()
  if (!/^[a-z][a-z0-9]{0,20}$/.test(clean)) return true
  if (RESERVED.has(clean)) return true
  return current.tokens.some((item) => item.id !== exceptId && item.name.toLowerCase() === clean)
}

export function addToken(name: string, value: string): boolean {
  const clean = name.trim().toLowerCase()
  if (tokenNameError(clean)) return false
  const tokens = [...current.tokens, { id: `${Date.now()}`, name: clean, value, enabled: true }]
  write({ ...current, tokens })
  return true
}

/** Меняет имя и значение своего оператора; место в списке и состояние «включён» сохраняются. */
export function updateToken(id: string, name: string, value: string): boolean {
  const clean = name.trim().toLowerCase()
  if (tokenNameError(clean, id)) return false
  if (!current.tokens.some((item) => item.id === id)) return false
  write({ ...current, tokens: current.tokens.map((item) => (item.id === id ? { ...item, name: clean, value } : item)) })
  return true
}

export function removeToken(id: string): void {
  write({ ...current, tokens: current.tokens.filter((item) => item.id !== id) })
}

export function setTokenEnabled(id: string, enabled: boolean): void {
  write({ ...current, tokens: current.tokens.map((item) => (item.id === id ? { ...item, enabled } : item)) })
}

/** Операторы включены, если включён хотя бы один встроенный или свой. */
export function operatorsEnabled(prefs: Prefs = current): boolean {
  return prefs.builtinOff.length < RESERVED.size || prefs.tokens.some((item) => item.enabled)
}

/** Включить или выключить все операторы разом (встроенные и свои). */
export function setAllOperators(enabled: boolean): void {
  write({
    ...current,
    builtinOff: enabled ? [] : [...RESERVED],
    tokens: current.tokens.map((item) => (item.enabled === enabled ? item : { ...item, enabled }))
  })
}

export function setCheckUpdates(on: boolean): void {
  write({ ...current, checkUpdates: on })
}

export function planTokens(): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const item of current.tokens) {
    if (item.enabled) tokens[item.name.toLowerCase()] = item.value
  }
  return tokens
}

export function nativeShortcuts(): NativeShortcuts {
  return {
    open: electronAccelerator(shortcutOf('open')),
    folder: electronAccelerator(shortcutOf('folder')),
    openFile: electronAccelerator(shortcutOf('openFile')),
    formatBadges: electronAccelerator(shortcutOf('formatBadges')),
    save: electronAccelerator(shortcutOf('save')),
    undo: electronAccelerator(shortcutOf('undo')),
    redo: electronAccelerator(shortcutOf('redo'))
  }
}

/** Системное меню уже забрало это сочетание, повторно в окне его не ловим. */
export function menuOwnsShortcut(id: ShortcutId): boolean {
  return electronAccelerator(shortcutOf(id)) !== ''
}

export function syncShortcuts(): void {
  void window.musicTagEditor?.setShortcuts(nativeShortcuts())
}