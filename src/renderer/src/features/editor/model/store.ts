import type { CoverArt, HistoryMap, TagField, TrackSnapshot, TrackTags, TrackTech, WriteJob } from '@shared/types'
import { collectHistory } from '@shared/history'
import { APPLY_FIELDS, emptyHistory, emptyTags } from '@shared/types'
import { buildJobs, coverSame, numberingActive, preparePlan, previewJobs, sameValue, trackDirty, uniformField, type PlanState, type PlanTrack, type WriteChange } from '@shared/plan'
import { hasNumberToken, orderWrites } from '@shared/filename'
import { getPrefs, planTokens, subscribePrefs } from '@/features/settings/prefs'
import type { PreviewWords } from '@shared/plan'
import { getLocale, getPack, tr } from '@/shared/i18n'
import { create } from 'zustand'

export interface TrackVm {
  path: string
  format: string
  error?: string
  original: TrackTags
  draft: TrackTags
  originalCover: CoverArt | null
  draftCover: CoverArt | null
  tech: TrackTech
}

interface UndoSnap {
  drafts: Record<string, TrackTags>
  covers: Record<string, CoverArt | null>
  applyAll: PlanState['applyAll']
  applyValues: TrackTags
  applyCover: boolean
  sharedCover: CoverArt | null
  fileMask: string
  fileDir: string
  fileAll: boolean
  fileNumbers: Record<string, string>
  fileNumberSeed: number
}

export interface Toast {
  kind: 'ok' | 'err'
  text: string
  id?: number
}

interface EditorState {
  tracks: TrackVm[]
  selected: string[]
  anchor: string | null
  focus: string | null
  listOrder: string[]
  nowPlaying: string | null
  playCommand: { id: number; type: 'play' | 'pause'; path: string } | null
  applyAll: PlanState['applyAll']
  applyValues: TrackTags
  applyCover: boolean
  sharedCover: CoverArt | null
  history: HistoryMap
  loading: boolean
  saving: boolean
  progress: { current: number; total: number; path: string } | null
  toast: Toast | null
  writeErrors: { path: string; error: string; code?: string }[]
  undo: UndoSnap[]
  redo: UndoSnap[]
  fileMask: string
  fileDir: string
  fileAll: boolean
  fileNumbers: Record<string, string>
  fileNumberSeed: number
  sourceDir: string | null
  savePreview: WriteChange[] | null
  resetAsk: boolean
  closeAsk: boolean
  addPaths: (paths: string[]) => Promise<void>
  openDialog: () => Promise<void>
  openFolder: () => Promise<void>
  refresh: () => Promise<void>
  refreshSource: () => Promise<void>
  revealSource: () => Promise<void>
  openSource: () => Promise<void>
  revealCurrent: () => Promise<void>
  revealFile: (path: string) => Promise<void>
  openCurrent: () => Promise<void>
  openFile: (path: string) => Promise<void>
  clear: () => void
  remove: (path: string) => void
  removeSelected: () => void
  select: (path: string, mode: 'single' | 'toggle' | 'range') => void
  selectAll: () => void
  selectEdge: (edge: 'start' | 'end', extend?: boolean) => void
  selectDelta: (direction: 1 | -1, extend?: boolean) => void
  setListOrder: (paths: string[]) => void
  setTrackOrder: (paths: string[]) => void
  setField: (field: TagField, value: TrackTags[TagField]) => void
  setApply: (field: (typeof APPLY_FIELDS)[number], on: boolean) => void
  setApplyEvery: (on: boolean) => void
  setApplyScope: (on: boolean) => void
  setCover: (cover: CoverArt | null) => void
  setApplyCover: (on: boolean) => void
  reset: () => void
  undoOnce: () => void
  redoOnce: () => void
  undoTo: (index: number) => void
  redoTo: (index: number) => void
  requestSave: () => void
  confirmSave: () => void
  dismissSave: () => void
  requestReset: () => void
  confirmReset: () => void
  dismissReset: () => void
  requestClose: () => void
  confirmClose: () => void
  dismissClose: () => void
  setFileMask: (mask: string) => void
  setFileDir: (directory: string) => void
  setFileAll: (on: boolean) => void
  setFileNumber: (path: string, value: string) => void
  reshuffleNumbers: () => void
  pickFileDir: () => Promise<void>
  saveAll: () => Promise<void>
  saveCopy: (path: string) => Promise<void>
  notify: (toast: Toast) => void
  requestPlay: (path: string) => void
  dismissToast: () => void
  holdToast: () => void
  resumeToast: () => void
}

const applyOff = (): PlanState['applyAll'] => ({
  artist: false,
  album: false,
  albumArtist: false,
  genre: false,
  year: false,
  comment: false
})

function writeApply<K extends (typeof APPLY_FIELDS)[number]>(tags: TrackTags, field: K, value: TrackTags[K]): void {
  tags[field] = value
}

function fillApply(tags: TrackTags, fields: readonly (typeof APPLY_FIELDS)[number][], tracks: TrackVm[]): void {
  for (const field of fields) {
    const values = tracks.map((track) => track.draft[field])
    const uniform = uniformField(values, sameValue)
    const fallback = emptyTags()[field]
    const next = uniform.mixed || uniform.value === null ? fallback : uniform.value
    writeApply(tags, field, next as TrackTags[typeof field])
  }
}

function pathKey(filePath: string): string {
  const norm = filePath.replaceAll('\\', '/')
  const platform = window.musicTagEditor?.platform ?? 'win32'
  return platform === 'linux' ? norm : norm.toLowerCase()
}

function parentDir(filePath: string): string {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  return slash > 0 ? filePath.slice(0, slash) : ''
}

function sharedDir(paths: string[]): string | null {
  const dirs = new Set(paths.map(parentDir).filter(Boolean))
  return dirs.size === 1 ? [...dirs][0] : null
}

function inDir(filePath: string, dir: string): boolean {
  const root = dir.replace(/[\\/]+$/, '')
  const key = pathKey(filePath)
  const base = pathKey(root)
  return key === base || key.startsWith(`${base}/`)
}

function tagsOf(snapshot: TrackSnapshot): TrackTags {
  return {
    ...emptyTags(),
    ...snapshot.tags,
    lyrics: snapshot.tags.lyrics ?? snapshot.tech.lyrics ?? ''
  }
}

function toVm(snapshot: TrackSnapshot): TrackVm {
  const tags = tagsOf(snapshot)
  return {
    path: snapshot.path,
    format: snapshot.format,
    error: snapshot.error,
    original: tags,
    draft: { ...tags },
    originalCover: snapshot.cover,
    draftCover: snapshot.cover,
    tech: snapshot.tech
  }
}

// Обновление с диска не должно терять несохранённый ввод (аудит B3): поля, которые пользователь
// успел изменить (draft != original), и изменённая обложка остаются, всё остальное берётся с диска.
function mergeRefreshed(track: TrackVm, snapshot: TrackSnapshot): TrackVm {
  const next = toVm(snapshot)
  const draft: TrackTags = { ...next.draft }
  const keep = <K extends keyof TrackTags>(key: K): void => {
    if (track.draft[key] !== track.original[key]) draft[key] = track.draft[key]
  }
  for (const key of Object.keys(draft) as (keyof TrackTags)[]) keep(key)
  const coverEdited = track.draftCover !== track.originalCover
  return { ...next, draft, draftCover: coverEdited ? track.draftCover : next.draftCover }
}

// Ручные номера файлов не должны переживать удаление строки (аудит E4).
function withoutNumbers(numbers: Record<string, string>, drop: ReadonlySet<string>): Record<string, string> {
  let changed = false
  const next: Record<string, string> = {}
  for (const [path, value] of Object.entries(numbers)) {
    if (drop.has(path)) changed = true
    else next[path] = value
  }
  return changed ? next : numbers
}

function planOf(track: TrackVm): PlanTrack {
  return {
    path: track.path,
    error: track.error,
    original: track.original,
    draft: track.draft,
    originalCover: track.originalCover,
    draftCover: track.draftCover
  }
}

function planState(state: Pick<EditorState, 'tracks' | 'selected' | 'applyAll' | 'applyValues' | 'applyCover' | 'sharedCover' | 'fileMask' | 'fileDir' | 'fileAll' | 'fileNumbers' | 'fileNumberSeed'>): PlanState {
  return preparePlan(state.tracks.map(planOf), {
    applyAll: state.applyAll,
    applyValues: state.applyValues,
    applyCover: state.applyCover,
    sharedCover: state.sharedCover,
    fileName: {
      mask: state.fileMask,
      directory: state.fileDir,
      platform: window.musicTagEditor?.platform ?? 'win32',
      seed: state.fileNumberSeed,
      fixed: state.fileNumbers,
      all: state.fileAll,
      selected: state.selected,
      start: getPrefs().numberStart,
      width: getPrefs().numberWidth,
      tokens: planTokens()
    }
  })
}

function pushUndo(state: EditorState): { undo: UndoSnap[]; redo: UndoSnap[] } {
  return { undo: [...state.undo, takeSnap(state)].slice(-30), redo: [] }
}

function applySnap(state: EditorState, snap: UndoSnap): Pick<EditorState, 'applyAll' | 'applyValues' | 'applyCover' | 'sharedCover' | 'tracks' | 'fileMask' | 'fileDir' | 'fileAll' | 'fileNumbers' | 'fileNumberSeed'> {
  return {
    applyAll: snap.applyAll,
    applyValues: snap.applyValues,
    applyCover: snap.applyCover,
    sharedCover: snap.sharedCover,
    fileMask: snap.fileMask ?? state.fileMask,
    fileDir: snap.fileDir ?? state.fileDir,
    fileAll: snap.fileAll ?? state.fileAll,
    fileNumbers: snap.fileNumbers ?? state.fileNumbers,
    fileNumberSeed: snap.fileNumberSeed ?? state.fileNumberSeed,
    tracks: state.tracks.map((track) =>
      snap.drafts[track.path] ? { ...track, draft: snap.drafts[track.path], draftCover: snap.covers[track.path] } : track
    )
  }
}

function remapSnap(snap: UndoSnap, moved: Map<string, string>): UndoSnap {
  if (!moved.size) return snap
  const drafts: UndoSnap['drafts'] = {}
  const covers: UndoSnap['covers'] = {}
  for (const [path, draft] of Object.entries(snap.drafts)) {
    const next = moved.get(path) ?? path
    drafts[next] = draft
    covers[next] = snap.covers[path]
  }
  const fileNumbers: Record<string, string> = {}
  for (const [path, value] of Object.entries(snap.fileNumbers ?? {})) fileNumbers[moved.get(path) ?? path] = value
  return { ...snap, drafts, covers, fileNumbers }
}

function currentTrackPath(state: EditorState): string | null {
  if (state.focus && state.selected.includes(state.focus)) return state.focus
  if (state.anchor && state.selected.includes(state.anchor)) return state.anchor
  return state.selected[0] ?? null
}

function viewOrder(state: EditorState): string[] {
  const known = new Set(state.tracks.map((track) => track.path))
  const listed = state.listOrder.filter((path) => known.has(path))
  return listed.length === state.tracks.length && state.tracks.length ? listed : state.tracks.map((track) => track.path)
}

function span(order: string[], anchor: string, end: string): string[] | null {
  const start = order.indexOf(anchor)
  const finish = order.indexOf(end)
  if (start < 0 || finish < 0) return null
  const [from, to] = start < finish ? [start, finish] : [finish, start]
  return order.slice(from, to + 1)
}

function selectedTracks(state: EditorState): TrackVm[] {
  const picked = new Set(state.selected)
  return state.tracks.filter((track) => picked.has(track.path) && !track.error)
}

function sameCover(left: CoverArt | null | undefined, right: CoverArt | null | undefined): boolean {
  if (left === right) return true
  if (!left || !right) return !left && !right
  return left.mime === right.mime && left.dataBase64 === right.dataBase64
}

const STEP_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'genre', 'year', 'trackNumber', 'trackTotal', 'discNumber', 'discTotal', 'comment', 'lyrics'] as const

function stepLabel(field: string): string {
  const pack = getPack()
  const labels: Record<string, string> = {
    title: pack.fieldTitle,
    artist: pack.fieldArtist,
    album: pack.fieldAlbum,
    albumArtist: pack.fieldAlbumArtist,
    genre: pack.fieldGenre,
    year: pack.fieldYear,
    trackNumber: pack.fieldTrack,
    trackTotal: pack.fieldTrackCount,
    discNumber: pack.fieldDisc,
    discTotal: pack.fieldDiscCount,
    comment: pack.comment,
    lyrics: pack.infoLyrics
  }
  return labels[field] ?? field
}

function previewWords(): PreviewWords {
  const pack = getPack()
  return {
    empty: pack.previewEmpty,
    coverRemove: pack.previewCoverRemove,
    coverReplace: pack.previewCoverReplace,
    name: pack.previewName,
    folder: pack.previewFolder,
    fields: {
      title: pack.fieldTitle,
      artist: pack.fieldArtist,
      album: pack.fieldAlbum,
      albumArtist: pack.fieldAlbumArtist,
      genre: pack.fieldGenre,
      year: pack.fieldYear,
      trackNumber: pack.fieldTrack,
      trackTotal: pack.fieldTrackCount,
      discNumber: pack.fieldDisc,
      discTotal: pack.fieldDiscCount,
      comment: pack.comment,
      lyrics: pack.infoLyrics
    }
  }
}

function describeStep(before: UndoSnap, after: UndoSnap): string {
  const pack = getPack()
  const names = new Set<string>()
  const paths = new Set([...Object.keys(before.drafts), ...Object.keys(after.drafts)])
  for (const path of paths) {
    const left = before.drafts[path]
    const right = after.drafts[path]
    if (!left || !right) {
      names.add(pack.stepFiles)
      continue
    }
    for (const field of STEP_FIELDS) {
      if (left[field] !== right[field]) names.add(stepLabel(field))
    }
    if (!sameCover(before.covers[path], after.covers[path])) names.add(pack.stepCover)
  }
  if ((before.fileMask ?? '') !== (after.fileMask ?? '')) names.add(pack.fileName)
  if ((before.fileDir ?? '') !== (after.fileDir ?? '')) names.add(pack.folder)
  if ((before.fileAll ?? true) !== (after.fileAll ?? true)) names.add(pack.forAllFiles)
  if ((before.fileNumberSeed ?? 1) !== (after.fileNumberSeed ?? 1) || JSON.stringify(before.fileNumbers ?? {}) !== JSON.stringify(after.fileNumbers ?? {})) {
    names.add(pack.stepNumber)
  }
  if (before.applyCover !== after.applyCover || !sameCover(before.sharedCover, after.sharedCover)) names.add(pack.stepSharedCover)
  for (const field of Object.keys(before.applyAll ?? {}) as (keyof UndoSnap['applyAll'])[]) {
    if (before.applyAll[field] !== after.applyAll?.[field]) names.add(pack.stepEveryone(stepLabel(field)))
  }
  if (before.applyValues && after.applyValues) {
    for (const field of STEP_FIELDS) {
      if (before.applyValues[field] !== after.applyValues[field]) names.add(stepLabel(field))
    }
  }
  if (!names.size) return pack.stepChange
  return [...names].slice(0, 3).join(', ')
}

let historyCache: { state: EditorState; locale: string; entries: { undo: string[]; redo: string[] } } | null = null

export function historyEntries(state: EditorState, locale = getLocale()): { undo: string[]; redo: string[] } {
  if (historyCache?.state === state && historyCache.locale === locale) return historyCache.entries
  const current = takeSnap(state)
  const undo = state.undo.map((snap, index) => describeStep(snap, state.undo[index + 1] ?? current)).reverse()
  const redo: string[] = []
  let previous = current
  for (let index = state.redo.length - 1; index >= 0; index -= 1) {
    const snap = state.redo[index]
    redo.push(describeStep(previous, snap))
    previous = snap
  }
  const entries = { undo, redo }
  historyCache = { state, locale, entries }
  return entries
}

function takeSnap(state: EditorState): UndoSnap {
  const drafts: UndoSnap['drafts'] = {}
  const covers: UndoSnap['covers'] = {}
  for (const track of state.tracks) {
    drafts[track.path] = { ...track.draft }
    covers[track.path] = track.draftCover
  }
  return {
    drafts,
    covers,
    applyAll: { ...state.applyAll },
    applyValues: { ...state.applyValues },
    applyCover: state.applyCover,
    sharedCover: state.sharedCover,
    fileMask: state.fileMask,
    fileDir: state.fileDir,
    fileAll: state.fileAll,
    fileNumbers: { ...state.fileNumbers },
    fileNumberSeed: state.fileNumberSeed
  }
}

const TOAST_MS = 3200
let toastTimer: ReturnType<typeof setTimeout> | undefined
let toastLeft = TOAST_MS
let toastAt = 0
let toastSeq = 0
let playSeq = 0

function clearToastTimer(): void {
  if (!toastTimer) return
  clearTimeout(toastTimer)
  toastTimer = undefined
}

function armToast(set: (partial: Partial<EditorState>) => void, ms: number): void {
  clearToastTimer()
  toastLeft = ms
  toastAt = Date.now()
  toastTimer = setTimeout(() => {
    toastTimer = undefined
    set({ toast: null })
  }, ms)
}

function showToast(set: (partial: Partial<EditorState>) => void, toast: Toast): void {
  armToast(set, TOAST_MS)
  set({ toast: { ...toast, text: tr(toast.text), id: ++toastSeq } })
}

// Чтения (addPaths / refresh / refreshSource) могут идти одновременно. loading гаснет только когда
// закончилось ПОСЛЕДНЕЕ из них, иначе первый finally снимает флаг у ещё идущего второго (аудит B4).
let activeLoads = 0

function beginLoad(set: (partial: Partial<EditorState>) => void): void {
  activeLoads += 1
  set({ loading: true })
}

function endLoad(set: (partial: Partial<EditorState>) => void): void {
  activeLoads = Math.max(0, activeLoads - 1)
  if (activeLoads === 0) set({ loading: false })
}

function historyFromJobs(jobs: WriteJob[]): Partial<HistoryMap> {
  return collectHistory(jobs.map((job) => job.patch))
}

export const useEditor = create<EditorState>((set, get) => ({
  tracks: [],
  selected: [],
  anchor: null,
  focus: null,
  listOrder: [],
  nowPlaying: null,
  playCommand: null,
  applyAll: applyOff(),
  applyValues: emptyTags(),
  applyCover: false,
  sharedCover: null,
  history: emptyHistory(),
  loading: false,
  saving: false,
  progress: null,
  toast: null,
  writeErrors: [],
  undo: [],
  redo: [],
  fileMask: '',
  fileDir: '',
  fileAll: false,
  fileNumbers: {},
  fileNumberSeed: 1,
  sourceDir: null,
  savePreview: null,
  resetAsk: false,
  closeAsk: false,

  addPaths: async (paths) => {
    const known = new Set(get().tracks.map((track) => pathKey(track.path)))
    const fresh = paths.map((item) => item.trim()).filter((item) => item && !known.has(pathKey(item)))
    if (!fresh.length || !window.musicTagEditor) return
    const accept = (incoming: TrackSnapshot[]) => {
      if (!incoming.length) return
      set((state) => {
        const have = new Set(state.tracks.map((track) => pathKey(track.path)))
        const added = incoming.filter((item) => item.path && !have.has(pathKey(item.path)))
        if (!added.length) return state
        const tracks = [...state.tracks, ...added.map(toVm)]
        const first = tracks.find((track) => !track.error)?.path ?? tracks[0]?.path ?? null
        return {
          tracks,
          selected: state.selected.length ? state.selected : first ? [first] : [],
          anchor: state.anchor ?? first,
          sourceDir: state.sourceDir ?? sharedDir(added.map((item) => item.path))
        }
      })
    }
    beginLoad(set)
    const stop = window.musicTagEditor.onTrackBatch(accept)
    try {
      const snapshots = await window.musicTagEditor.readTags(fresh)
      accept(snapshots)
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось прочитать файлы' })
    } finally {
      stop()
      endLoad(set)
    }
  },

  openDialog: async () => {
    if (!window.musicTagEditor) return
    const paths = await window.musicTagEditor.openFiles()
    if (paths.length) await get().addPaths(paths)
  },

  openFolder: async () => {
    if (!window.musicTagEditor) return
    const paths = await window.musicTagEditor.openFolder()
    if (!paths.length) return
    set({ sourceDir: paths[0] })
    await get().addPaths(paths)
  },

  refresh: async () => {
    const current = get().tracks
    if (!current.length || get().loading || get().saving || !window.musicTagEditor) return
    beginLoad(set)
    try {
      const requested = current.map((track) => track.path)
      const snapshots = await window.musicTagEditor.readTags(requested)
      const byPath = new Map<string, TrackSnapshot>()
      requested.forEach((path, index) => {
        const snapshot = snapshots[index]
        if (snapshot) byPath.set(path, snapshot)
      })
      set((state) => {
        // Состав берём ТЕКУЩИЙ, не снятый до await: убранный за время чтения файл не воскресает,
        // добавленный не пропадает (аудит B3). Несохранённые правки сохраняются (mergeRefreshed).
        const remap = new Map<string, string>()
        const tracks = state.tracks.map((track) => {
          const snapshot = byPath.get(track.path)
          if (!snapshot) return track
          const merged = mergeRefreshed(track, snapshot)
          remap.set(track.path, merged.path)
          return merged
        })
        const present = new Set(tracks.map((track) => track.path))
        const selected = state.selected.map((path) => remap.get(path) ?? path).filter((path) => present.has(path))
        const anchor = state.anchor ? (remap.get(state.anchor) ?? state.anchor) : null
        return {
          tracks,
          selected,
          anchor: anchor && selected.includes(anchor) ? anchor : (selected[0] ?? null),
          writeErrors: state.writeErrors.filter((item) => present.has(item.path))
        }
      })
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось обновить файлы' })
    } finally {
      endLoad(set)
    }
  },

  refreshSource: async () => {
    const dir = get().sourceDir
    if (!dir || get().loading || get().saving || !window.musicTagEditor) return
    beginLoad(set)
    try {
      const snapshots = await window.musicTagEditor.readTags([dir])
      set((state) => {
        const fresh = new Map(snapshots.map((snapshot) => [pathKey(snapshot.path), snapshot]))
        const kept = state.tracks
          .filter((track) => !inDir(track.path, dir) || fresh.has(pathKey(track.path)))
          .map((track) => {
            const snapshot = fresh.get(pathKey(track.path))
            // правки в черновиках внутри папки сохраняются (аудит B3)
            return snapshot ? mergeRefreshed(track, snapshot) : track
          })
        const have = new Set(kept.map((track) => pathKey(track.path)))
        for (const snapshot of snapshots) {
          const key = pathKey(snapshot.path)
          if (have.has(key)) continue
          have.add(key)
          kept.push(toVm(snapshot))
        }
        const selected = state.selected.filter((path) => kept.some((track) => track.path === path))
        const anchor = state.anchor && selected.includes(state.anchor) ? state.anchor : (selected[0] ?? kept[0]?.path ?? null)
        return { tracks: kept, selected: selected.length ? selected : anchor ? [anchor] : [], anchor }
      })
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось обновить папку' })
    } finally {
      endLoad(set)
    }
  },

  revealSource: async () => {
    const dir = get().sourceDir
    if (!dir || !window.musicTagEditor) return
    try {
      await window.musicTagEditor.revealDir(dir)
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось показать папку' })
    }
  },

  openSource: async () => {
    const dir = get().sourceDir
    if (!dir || !window.musicTagEditor) return
    try {
      await window.musicTagEditor.openDir(dir)
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось открыть папку' })
    }
  },

  revealFile: async (path) => {
    if (!path || !window.musicTagEditor) return
    try {
      await window.musicTagEditor.revealPath(path)
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось показать файл' })
    }
  },

  revealCurrent: async () => {
    const path = currentTrackPath(get())
    if (path) await get().revealFile(path)
  },

  openFile: async (path) => {
    if (!path || !window.musicTagEditor) return
    try {
      await window.musicTagEditor.openPath(path)
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось открыть файл' })
    }
  },

  openCurrent: async () => {
    const path = currentTrackPath(get())
    if (path) await get().openFile(path)
  },

  clear: () => {
    set({
      tracks: [],
      selected: [],
      anchor: null,
      focus: null,
      listOrder: [],
      applyAll: applyOff(),
      applyValues: emptyTags(),
      applyCover: false,
      sharedCover: null,
      undo: [],
      redo: [],
      sourceDir: null,
      writeErrors: [],
      progress: null,
      // шаблон имени, ручные номера, команда play и диалоги не должны переживать очистку (аудит B2):
      // иначе новая порция файлов сразу «грязная» от старой маски
      fileMask: '',
      fileDir: '',
      fileAll: false,
      fileNumbers: {},
      fileNumberSeed: 1,
      playCommand: null,
      nowPlaying: null,
      savePreview: null,
      resetAsk: false
    })
  },

  remove: (path) => {
    set((state) => {
      const order = viewOrder(state)
      const index = order.indexOf(path)
      const tracks = state.tracks.filter((track) => track.path !== path)
      const listOrder = order.filter((item) => item !== path)
      let selected = state.selected.filter((item) => item !== path)
      if (!selected.length && listOrder.length) {
        const next = listOrder[Math.min(Math.max(index, 0), listOrder.length - 1)]
        selected = next ? [next] : []
      }
      const focus = state.focus && selected.includes(state.focus) ? state.focus : (selected[0] ?? null)
      return {
        tracks,
        selected,
        listOrder,
        anchor: focus,
        focus,
        fileNumbers: withoutNumbers(state.fileNumbers, new Set([path])),
        writeErrors: state.writeErrors.filter((item) => item.path !== path)
      }
    })
  },

  removeSelected: () => {
    const state = get()
    if (!state.selected.length) return
    const drop = new Set(state.selected)
    const order = viewOrder(state)
    const tracks = state.tracks.filter((track) => !drop.has(track.path))
    const listOrder = order.filter((path) => !drop.has(path))
    const firstGone = order.findIndex((path) => drop.has(path))
    const next = listOrder[Math.min(Math.max(firstGone, 0), listOrder.length - 1)] ?? null
    set({
      tracks,
      listOrder,
      selected: next ? [next] : [],
      anchor: next,
      focus: next,
      fileNumbers: withoutNumbers(state.fileNumbers, drop),
      writeErrors: state.writeErrors.filter((item) => !drop.has(item.path))
    })
  },

  select: (path, mode) => {
    set((state) => {
      const order = viewOrder(state)
      if (mode === 'toggle') {
        const selected = state.selected.includes(path) ? state.selected.filter((item) => item !== path) : [...state.selected, path]
        return { selected, anchor: path, focus: path }
      }
      if (mode === 'range') {
        const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : path
        return { selected: span(order, anchor, path) ?? [path], anchor, focus: path }
      }
      return { selected: [path], anchor: path, focus: path }
    })
  },

  selectAll: () => {
    const state = get()
    const order = viewOrder(state)
    if (!order.length) return
    const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : order[0]
    const focus = state.focus && order.includes(state.focus) ? state.focus : order[order.length - 1]
    set({ selected: order, anchor, focus })
  },

  selectEdge: (edge, extend = false) => {
    const state = get()
    const order = viewOrder(state)
    const next = edge === 'start' ? order[0] : order.at(-1)
    if (!next) return
    if (extend) {
      const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : next
      set({ selected: span(order, anchor, next) ?? [next], anchor, focus: next })
      return
    }
    set({ selected: [next], anchor: next, focus: next })
  },

  selectDelta: (direction, extend = false) => {
    const state = get()
    const order = viewOrder(state)
    if (!order.length) return
    const cursor = state.focus && order.includes(state.focus) ? state.focus : (state.anchor ?? state.selected.at(-1) ?? null)
    const index = cursor ? order.indexOf(cursor) : -1
    const next = order[Math.min(order.length - 1, Math.max(0, index < 0 ? 0 : index + direction))]
    if (!next) return
    if (extend) {
      const anchor = state.anchor && order.includes(state.anchor) ? state.anchor : next
      set({ selected: span(order, anchor, next) ?? [next], anchor, focus: next })
      return
    }
    set({ selected: [next], anchor: next, focus: next })
  },

  setListOrder: (paths) => {
    const current = get().listOrder
    if (current.length === paths.length && current.every((path, index) => path === paths[index])) return
    set({ listOrder: paths })
  },

  setTrackOrder: (paths) => {
    const state = get()
    const byPath = new Map(state.tracks.map((track) => [track.path, track]))
    if (paths.length !== state.tracks.length || paths.some((path) => !byPath.has(path))) return
    if (paths.every((path, index) => state.tracks[index]?.path === path)) return
    set({
      tracks: paths.map((path) => byPath.get(path) as TrackVm),
      listOrder: paths
    })
  },

  setField: (field, value) => {
    const state = get()
    const targets = selectedTracks(state)
    if (!targets.length) return
    const applyField = (APPLY_FIELDS as readonly string[]).includes(field)
    if (applyField && state.applyAll[field as (typeof APPLY_FIELDS)[number]]) {
      if (sameValue(state.applyValues[field], value)) return
      set({
        ...pushUndo(state),
        applyValues: { ...state.applyValues, [field]: value }
      })
      return
    }
    if (targets.every((track) => sameValue(track.draft[field], value))) return
    const paths = new Set(targets.map((track) => track.path))
    set({
      ...pushUndo(state),
      tracks: state.tracks.map((track) =>
        paths.has(track.path) ? { ...track, draft: { ...track.draft, [field]: value } } : track
      )
    })
  },

  setApply: (field, on) => {
    const state = get()
    if (state.applyAll[field] === on) return
    const targets = selectedTracks(state)
    const values = targets.map((track) => track.draft[field])
    const uniform = uniformField(values, sameValue)
    const nextValue = uniform.mixed || uniform.value === null ? emptyTags()[field] : uniform.value
    set({
      ...pushUndo(state),
      applyAll: { ...state.applyAll, [field]: on },
      applyValues: on ? { ...state.applyValues, [field]: nextValue } : state.applyValues
    })
  },

  setApplyEvery: (on) => {
    const state = get()
    const fields = APPLY_FIELDS.filter((field) => state.applyAll[field] !== on)
    if (!fields.length) return
    const targets = selectedTracks(state)
    const applyValues = { ...state.applyValues }
    if (on) fillApply(applyValues, fields, targets)
    const applyAll = { ...state.applyAll }
    for (const field of fields) applyAll[field] = on
    set({
      ...pushUndo(state),
      applyAll,
      applyValues
    })
  },

  setApplyScope: (on) => {
    const state = get()
    const fields = APPLY_FIELDS.filter((field) => state.applyAll[field] !== on)
    const coverSameState = state.applyCover === on
    if (!fields.length && coverSameState && state.fileAll === on) return
    const targets = selectedTracks(state)
    const applyValues = { ...state.applyValues }
    if (on) fillApply(applyValues, fields, targets)
    const applyAll = { ...state.applyAll }
    for (const field of fields) applyAll[field] = on
    const covers = targets.map((track) => track.draftCover)
    const uniform = uniformField(covers, coverSame)
    set({
      ...pushUndo(state),
      applyAll,
      applyValues,
      applyCover: on,
      sharedCover: on && !coverSameState ? (uniform.mixed ? null : uniform.value) : state.sharedCover,
      fileAll: on
    })
  },

  setCover: (cover) => {
    const state = get()
    if (state.applyCover) {
      if (coverSame(state.sharedCover, cover)) return
      set({ ...pushUndo(state), sharedCover: cover })
      return
    }
    const targets = selectedTracks(state)
    if (!targets.length) return
    const paths = new Set(targets.map((track) => track.path))
    set({
      ...pushUndo(state),
      tracks: state.tracks.map((track) => (paths.has(track.path) ? { ...track, draftCover: cover } : track))
    })
  },

  setApplyCover: (on) => {
    const state = get()
    if (state.applyCover === on) return
    const targets = selectedTracks(state)
    const covers = targets.map((track) => track.draftCover)
    const uniform = uniformField(covers, coverSame)
    set({
      ...pushUndo(state),
      applyCover: on,
      sharedCover: on ? (uniform.mixed ? null : uniform.value) : state.sharedCover
    })
  },

  reset: () => {
    set((state) => ({
      tracks: state.tracks.map((track) => ({
        ...track,
        draft: { ...track.original },
        draftCover: track.originalCover
      })),
      applyAll: applyOff(),
      applyCover: false,
      sharedCover: null,
      undo: [],
      redo: [],
      writeErrors: []
    }))
  },

  undoOnce: () => {
    const snap = get().undo.at(-1)
    if (!snap) return
    set((state) => ({
      ...applySnap(state, snap),
      undo: state.undo.slice(0, -1),
      redo: [...state.redo, takeSnap(state)].slice(-30)
    }))
  },

  redoOnce: () => {
    const snap = get().redo.at(-1)
    if (!snap) return
    set((state) => ({
      ...applySnap(state, snap),
      redo: state.redo.slice(0, -1),
      undo: [...state.undo, takeSnap(state)].slice(-30)
    }))
  },

  undoTo: (index) => {
    const state = get()
    const snap = state.undo[index]
    if (!snap || state.saving) return
    const undone = [...state.undo.slice(index + 1), takeSnap(state)].reverse()
    set({
      ...applySnap(state, snap),
      undo: state.undo.slice(0, index),
      redo: [...state.redo, ...undone].slice(-30)
    })
  },

  redoTo: (index) => {
    const state = get()
    const snap = state.redo[index]
    if (!snap || state.saving) return
    const passed = state.redo.slice(index + 1)
    set({
      ...applySnap(state, snap),
      undo: [...state.undo, takeSnap(state), ...passed].slice(-30),
      redo: state.redo.slice(0, index)
    })
  },

  setFileMask: (mask) =>
    set((state) => {
      if (state.fileMask === mask) return state
      return { ...pushUndo(state), fileMask: mask }
    }),

  setFileDir: (directory) =>
    set((state) => {
      if (state.fileDir === directory) return state
      return { ...pushUndo(state), fileDir: directory }
    }),

  setFileAll: (on) =>
    set((state) => {
      if (state.fileAll === on) return state
      return { ...pushUndo(state), fileAll: on }
    }),

  setFileNumber: (path, value) =>
    set((state) => {
      const clean = value.replace(/\D/g, '').slice(0, 6)
      if ((state.fileNumbers[path] ?? '') === clean) return state
      const fileNumbers = { ...state.fileNumbers }
      if (clean) fileNumbers[path] = clean
      else delete fileNumbers[path]
      return { ...pushUndo(state), fileNumbers }
    }),

  reshuffleNumbers: () =>
    set((state) => ({
      ...pushUndo(state),
      fileNumbers: {},
      fileNumberSeed: (Math.imul(state.fileNumberSeed, 1664525) + 1013904223) >>> 0 || 1,
      fileMask: hasNumberToken(state.fileMask) ? state.fileMask : state.fileMask.trim() ? `%n% ${state.fileMask.trim()}` : '%n%'
    })),

  pickFileDir: async () => {
    if (!window.musicTagEditor) return
    const directory = await window.musicTagEditor.pickFolder()
    if (!directory) return
    set((state) => (state.fileDir === directory ? state : { ...pushUndo(state), fileDir: directory }))
  },

  requestReset: () => {
    if (draftCount(get()) === 0) return
    if (!getPrefs().confirmReset) {
      get().reset()
      return
    }
    set({ resetAsk: true })
  },

  confirmReset: () => {
    get().reset()
    set({ resetAsk: false })
  },

  dismissReset: () => set({ resetAsk: false }),

  requestClose: () => {
    const state = get()
    if (state.saving || (dirtyCount(state) > 0 && getPrefs().confirmClose)) {
      set({ closeAsk: true })
      return
    }
    void window.musicTagEditor?.confirmClose()
  },

  confirmClose: () => {
    set({ closeAsk: false })
    void window.musicTagEditor?.confirmClose()
  },

  dismissClose: () => set({ closeAsk: false }),

  requestSave: () => {
    if (get().saving || !window.musicTagEditor) return
    const state = get()
    const plan = planState(state)
    const jobs = buildJobs(state.tracks.map(planOf), plan)
    if (!jobs.length) {
      showToast(set, { kind: 'ok', text: 'Нет изменений' })
      return
    }
    if (orderWrites(jobs, plan.fileName?.platform).blocked.length) {
      showToast(set, { kind: 'err', text: 'Несколько файлов получают одно имя' })
      return
    }
    if (jobs.length > 1 && getPrefs().confirmWrite) {
      set({ savePreview: previewJobs(state.tracks.map(planOf), plan, previewWords()) })
      return
    }
    void get().saveAll()
  },

  confirmSave: () => {
    set({ savePreview: null })
    void get().saveAll()
  },

  dismissSave: () => set({ savePreview: null }),

  saveAll: async () => {
    if (get().saving || !window.musicTagEditor) return
    const state = get()
    const plan = planState(state)
    const jobs = buildJobs(state.tracks.map(planOf), plan)
    if (!jobs.length) {
      showToast(set, { kind: 'ok', text: 'Нет изменений' })
      return
    }
    const planned = orderWrites(jobs, plan.fileName?.platform)
    if (planned.blocked.length) {
      showToast(set, { kind: 'err', text: 'Несколько файлов получают одно имя' })
      return
    }
    const ready = planned.ready
    set({ saving: true, writeErrors: [], savePreview: null, progress: { current: 0, total: ready.length, path: '' } })
    try {
      const results = await window.musicTagEditor.writeTags(ready)
      if (results.length !== ready.length) throw new Error('Запись вернула неполный результат')
      const byPath = new Map(ready.map((job) => [job.path, job]))
      const byResult = new Map(results.map((item) => [item.path, item]))
      const moved = new Map<string, string>()
      for (const result of results) {
        if (result.savedPath && result.savedPath !== result.path) moved.set(result.path, result.savedPath)
      }
      const ok = new Set(results.filter((item) => item.ok).map((item) => item.path))
      set((current) => {
        const tracks = current.tracks.map((track) => {
          const job = byPath.get(track.path)
          const result = byResult.get(track.path)
          if (!job || !result) return track
          const nextPath = moved.get(track.path) ?? track.path
          if (!ok.has(track.path)) return nextPath === track.path ? track : { ...track, path: nextPath }
          const original = { ...track.original, ...job.patch }
          return {
            ...track,
            path: nextPath,
            original,
            draft: { ...track.draft, ...job.patch },
            originalCover: job.cover !== undefined ? job.cover : track.originalCover,
            draftCover: job.cover !== undefined ? job.cover : track.draftCover
          }
        })
        const remap = (path: string) => moved.get(path) ?? path
        const selected = current.selected.map(remap).filter((path) => tracks.some((track) => track.path === path))
        const anchor = current.anchor ? remap(current.anchor) : null
        const fileNumbers: Record<string, string> = {}
        for (const [path, value] of Object.entries(current.fileNumbers)) fileNumbers[remap(path)] = value
        return {
          tracks,
          selected,
          fileNumbers,
          anchor: anchor && selected.includes(anchor) ? anchor : (selected[0] ?? null),
          undo: current.undo.map((snap) => remapSnap(snap, moved)),
          redo: current.redo.map((snap) => remapSnap(snap, moved))
        }
      })
      const entries = historyFromJobs(ready.filter((job) => ok.has(job.path)))
      if (Object.keys(entries).length) {
        const history = await window.musicTagEditor.pushHistory(entries)
        set({ history })
      }
      const failed = results.filter((item) => !item.ok)
      set({
        writeErrors: failed.map((item) => ({
          path: moved.get(item.path) ?? item.path,
          error: item.error ?? 'Ошибка записи',
          code: item.code
        }))
      })
      showToast(set, failed.length ? { kind: 'err', text: 'Часть файлов не сохранена' } : { kind: 'ok', text: 'Сохранено' })
    } catch (error) {
      showToast(set, { kind: 'err', text: error instanceof Error ? error.message : 'Не удалось сохранить' })
    } finally {
      set({ saving: false, progress: null })
    }
  },

  saveCopy: async (path) => {
    if (!window.musicTagEditor) return
    const state = get()
    const job = buildJobs(state.tracks.map(planOf), planState(state)).find((item) => item.path === path)
    if (!job) return
    const result = await window.musicTagEditor.saveCopy(job)
    if (result.code === 'cancelled') return
    showToast(set, result.ok ? { kind: 'ok', text: 'Копия сохранена' } : { kind: 'err', text: result.error ?? 'Не удалось сохранить копию' })
    if (result.ok) {
      set((current) => ({
        writeErrors: current.writeErrors.filter((item) => item.path !== path)
      }))
      const entries = historyFromJobs([job])
      if (Object.keys(entries).length) {
        try {
          const history = await window.musicTagEditor.pushHistory(entries)
          set({ history })
        } catch {
          /* подсказки не мешают копии */
        }
      }
    }
  },

  notify: (toast) => showToast(set, toast),

  requestPlay: (path) => {
    const state = get()
    const track = state.tracks.find((item) => item.path === path)
    if (!track || track.error) return
    if (state.nowPlaying === path) {
      set({ playCommand: { id: ++playSeq, type: 'pause', path } })
      return
    }
    const same = state.selected.length === 1 && state.selected[0] === path
    set({
      ...(same ? {} : { selected: [path], anchor: path, focus: path }),
      playCommand: { id: ++playSeq, type: 'play', path }
    })
  },

  dismissToast: () => {
    clearToastTimer()
    set({ toast: null })
  },

  holdToast: () => {
    if (!toastTimer) return
    toastLeft = Math.max(0, toastLeft - (Date.now() - toastAt))
    clearToastTimer()
  },

  resumeToast: () => {
    if (!get().toast || toastTimer) return
    armToast(set, toastLeft)
  }
}))

export function readableTracks(tracks: TrackVm[]): TrackVm[] {
  return tracks.filter((track) => !track.error)
}

let planCache: { state: EditorState; plan: PlanState } | null = null

export function editorPlan(state: EditorState): PlanState {
  if (planCache?.state === state) return planCache.plan
  const plan = planState(state)
  planCache = { state, plan }
  return plan
}

export function draftCount(state: Pick<EditorState, 'tracks' | 'applyAll' | 'applyValues' | 'applyCover' | 'sharedCover'>): number {
  const plan: PlanState = {
    applyAll: state.applyAll,
    applyValues: state.applyValues,
    applyCover: state.applyCover,
    sharedCover: state.sharedCover
  }
  return state.tracks.filter((track) => trackDirty(planOf(track), plan)).length
}

export function dirtyCount(state: Pick<EditorState, 'tracks' | 'selected' | 'applyAll' | 'applyValues' | 'applyCover' | 'sharedCover' | 'fileMask' | 'fileDir' | 'fileAll' | 'fileNumbers' | 'fileNumberSeed'>): number {
  return state.tracks.filter((track) => trackDirty(planOf(track), planState(state))).length
}

subscribePrefs(() => {
  useEditor.setState((state) => ({ fileNumberSeed: state.fileNumberSeed }))
})