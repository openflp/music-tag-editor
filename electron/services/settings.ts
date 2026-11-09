import { createRequire } from 'node:module'
import { app } from 'electron'
import { mergeHistoryList } from '@shared/history'
import { DEFAULT_APP_SETTINGS, HISTORY_FIELDS, ZOOM_STEPS, emptyHistory, type AppSettings, type HistoryField, type HistoryMap, type MenuBarMode, type ZoomStep } from '@shared/types'

interface Bounds {
  x: number
  y: number
  width: number
  height: number
  maximized: boolean
}

interface Persisted {
  bounds?: Bounds
  history: HistoryMap
  app?: AppSettings
}

interface StoreLike<T> {
  get<K extends keyof T>(key: K): T[K]
  set<K extends keyof T>(key: K, value: T[K]): void
}

const require = createRequire(import.meta.url)
const Store = require('electron-store') as new (options?: { name?: string; cwd?: string; defaults?: Persisted }) => StoreLike<Persisted>

let store: StoreLike<Persisted> | null = null

function getStore(): StoreLike<Persisted> {
  if (!store) {
    store = new Store({
      name: 'music-tag-editor',
      cwd: app.getPath('userData'),
      defaults: { history: emptyHistory(), app: DEFAULT_APP_SETTINGS }
    })
  }
  return store
}

function asZoom(value: unknown): ZoomStep {
  return typeof value === 'number' && (ZOOM_STEPS as readonly number[]).includes(value) ? (value as ZoomStep) : DEFAULT_APP_SETTINGS.zoom
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function asMenuBar(value: unknown): MenuBarMode {
  return value === 'icon' || value === 'bar' ? value : DEFAULT_APP_SETTINGS.menuBar
}

export function readAppSettings(): AppSettings {
  const raw = getStore().get('app')
  const item = raw && typeof raw === 'object' ? raw : DEFAULT_APP_SETTINGS
  return {
    hardwareAcceleration: asBool(item.hardwareAcceleration, DEFAULT_APP_SETTINGS.hardwareAcceleration),
    backgroundThrottling: asBool(item.backgroundThrottling, DEFAULT_APP_SETTINGS.backgroundThrottling),
    spellcheck: asBool(item.spellcheck, DEFAULT_APP_SETTINGS.spellcheck),
    zoom: asZoom(item.zoom),
    openAtLogin: asBool(item.openAtLogin, DEFAULT_APP_SETTINGS.openAtLogin),
    alwaysOnTop: asBool(item.alwaysOnTop, DEFAULT_APP_SETTINGS.alwaysOnTop),
    restoreBounds: asBool(item.restoreBounds, DEFAULT_APP_SETTINGS.restoreBounds),
    menuBar: asMenuBar(item.menuBar)
  }
}

export function writeAppSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...readAppSettings(), ...patch }
  getStore().set('app', next)
  return next
}

export function readBounds(): Bounds | undefined {
  return getStore().get('bounds')
}

export function writeBounds(bounds: Bounds): void {
  getStore().set('bounds', bounds)
}

function asHistoryList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string')
}

export function readHistory(): HistoryMap {
  const raw = getStore().get('history')
  const history = emptyHistory()
  if (!raw || typeof raw !== 'object') return history
  for (const field of HISTORY_FIELDS) history[field] = asHistoryList(raw[field])
  return history
}

export function pushHistory(partial: Partial<HistoryMap>): HistoryMap {
  const current = readHistory()
  for (const field of HISTORY_FIELDS) {
    current[field] = mergeHistoryList(current[field], asHistoryList(partial[field]))
  }
  getStore().set('history', current)
  return current
}

export type { HistoryField }
