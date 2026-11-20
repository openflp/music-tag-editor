import { expandOperators, fileName, fileParts, hasNumberToken, resolveTarget, sameFilePath, shuffleNumbers, type FileNamePlan } from './filename'
import { APPLY_FIELDS, SOLO_FIELDS, type CoverArt, type TagField, type TrackTags, type WriteJob } from './types'

export interface PlanTrack {
  path: string
  error?: string
  original: TrackTags
  draft: TrackTags
  originalCover: CoverArt | null
  draftCover: CoverArt | null
}

export interface PlanState {
  applyAll: Record<(typeof APPLY_FIELDS)[number], boolean>
  applyValues: TrackTags
  applyCover: boolean
  sharedCover: CoverArt | null
  fileName?: FileNamePlan
}

const FIELD_LABEL: Record<TagField, string> = {
  title: 'Название',
  artist: 'Исполнитель',
  album: 'Альбом',
  albumArtist: 'Исполнитель альбома',
  genre: 'Жанр',
  year: 'Год',
  trackNumber: 'Номер трека',
  trackTotal: 'Число треков',
  discNumber: 'Номер диска',
  discTotal: 'Число дисков',
  comment: 'Комментарий',
  lyrics: 'Текст'
}

export interface WriteChange {
  path: string
  name: string
  lines: string[]
}

const TEXT_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'genre', 'comment', 'lyrics'] as const

export function numberingActive(tracks: PlanTrack[], state: PlanState): boolean {
  if (hasFixed(state.fileName?.fixed)) return true
  if (hasNumberToken(state.fileName?.mask ?? '')) return true
  for (const field of APPLY_FIELDS) {
    if (state.applyAll[field] && hasNumberToken(String(state.applyValues[field] ?? ''))) return true
  }
  return tracks.some((track) => !track.error && TEXT_FIELDS.some((field) => hasNumberToken(String(track.draft[field] ?? ''))))
}

function hasFixed(fixed: Record<string, string> | undefined): boolean {
  return Object.values(fixed ?? {}).some((value) => value.trim())
}

function fileScope(track: PlanTrack, state: PlanState): boolean {
  const plan = state.fileName
  if (plan?.fixed?.[track.path]?.trim()) return true
  if (!plan || plan.all !== false) return true
  if ((plan.selected ?? []).includes(track.path)) return true
  return TEXT_FIELDS.some((field) => hasNumberToken(String(track.draft[field] ?? '')))
}

function withFixed(numbers: Record<string, string>, fixed: Record<string, string> | undefined): Record<string, string> {
  const next = { ...numbers }
  for (const [path, value] of Object.entries(fixed ?? {})) {
    const clean = value.trim()
    if (clean) next[path] = clean
  }
  return next
}

export function preparePlan(tracks: PlanTrack[], state: PlanState): PlanState {
  if (!state.fileName || state.fileName.numbers) return state
  const auto = numberingActive(tracks, { ...state, fileName: { ...state.fileName, fixed: undefined } })
  const fixed = hasFixed(state.fileName.fixed)
  if (!auto && !fixed) return state
  const paths = tracks.filter((track) => !track.error && (auto ? fileScope(track, state) : Boolean(state.fileName?.fixed?.[track.path]?.trim()))).map((track) => track.path)
  const numbers = auto ? shuffleNumbers(paths, state.fileName.seed ?? 1, { start: state.fileName.start, width: state.fileName.width }) : {}
  return {
    ...state,
    fileName: { ...state.fileName, numbers: withFixed(numbers, state.fileName.fixed) }
  }
}

function overlayTags(track: PlanTrack, state: PlanState): TrackTags {
  const tags = { ...track.draft }
  for (const field of APPLY_FIELDS) {
    if (state.applyAll[field]) tags[field] = state.applyValues[field]
  }
  return tags
}

export function shownText(value: string, tags: TrackTags, sourcePath: string, number?: string, tokens?: Record<string, string>): string {
  const expanded = expandOperators(value, tags, sourcePath, number, tokens).trim()
  return expanded || value.trim()
}

function stampTags(tags: TrackTags, sourcePath: string, number: string | undefined, tokens?: Record<string, string>): TrackTags {
  const next = { ...tags }
  for (const field of TEXT_FIELDS) {
    const value = next[field]
    if (typeof value !== 'string' || !value.includes('%')) continue
    const expanded = expandOperators(value, tags, sourcePath, number, tokens)
    if (expanded !== value) next[field] = expanded
  }
  if (!number) return next
  const parsed = Number(number)
  if (Number.isInteger(parsed)) next.trackNumber = parsed
  return next
}

function namePlan(state: PlanState): FileNamePlan | undefined {
  const plan = state.fileName
  if (!plan?.numbers || hasNumberToken(plan.mask)) return plan
  const mask = plan.mask.trim()
  return { ...plan, mask: mask ? `%n% ${mask}` : '%n% %filename%' }
}

export function shownTrackTitle(track: PlanTrack, state: PlanState): string {
  const tags = overlayTags(track, state)
  const title = shownText(tags.title, tags, track.path, state.fileName?.numbers?.[track.path], state.fileName?.tokens)
  if (title) return title
  return fileName(resolveTarget(track.path, writtenTags(track, state), namePlan(state)) ?? track.path)
}

export function shownTrackArtist(track: PlanTrack, state: PlanState): string {
  const tags = overlayTags(track, state)
  return shownText(tags.artist, tags, track.path, state.fileName?.numbers?.[track.path], state.fileName?.tokens)
}

export function writtenTags(track: PlanTrack, state: PlanState): TrackTags {
  const tags = overlayTags(track, state)
  return stampTags(tags, track.path, state.fileName?.numbers?.[track.path], state.fileName?.tokens)
}

export interface PreviewWords {
  empty: string
  coverRemove: string
  coverReplace: string
  name: string
  folder: string
  fields: Record<TagField, string>
}

const PREVIEW_RU: PreviewWords = {
  empty: 'пусто',
  coverRemove: 'Обложка: удалить',
  coverReplace: 'Обложка: заменить',
  name: 'Имя',
  folder: 'Папка',
  fields: FIELD_LABEL
}

function shown(value: string | number | null, empty: string): string {
  if (value === null || value === '') return empty
  return String(value)
}

export function sameValue(a: string | number | null, b: string | number | null): boolean {
  if (typeof a === 'string' || typeof b === 'string') return String(a ?? '') === String(b ?? '')
  return a === b
}

export function coverSame(a: CoverArt | null, b: CoverArt | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  // у обеих есть отпечаток — сравниваем его (равный key = те же байты), без base64
  if (a.key && b.key) return a.key === b.key
  // заглушка без отпечатка для сравнения не годится: считаем обложки разными
  if (a.lazy || b.lazy) return false
  return a.mime === b.mime && a.dataBase64 === b.dataBase64
}

export function tagsEqual(a: TrackTags, b: TrackTags): boolean {
  const fields: TagField[] = [...SOLO_FIELDS, ...APPLY_FIELDS]
  return fields.every((field) => sameValue(a[field], b[field]))
}

function setPatch<K extends TagField>(patch: WriteJob['patch'], field: K, value: TrackTags[K]): void {
  patch[field] = value
}

export function buildJob(track: PlanTrack, state: PlanState): WriteJob | null {
  if (track.error) return null
  const patch: WriteJob['patch'] = {}
  const next = writtenTags(track, state)

  for (const field of [...SOLO_FIELDS, ...APPLY_FIELDS]) {
    if (!sameValue(next[field], track.original[field])) setPatch(patch, field, next[field])
  }

  let cover: CoverArt | null | undefined
  if (state.applyCover) {
    if (!coverSame(state.sharedCover, track.originalCover)) cover = state.sharedCover
  } else if (!coverSame(track.draftCover, track.originalCover)) {
    cover = track.draftCover
  }

  const target = resolveTarget(track.path, next, namePlan(state))
  if (Object.keys(patch).length === 0 && cover === undefined && !target) return null
  const job: WriteJob = { path: track.path, patch }
  if (cover !== undefined) job.cover = cover
  if (target) job.targetPath = target
  return job
}

export function previewJobs(tracks: PlanTrack[], state: PlanState, words: PreviewWords = PREVIEW_RU): WriteChange[] {
  const plan = preparePlan(tracks, state)
  const changes: WriteChange[] = []
  for (const track of tracks) {
    const job = buildJob(track, plan)
    if (!job) continue
    const lines: string[] = []
    for (const field of [...SOLO_FIELDS, ...APPLY_FIELDS]) {
      if (job.patch[field] === undefined) continue
      lines.push(`${words.fields[field]}: ${shown(track.original[field], words.empty)} → ${shown(job.patch[field] ?? null, words.empty)}`)
    }
    if (job.cover === null) lines.push(words.coverRemove)
    else if (job.cover) lines.push(words.coverReplace)
    if (job.targetPath) {
      const from = fileParts(track.path)
      const to = fileParts(job.targetPath)
      const platform = plan.fileName?.platform
      if (!sameFilePath(`${from.stem}${from.ext}`, `${to.stem}${to.ext}`, platform)) {
        lines.push(`${words.name}: ${from.stem}${from.ext} → ${to.stem}${to.ext}`)
      }
      if (!sameFilePath(from.dir, to.dir, platform)) lines.push(`${words.folder}: ${to.dir}`)
    }
    changes.push({ path: track.path, name: fileName(track.path), lines })
  }
  return changes
}

export function buildJobs(tracks: PlanTrack[], state: PlanState): WriteJob[] {
  const plan = preparePlan(tracks, state)
  return tracks.flatMap((track) => {
    const job = buildJob(track, plan)
    return job ? [job] : []
  })
}

export function trackDirty(track: PlanTrack, state: PlanState): boolean {
  return buildJob(track, state) !== null
}

export function uniformField<T>(values: T[], equals: (a: T, b: T) => boolean): { mixed: boolean; value: T | null } {
  if (values.length === 0) return { mixed: false, value: null }
  const first = values[0]
  if (values.every((value) => equals(value, first))) return { mixed: false, value: first }
  return { mixed: true, value: null }
}
