export const AUDIO_EXTENSIONS = [
  '.mp3',
  '.wav',
  '.ogg',
  '.oga',
  '.opus',
  '.flac',
  '.m4a',
  '.aac',
  '.aif',
  '.aiff',
  '.wma'
] as const

export type AudioExtension = (typeof AUDIO_EXTENSIONS)[number]

export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif'] as const

export const MAX_COVER_BYTES = 8 * 1024 * 1024
export const MAX_LYRICS_CHARS = 8000
export const MAX_FILES = 5000
export const HISTORY_LIMIT = 20

export const APPLY_FIELDS = ['artist', 'album', 'albumArtist', 'genre', 'year', 'comment'] as const
export const SOLO_FIELDS = ['title', 'trackNumber', 'trackTotal', 'discNumber', 'discTotal', 'lyrics'] as const
export const HISTORY_FIELDS = ['artist', 'album', 'albumArtist', 'genre'] as const

export type ApplyField = (typeof APPLY_FIELDS)[number]
export type SoloField = (typeof SOLO_FIELDS)[number]
export type TagField = ApplyField | SoloField
export type HistoryField = (typeof HISTORY_FIELDS)[number]

export interface TrackTags {
  title: string
  artist: string
  album: string
  albumArtist: string
  genre: string
  year: number | null
  trackNumber: number | null
  trackTotal: number | null
  discNumber: number | null
  discTotal: number | null
  comment: string
  lyrics: string
}

export interface CoverArt {
  mime: string
  bytes: number
  dataBase64: string
  // key — отпечаток содержимого (размер:sha1). Равные key = одинаковые байты.
  key?: string
  // lazy — «заглушка» обложки из файла: dataBase64 пуст, байты читаются по требованию (readCovers).
  // Заглушку НЕЛЬЗЯ записывать в файл: перед записью она заменяется полной обложкой.
  lazy?: boolean
  // файл, из которого её можно прочитать (подсказка; запасной вариант — пути треков с тем же key)
  src?: string
}

export interface TrackFact {
  key: string
  value: string
}

export interface TrackTech {
  durationMs: number
  bitrate: number
  sampleRate: number
  channels: number
  channelMode: '' | 'joint' | 'dual'
  bitsPerSample: number
  size: number
  createdMs: number
  modifiedMs: number
  bpm: number
  key: string
  encoder: string
  codec: string
  container: string
  lossless: boolean
  tagTypes: string
  composer: string
  publisher: string
  copyright: string
  conductor: string
  grouping: string
  remix: string
  subtitle: string
  isrc: string
  musicBrainz: string
  replayGain: string
  lyrics: string
  facts: TrackFact[]
}

export function emptyTech(): TrackTech {
  return {
    durationMs: 0,
    bitrate: 0,
    sampleRate: 0,
    channels: 0,
    channelMode: '',
    bitsPerSample: 0,
    size: 0,
    createdMs: 0,
    modifiedMs: 0,
    bpm: 0,
    key: '',
    encoder: '',
    codec: '',
    container: '',
    lossless: false,
    tagTypes: '',
    facts: [],
    composer: '',
    publisher: '',
    copyright: '',
    conductor: '',
    grouping: '',
    remix: '',
    subtitle: '',
    isrc: '',
    musicBrainz: '',
    replayGain: '',
    lyrics: ''
  }
}

export interface TrackSnapshot {
  path: string
  format: string
  error?: string
  // false — «лёгкое» чтение для списка: без tech.facts, encoder, tagTypes (догружаются readDetails)
  detailed?: boolean
  tags: TrackTags
  cover: CoverArt | null
  tech: TrackTech
}

export type TagPatch = Partial<TrackTags>

export interface RhythmWrite {
  bpm: number
  initialKey: string
}

export interface WriteJob {
  path: string
  patch: TagPatch
  cover?: CoverArt | null
  targetPath?: string
  rhythm?: RhythmWrite
}

export interface WriteResult {
  path: string
  ok: boolean
  savedPath?: string
  error?: string
  code?: 'locked' | 'readonly' | 'invalid' | 'cancelled' | 'unknown'
}

export interface ProgressEvent {
  current: number
  total: number
  path: string
}

export type HistoryMap = Record<HistoryField, string[]>

export type SheetTab = 'main' | 'note' | 'lyrics' | 'detail' | 'file'

export type MenuCommand =
  | 'open'
  | 'folder'
  | 'save'
  | 'undo'
  | 'redo'
  | 'prev'
  | 'next'
  | 'refresh'
  | 'remove'
  | 'clear'
  | 'reveal'
  | 'openFile'
  | 'palette'
  | 'settings'
  | 'toggleSidebar'
  | 'togglePlayer'
  | `tab:${SheetTab}`

export const ZOOM_STEPS = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const

export type ZoomStep = (typeof ZOOM_STEPS)[number]

export const MENU_BAR_MODES = ['icon', 'bar'] as const

export type MenuBarMode = (typeof MENU_BAR_MODES)[number]

export interface AppSettings {
  hardwareAcceleration: boolean
  backgroundThrottling: boolean
  spellcheck: boolean
  zoom: ZoomStep
  openAtLogin: boolean
  alwaysOnTop: boolean
  restoreBounds: boolean
  menuBar: MenuBarMode
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  hardwareAcceleration: true,
  backgroundThrottling: false, // ИЗМЕНЕНО: было true, из-за этого в свёрнутом окне рвалось затухание плеера
  spellcheck: false,
  zoom: 1,
  openAtLogin: false,
  alwaysOnTop: false,
  restoreBounds: true,
  menuBar: 'icon'
}

export interface AppSettingsSnapshot {
  settings: AppSettings
  hardwareAccelerationLive: boolean
}

export const REPOSITORY_URL = 'https://github.com/openflp/music-tag-editor'
export const ISSUES_URL = 'https://github.com/openflp/music-tag-editor/issues/new'

export const IPC = {
  openFiles: 'files:open',
  openFolder: 'files:open-folder',
  pickFolder: 'files:pick-folder',
  readTags: 'tags:read',
  cancelRead: 'tags:cancel',
  readDetails: 'tags:details',
  readRhythm: 'tags:rhythm',
  readCovers: 'tags:covers',
  trackBatch: 'tags:batch',
  writeTags: 'tags:write',
  progress: 'tags:progress',
  openCover: 'cover:open',
  saveCover: 'cover:save',
  saveText: 'text:save',
  saveCopy: 'tags:save-copy',
  historyGet: 'history:get',
  historyPush: 'history:push',
  dragFiles: 'shell:drag-files',
  copyFiles: 'shell:copy-files',
  copyText: 'shell:copy-text',
  setShortcuts: 'app:shortcuts',
  revealPath: 'shell:reveal',
  revealDir: 'shell:reveal-dir',
  openPath: 'shell:open',
  openDir: 'shell:open-dir',
  openRepository: 'shell:open-repository',
  openIssues: 'shell:open-issues',
  reloadWindow: 'window:reload',
  setLocale: 'app:locale',
  getAppSettings: 'app:settings-get',
  setAppSettings: 'app:settings-set',
  loadLanguagePack: 'app:language-pack',
  closeQuery: 'window:close-query',
  closeConfirm: 'window:close-confirm',
  menu: 'menu:command'
} as const

export function emptyTags(): TrackTags {
  return {
    title: '',
    artist: '',
    album: '',
    albumArtist: '',
    genre: '',
    year: null,
    trackNumber: null,
    trackTotal: null,
    discNumber: null,
    discTotal: null,
    comment: '',
    lyrics: ''
  }
}

export function emptyHistory(): HistoryMap {
  return { artist: [], album: [], albumArtist: [], genre: [] }
}