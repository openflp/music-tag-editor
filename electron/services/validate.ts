import { statSync } from 'node:fs'
import { extname, resolve } from 'node:path'
import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MAX_COVER_BYTES, MAX_FILES, MENU_BAR_MODES, REPOSITORY_URL, ZOOM_STEPS, type AppSettings, type CoverArt, type MenuBarMode, type WriteJob, type ZoomStep } from '@shared/types'

const AUDIO = new Set<string>(AUDIO_EXTENSIONS)
const IMAGES = new Set<string>(IMAGE_EXTENSIONS)

export class InputError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'InputError'
  }
}

export function extensionOf(filePath: string): string {
  return extname(filePath).toLowerCase()
}

export function isAudioPath(filePath: string): boolean {
  return AUDIO.has(extensionOf(filePath))
}

export function isImagePath(filePath: string): boolean {
  return IMAGES.has(extensionOf(filePath))
}

export function assertStringPath(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    throw new InputError('Некорректный путь')
  }
  return value
}

export function assertDirectoryPath(value: unknown): string {
  return assertStringPath(value)
}

export function assertRepositoryUrl(value: unknown): string {
  if (value !== REPOSITORY_URL) throw new InputError('Некорректная ссылка')
  return REPOSITORY_URL
}

export function assertCloseConfirm(value: unknown): true {
  if (value !== true) throw new InputError('Некорректное подтверждение')
  return true
}

export function assertAudioFilePath(value: unknown): string {
  const filePath = assertStringPath(value)
  if (!isAudioPath(filePath)) throw new InputError('Формат файла не поддерживается')
  return filePath
}

export function assertPathList(value: unknown): string[] {
  if (!Array.isArray(value)) throw new InputError('Ожидался список путей')
  if (value.length > MAX_FILES) throw new InputError(`Не больше ${MAX_FILES} файлов за раз`)
  return value.map((item) => assertStringPath(item))
}

const ACCELERATOR = /^(CmdOrCtrl\+)?(Alt\+)?(Shift\+)?([A-Z0-9]|Delete|Home|End|ArrowUp|ArrowDown|F([1-9]|1[0-2]))$/

const APP_FLAGS = ['hardwareAcceleration', 'backgroundThrottling', 'spellcheck', 'openAtLogin', 'alwaysOnTop', 'restoreBounds'] as const

export function assertAppSettings(value: unknown): Partial<AppSettings> {
  if (!value || typeof value !== 'object') throw new InputError('Некорректные настройки')
  const item = value as Record<string, unknown>
  const next: Partial<AppSettings> = {}
  for (const key of APP_FLAGS) {
    if (!(key in item)) continue
    if (typeof item[key] !== 'boolean') throw new InputError('Некорректные настройки')
    next[key] = item[key]
  }
  if ('zoom' in item) {
    if (typeof item.zoom !== 'number' || !(ZOOM_STEPS as readonly number[]).includes(item.zoom)) {
      throw new InputError('Некорректные настройки')
    }
    next.zoom = item.zoom as ZoomStep
  }
  if ('menuBar' in item) {
    if (typeof item.menuBar !== 'string' || !(MENU_BAR_MODES as readonly string[]).includes(item.menuBar)) {
      throw new InputError('Некорректные настройки')
    }
    next.menuBar = item.menuBar as MenuBarMode
  }
  return next
}

export function assertAccelerator(value: unknown): string {
  if (value === '') return ''
  if (typeof value !== 'string' || !ACCELERATOR.test(value)) throw new InputError('Некорректное сочетание')
  return value
}

export function assertDragFiles(value: unknown): string[] {
  const files: string[] = []
  for (const filePath of assertPathList(value)) {
    try {
      if (statSync(filePath).isFile()) files.push(filePath)
    } catch {
      continue
    }
  }
  return files
}

export function assertCover(cover: WriteJob['cover']): void {
  if (cover === undefined || cover === null) return
  if (typeof cover.mime !== 'string' || !cover.mime.startsWith('image/')) {
    throw new InputError('Обложка должна быть изображением')
  }
  if (typeof cover.dataBase64 !== 'string') throw new InputError('Повреждённые данные обложки')
  const bytes = Buffer.from(cover.dataBase64, 'base64').byteLength
  if (!Number.isFinite(bytes) || bytes <= 0 || bytes > MAX_COVER_BYTES) {
    throw new InputError('Обложка больше 8 МБ или пустая')
  }
}

function assertOptionalNumber(value: unknown, label: string): void {
  if (value === null || value === undefined) return
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 9999) {
    throw new InputError(`Поле «${label}» вне диапазона`)
  }
}

function assertOptionalString(value: unknown, label: string): void {
  if (value === undefined) return
  if (typeof value !== 'string' || value.length > 4000) throw new InputError(`Поле «${label}» слишком длинное`)
}

export function assertWriteJob(value: unknown): WriteJob {
  if (!value || typeof value !== 'object') throw new InputError('Некорректное задание записи')
  const job = value as WriteJob
  const path = assertStringPath(job.path)
  if (!isAudioPath(path)) throw new InputError('Формат файла не поддерживается')
  const patch = job.patch
  if (!patch || typeof patch !== 'object') throw new InputError('Нет набора полей')
  assertOptionalString(patch.title, 'название')
  assertOptionalString(patch.artist, 'исполнитель')
  assertOptionalString(patch.album, 'альбом')
  assertOptionalString(patch.albumArtist, 'исполнитель альбома')
  assertOptionalString(patch.genre, 'жанр')
  assertOptionalString(patch.comment, 'комментарий')
  assertOptionalNumber(patch.year, 'год')
  assertOptionalNumber(patch.trackNumber, 'номер трека')
  assertOptionalNumber(patch.trackTotal, 'число треков')
  assertOptionalNumber(patch.discNumber, 'номер диска')
  assertOptionalNumber(patch.discTotal, 'число дисков')
  assertCover(job.cover)
  let targetPath: string | undefined
  if (job.targetPath != null) {
    targetPath = assertAudioFilePath(job.targetPath)
    const left = resolve(targetPath)
    const right = resolve(path)
    const same = process.platform === 'linux' ? left === right : left.toLowerCase() === right.toLowerCase()
    if (same) targetPath = undefined
  }
  return targetPath ? { path, patch: { ...patch }, cover: job.cover, targetPath } : { path, patch: { ...patch }, cover: job.cover }
}

export function assertWriteJobs(value: unknown): WriteJob[] {
  if (!Array.isArray(value)) throw new InputError('Ожидался список заданий')
  if (value.length > MAX_FILES) throw new InputError(`Не больше ${MAX_FILES} файлов за раз`)
  return value.map((item) => assertWriteJob(item))
}

export function assertCoverInput(value: unknown): CoverArt {
  if (!value || typeof value !== 'object') throw new InputError('Некорректная обложка')
  const cover = value as CoverArt
  assertCover(cover)
  if (extensionForMime(cover.mime) === '') throw new InputError('Обложка должна быть изображением')
  return {
    mime: cover.mime,
    bytes: Buffer.from(cover.dataBase64, 'base64').byteLength,
    dataBase64: cover.dataBase64
  }
}

export function assertTextExport(value: unknown): { text: string; name: string } {
  if (!value || typeof value !== 'object') throw new InputError('Некорректный текст')
  const item = value as { text?: unknown; name?: unknown }
  if (typeof item.text !== 'string' || item.text.length === 0 || item.text.length > 500_000) {
    throw new InputError('Некорректный текст')
  }
  const raw = typeof item.name === 'string' ? item.name.trim() : ''
  const name = (raw || 'info.txt').slice(0, 120)
  if (name.includes('\0') || name.includes('/') || name.includes('\\')) throw new InputError('Некорректное имя файла')
  return { text: item.text, name }
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/gif':
      return 'gif'
    case 'image/jpeg':
      return 'jpg'
    default:
      return ''
  }
}

export function mimeFromImagePath(filePath: string): string {
  switch (extensionOf(filePath)) {
    case '.png':
      return 'image/png'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    default:
      return 'application/octet-stream'
  }
}
