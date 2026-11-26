import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { initCustomTitlebar, titlebarOverlayColors } from './titlebar'
import type { StoredRhythm } from '@shared/analysis'
import type { LanguagePack } from '@shared/language-pack'
import {
  IPC,
  REPOSITORY_URL,
  type AppSettings,
  type AppSettingsSnapshot,
  type CoverArt,
  type HistoryMap,
  type MenuCommand,
  type ProgressEvent,
  type TrackSnapshot,
  type WriteJob,
  type WriteResult
} from '@shared/types'

const api = {
  platform: process.platform,
  openFiles: (): Promise<string[]> => ipcRenderer.invoke(IPC.openFiles),
  openFolder: (): Promise<string[]> => ipcRenderer.invoke(IPC.openFolder),
  pickFolder: (): Promise<string | null> => ipcRenderer.invoke(IPC.pickFolder),
  readTags: (paths: string[], options?: { stream?: boolean }): Promise<TrackSnapshot[]> => ipcRenderer.invoke(IPC.readTags, paths, options),
  cancelRead: (): void => {
    ipcRenderer.send(IPC.cancelRead)
  },
  readDetails: (paths: string[]): Promise<TrackSnapshot[]> => ipcRenderer.invoke(IPC.readDetails, paths),
  readRhythm: (path: string): Promise<StoredRhythm> => ipcRenderer.invoke(IPC.readRhythm, path),
  readCovers: (paths: string[]): Promise<{ path: string; cover: CoverArt | null }[]> => ipcRenderer.invoke(IPC.readCovers, paths),
  onTrackBatch: (callback: (tracks: TrackSnapshot[]) => void): (() => void) => {
    const listener = (_event: unknown, payload: TrackSnapshot[]) => callback(payload)
    ipcRenderer.on(IPC.trackBatch, listener)
    return () => ipcRenderer.removeListener(IPC.trackBatch, listener)
  },
  writeTags: (jobs: WriteJob[]): Promise<WriteResult[]> => ipcRenderer.invoke(IPC.writeTags, jobs),
  getPathForFile: (file: File): string => {
    try {
      return webUtils.getPathForFile(file)
    } catch {
      return ''
    }
  },
  onProgress: (callback: (event: ProgressEvent) => void): (() => void) => {
    const listener = (_event: unknown, payload: ProgressEvent) => callback(payload)
    ipcRenderer.on(IPC.progress, listener)
    return () => ipcRenderer.removeListener(IPC.progress, listener)
  },
  openCover: (): Promise<CoverArt | null> => ipcRenderer.invoke(IPC.openCover),
  saveCover: (cover: CoverArt): Promise<boolean> => ipcRenderer.invoke(IPC.saveCover, cover),
  saveText: (file: { text: string; name: string }): Promise<boolean> => ipcRenderer.invoke(IPC.saveText, file),
  saveCopy: (job: WriteJob): Promise<WriteResult> => ipcRenderer.invoke(IPC.saveCopy, job),
  getHistory: (): Promise<HistoryMap> => ipcRenderer.invoke(IPC.historyGet),
  pushHistory: (entries: Partial<HistoryMap>): Promise<HistoryMap> => ipcRenderer.invoke(IPC.historyPush, entries),
  dragFiles: (paths: string[]): void => {
    ipcRenderer.send(IPC.dragFiles, paths)
  },
  copyFiles: (paths: string[]): Promise<void> => ipcRenderer.invoke(IPC.copyFiles, paths),
  copyText: (text: string): Promise<void> => ipcRenderer.invoke(IPC.copyText, text),
  revealPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.revealPath, path),
  revealDir: (path: string): Promise<void> => ipcRenderer.invoke(IPC.revealDir, path),
  openPath: (path: string): Promise<void> => ipcRenderer.invoke(IPC.openPath, path),
  openDir: (path: string): Promise<void> => ipcRenderer.invoke(IPC.openDir, path),
  openRepository: (): Promise<void> => ipcRenderer.invoke(IPC.openRepository, REPOSITORY_URL),
  openIssues: (details: string): Promise<void> => ipcRenderer.invoke(IPC.openIssues, details),
  reloadWindow: (): Promise<void> => ipcRenderer.invoke(IPC.reloadWindow),
  setTitlebarDim: (dim: boolean): void => {
    ipcRenderer.send('mte:titlebar-overlay', titlebarOverlayColors(dim))
  },
  setLocale: (locale: 'ru' | 'en'): Promise<void> => ipcRenderer.invoke(IPC.setLocale, locale),
  getAppSettings: (): Promise<AppSettingsSnapshot> => ipcRenderer.invoke(IPC.getAppSettings),
  setAppSettings: (patch: Partial<AppSettings>): Promise<AppSettingsSnapshot> => ipcRenderer.invoke(IPC.setAppSettings, patch),
  loadLanguagePack: (): Promise<LanguagePack | null> => ipcRenderer.invoke(IPC.loadLanguagePack),
  setShortcuts: (shortcuts: { open: string; save: string; undo: string; redo: string }): Promise<void> => ipcRenderer.invoke(IPC.setShortcuts, shortcuts),
  confirmClose: (): Promise<void> => ipcRenderer.invoke(IPC.closeConfirm, true),
  onCloseQuery: (callback: () => void): (() => void) => {
    const listener = () => callback()
    ipcRenderer.on(IPC.closeQuery, listener)
    return () => ipcRenderer.removeListener(IPC.closeQuery, listener)
  },
  onMenu: (callback: (command: MenuCommand) => void): (() => void) => {
    const listener = (_event: unknown, command: MenuCommand) => callback(command)
    ipcRenderer.on(IPC.menu, listener)
    return () => ipcRenderer.removeListener(IPC.menu, listener)
  }
}

contextBridge.exposeInMainWorld('musicTagEditor', api)

function isFileDrag(event: DragEvent): boolean {
  const types = event.dataTransfer?.types
  return !types || types.length === 0 || Array.from(types).includes('Files')
}

function allowExternalDrop(event: DragEvent): void {
  // внутренние драги страницы (перестановка разделов и т. п.) не трогаем: иначе dropEffect = 'copy'
  // конфликтует с effectAllowed = 'move' и drop отменяется
  if (!isFileDrag(event)) return
  event.preventDefault()
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
}

window.addEventListener('dragover', allowExternalDrop)
window.addEventListener('drop', (event) => {
  event.preventDefault()
})

initCustomTitlebar()