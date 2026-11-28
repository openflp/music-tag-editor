import type { LocaleId } from '@shared/i18n'
import type { LanguagePack } from '@shared/language-pack'
import type { ReleaseInfo } from '@shared/update'
import type { StoredRhythm } from '@shared/analysis'
import type { AppSettings, AppSettingsSnapshot, CoverArt, HistoryMap, MenuCommand, NativeShortcuts, ProgressEvent, TrackSnapshot, WriteJob, WriteResult } from '@shared/types'

export interface MusicApi {
  platform: NodeJS.Platform
  openFiles: () => Promise<string[]>
  openFolder: () => Promise<string[]>
  pickFolder: () => Promise<string | null>
  // stream: true — треки приходят только пачками через onTrackBatch, итоговый массив пустой
  readTags: (paths: string[], options?: { stream?: boolean }) => Promise<TrackSnapshot[]>
  cancelRead: () => void
  readDetails: (paths: string[]) => Promise<TrackSnapshot[]>
  readRhythm: (path: string) => Promise<StoredRhythm>
  readCovers: (paths: string[]) => Promise<{ path: string; cover: CoverArt | null }[]>
  onTrackBatch: (callback: (tracks: TrackSnapshot[]) => void) => () => void
  writeTags: (jobs: WriteJob[]) => Promise<WriteResult[]>
  getPathForFile: (file: File) => string
  onProgress: (callback: (event: ProgressEvent) => void) => () => void
  openCover: () => Promise<CoverArt | null>
  saveCover: (cover: CoverArt) => Promise<boolean>
  saveText: (file: { text: string; name: string }) => Promise<boolean>
  saveCopy: (job: WriteJob) => Promise<WriteResult>
  getHistory: () => Promise<HistoryMap>
  pushHistory: (entries: Partial<HistoryMap>) => Promise<HistoryMap>
  dragFiles: (paths: string[]) => void
  copyFiles: (paths: string[]) => Promise<void>
  copyText: (text: string) => Promise<void>
  revealPath: (path: string) => Promise<void>
  revealDir: (path: string) => Promise<void>
  openPath: (path: string) => Promise<void>
  openDir: (path: string) => Promise<void>
  openRepository: () => Promise<void>
  openReleases: () => Promise<void>
  openRelease: (tag: string) => Promise<void>
  appVersion: () => Promise<string>
  checkUpdates: () => Promise<{ current: string; versions: ReleaseInfo[] }>
  openIssues: (details: string) => Promise<void>
  reloadWindow: () => Promise<void>
  setLocale: (locale: LocaleId) => Promise<void>
  getAppSettings: () => Promise<AppSettingsSnapshot>
  setAppSettings: (patch: Partial<AppSettings>) => Promise<AppSettingsSnapshot>
  loadLanguagePack: () => Promise<LanguagePack | null>
  setShortcuts: (shortcuts: NativeShortcuts) => Promise<void>
  confirmClose: () => Promise<void>
  onCloseQuery: (callback: () => void) => () => void
  onMenu: (callback: (command: MenuCommand) => void) => () => void
}
