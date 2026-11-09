import { useSyncExternalStore } from 'react'
import { DEFAULT_APP_SETTINGS, type AppSettings, type AppSettingsSnapshot } from '@shared/types'

let current: AppSettingsSnapshot = { settings: DEFAULT_APP_SETTINGS, hardwareAccelerationLive: true }
let touched = false
const listeners = new Set<() => void>()

function emit(): void {
  listeners.forEach((listener) => listener())
}

export function getAppSettings(): AppSettingsSnapshot {
  return current
}

export function subscribeAppSettings(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAppSettings(): AppSettingsSnapshot {
  return useSyncExternalStore(subscribeAppSettings, getAppSettings, getAppSettings)
}

export async function loadAppSettings(): Promise<void> {
  if (!window.musicTagEditor || touched) return
  try {
    const next = await window.musicTagEditor.getAppSettings()
    if (touched) return
    current = next
    emit()
  } catch {
    /* the main process may be unavailable */
  }
}

export function setAppSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  touched = true
  current = { ...current, settings: { ...current.settings, [key]: value } }
  emit()
  void window.musicTagEditor?.setAppSettings({ [key]: value })
}
