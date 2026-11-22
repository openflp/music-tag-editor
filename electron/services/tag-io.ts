import { copyFile, access, rename, unlink, constants, stat } from 'node:fs/promises'
import { statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, basename, join, extname, resolve } from 'node:path'
import { createHash, randomBytes } from 'node:crypto'
import type { ByteVector, File as TagFile, IPicture } from 'node-taglib-sharp'
import {
  MAX_COVER_BYTES,
  MAX_LYRICS_CHARS,
  emptyTags,
  emptyTech,
  type CoverArt,
  type TrackSnapshot,
  type TrackTags,
  type WriteJob,
  type WriteResult
} from '@shared/types'
import { describeMedia } from './file-facts'
import { InputError } from './validate'

const require = createRequire(import.meta.url)
const { ByteVector: Bytes, File, Picture, PictureType } = require('node-taglib-sharp') as typeof import('node-taglib-sharp')

function numOrNull(value: number | undefined): number | null {
  if (!value || value <= 0) return null
  return value
}

function text(value: string | undefined): string {
  return value ?? ''
}

function errorSnapshot(filePath: string, error: unknown): TrackSnapshot {
  const message = error instanceof Error ? error.message : 'Не удалось прочитать файл'
  return {
    path: filePath,
    format: extname(filePath).toLowerCase(),
    error: message || 'Не удалось прочитать файл',
    tags: emptyTags(),
    cover: null,
    tech: emptyTech()
  }
}

// Отпечаток содержимого обложки: размер + начало sha1. Тот же алгоритм — в renderer (drop.ts).
export function coverKey(bytes: Uint8Array): string {
  return `${bytes.byteLength}:${createHash('sha1').update(bytes).digest('hex').slice(0, 20)}`
}

// lazy: base64 не собираем и по IPC не гоним — только mime, размер и отпечаток.
function coverFromPictures(pictures: IPicture[] | undefined, lazy: boolean, src: string): CoverArt | null {
  if (!pictures?.length) return null
  const picture = pictures.find((item) => item.type === PictureType.FrontCover) ?? pictures[0]
  const bytes = Buffer.from(picture.data.toByteArray())
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_COVER_BYTES) return null
  const mime = picture.mimeType || 'image/jpeg'
  const key = coverKey(bytes)
  if (lazy) return { mime, bytes: bytes.byteLength, dataBase64: '', key, lazy: true, src }
  return { mime, bytes: bytes.byteLength, dataBase64: bytes.toString('base64'), key }
}

// Только обложка файла (для миниатюр и показа): без остальных тегов и свойств.
export function readCoverOnly(filePath: string): CoverArt | null {
  let file: TagFile | null = null
  try {
    file = File.createFromPath(filePath)
    return coverFromPictures(file.tag.pictures, false, filePath)
  } catch {
    return null
  } finally {
    try {
      file?.dispose()
    } catch {
      /* ignore */
    }
  }
}

function joinText(values: string[] | undefined): string {
  return (values ?? []).map((item) => item.trim()).filter(Boolean).join(', ')
}

function gainText(label: string, gain: number, peak: number): string {
  const parts: string[] = []
  if (gain) parts.push(`${gain > 0 ? '+' : ''}${gain.toFixed(2)} dB`)
  if (peak) parts.push(`пик ${peak.toFixed(3)}`)
  return parts.length ? `${label} ${parts.join(', ')}` : ''
}

function codecLabel(properties: TagFile['properties']): string {
  const names = (properties.codecs ?? []).flatMap((item) => (item?.description ? [item.description] : []))
  return names.join(', ') || text(properties.description)
}

function fileStamp(filePath: string): { size: number; createdMs: number; modifiedMs: number } {
  try {
    const info = statSync(filePath)
    return {
      size: info.size,
      createdMs: Math.round(info.birthtimeMs || info.ctimeMs || 0),
      modifiedMs: Math.round(info.mtimeMs || 0)
    }
  } catch {
    return { size: 0, createdMs: 0, modifiedMs: 0 }
  }
}

function readTags(tag: TagFile['tag']): TrackTags {
  return {
    title: text(tag.title),
    artist: text(tag.performers?.[0]),
    album: text(tag.album),
    albumArtist: text(tag.albumArtists?.[0]),
    genre: text(tag.genres?.[0]),
    year: numOrNull(tag.year),
    trackNumber: numOrNull(tag.track),
    trackTotal: numOrNull(tag.trackCount),
    discNumber: numOrNull(tag.disc),
    discTotal: numOrNull(tag.discCount),
    comment: text(tag.comment),
    lyrics: text(tag.lyrics).slice(0, MAX_LYRICS_CHARS)
  }
}

// «Лёгкое» чтение для списка: describeMedia (обход всех фреймов/полей, до 300 фактов) —
// самая дорогая часть, а нужна только во вкладке «Информация». Дешёвые свойства берём напрямую.
function mediaBasics(file: TagFile): ReturnType<typeof describeMedia> {
  return {
    encoder: '',
    container: text(file.properties.description).trim(),
    lossless: (file.properties.mediaTypes & 16) !== 0,
    tagTypes: '',
    channelMode: '',
    facts: []
  }
}

export function readTrack(filePath: string, lite = false, cover: 'lazy' | 'full' | 'none' = lite ? 'lazy' : 'full'): TrackSnapshot {
  let file: TagFile | null = null
  try {
    file = File.createFromPath(filePath)
    const media = lite ? mediaBasics(file) : (() => {
      try {
        return describeMedia(file)
      } catch {
        return { encoder: '', container: '', lossless: false, tagTypes: '', channelMode: '' as const, facts: [] }
      }
    })()
    const stamp = fileStamp(filePath)
    return {
      path: filePath,
      format: extname(filePath).toLowerCase(),
      tags: readTags(file.tag),
      detailed: !lite,
      cover: cover === 'none' ? null : coverFromPictures(file.tag.pictures, cover === 'lazy', filePath),
      tech: {
        durationMs: file.properties.durationMilliseconds || 0,
        bitrate: file.properties.audioBitrate || 0,
        sampleRate: file.properties.audioSampleRate || 0,
        channels: file.properties.audioChannels || 0,
        channelMode: media.channelMode,
        bitsPerSample: file.properties.bitsPerSample || 0,
        ...stamp,
        bpm: file.tag.beatsPerMinute || 0,
        key: text(file.tag.initialKey),
        encoder: media.encoder,
        codec: codecLabel(file.properties),
        container: media.container,
        lossless: media.lossless,
        tagTypes: media.tagTypes,
        facts: media.facts,
        composer: joinText(file.tag.composers),
        publisher: text(file.tag.publisher),
        copyright: text(file.tag.copyright),
        conductor: text(file.tag.conductor),
        grouping: text(file.tag.grouping),
        remix: text(file.tag.remixedBy),
        subtitle: text(file.tag.subtitle),
        isrc: text(file.tag.isrc),
        musicBrainz: text(file.tag.musicBrainzTrackId),
        replayGain: [gainText('трек', file.tag.replayGainTrackGain, file.tag.replayGainTrackPeak), gainText('альбом', file.tag.replayGainAlbumGain, file.tag.replayGainAlbumPeak)]
          .filter(Boolean)
          .join(' · '),
        lyrics: lite ? '' : text(file.tag.lyrics).slice(0, MAX_LYRICS_CHARS)
      }
    }
  } catch (error) {
    return errorSnapshot(filePath, error)
  } finally {
    file?.dispose()
  }
}

function applyPatch(file: TagFile, job: WriteJob): void {
  const tag = file.tag
  const patch = job.patch
  if (patch.title !== undefined) tag.title = patch.title
  if (patch.artist !== undefined) tag.performers = patch.artist ? [patch.artist] : []
  if (patch.album !== undefined) tag.album = patch.album
  if (patch.albumArtist !== undefined) tag.albumArtists = patch.albumArtist ? [patch.albumArtist] : []
  if (patch.genre !== undefined) tag.genres = patch.genre ? [patch.genre] : []
  if (patch.year !== undefined) tag.year = patch.year ?? 0
  if (patch.trackNumber !== undefined) tag.track = patch.trackNumber ?? 0
  if (patch.trackTotal !== undefined) tag.trackCount = patch.trackTotal ?? 0
  if (patch.discNumber !== undefined) tag.disc = patch.discNumber ?? 0
  if (patch.discTotal !== undefined) tag.discCount = patch.discTotal ?? 0
  if (patch.comment !== undefined) tag.comment = patch.comment
  if (patch.lyrics !== undefined) tag.lyrics = patch.lyrics
  if (job.rhythm) {
    tag.beatsPerMinute = job.rhythm.bpm
    tag.initialKey = job.rhythm.initialKey
  }
  if (job.cover === null) tag.pictures = []
  if (job.cover) {
    if (job.cover.lazy || !job.cover.dataBase64) throw new InputError('Обложка не загружена')
    const data: ByteVector = Bytes.fromByteArray(Buffer.from(job.cover.dataBase64, 'base64'))
    tag.pictures = [Picture.fromFullData(data, PictureType.FrontCover, job.cover.mime, 'Front Cover')]
  }
}

async function replaceOriginal(tempPath: string, targetPath: string): Promise<void> {
  const backup = join(dirname(targetPath), `.${basename(targetPath)}.${randomBytes(4).toString('hex')}.bak`)
  try {
    await rename(tempPath, targetPath)
    return
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'EEXIST' && code !== 'EPERM' && code !== 'EBUSY') throw error
  }
  await rename(targetPath, backup)
  try {
    await rename(tempPath, targetPath)
    await unlink(backup).catch(() => undefined)
  } catch (error) {
    await rename(backup, targetPath).catch(() => undefined)
    throw error
  }
}

function resultFromError(filePath: string, error: unknown): WriteResult {
  const code = (error as NodeJS.ErrnoException).code
  if (code === 'EBUSY' || code === 'EPERM') {
    return { path: filePath, ok: false, code: 'locked', error: 'Файл занят другой программой' }
  }
  if (code === 'EACCES' || code === 'EROFS') {
    return { path: filePath, ok: false, code: 'readonly', error: 'Нет прав на запись' }
  }
  if (error instanceof InputError) return { path: filePath, ok: false, code: 'invalid', error: error.message }
  const message = error instanceof Error ? error.message : 'Не удалось записать файл'
  return { path: filePath, ok: false, code: 'unknown', error: message }
}

function mimeFor(filePath: string): string {
  return `taglib/${extname(filePath).slice(1).toLowerCase()}`
}

function samePath(a: string, b: string): boolean {
  const left = resolve(a)
  const right = resolve(b)
  return process.platform === 'linux' ? left === right : left.toLowerCase() === right.toLowerCase()
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

export async function writeTrack(job: WriteJob): Promise<WriteResult> {
  const dest = job.targetPath && !samePath(job.targetPath, job.path) ? job.targetPath : job.path
  const moved = !samePath(dest, job.path)
  const tempPath = join(dirname(dest), `.${basename(dest)}.${randomBytes(4).toString('hex')}.tmp`)
  try {
    await access(job.path, constants.R_OK | constants.W_OK)
    if (moved && (await pathExists(dest))) {
      return { path: job.path, ok: false, code: 'invalid', error: 'Файл с таким именем уже есть' }
    }
    await copyFile(job.path, tempPath)
    const file = File.createFromPath(tempPath, mimeFor(job.path))
    try {
      applyPatch(file, job)
      file.save()
    } finally {
      file.dispose()
    }
    await replaceOriginal(tempPath, dest)
    if (moved) {
      try {
        await unlink(job.path)
      } catch {
        return { path: job.path, savedPath: dest, ok: false, code: 'locked', error: 'Новый файл записан, исходный не удалён' }
      }
    }
    return moved ? { path: job.path, savedPath: dest, ok: true } : { path: job.path, ok: true }
  } catch (error) {
    await unlink(tempPath).catch(() => undefined)
    return resultFromError(job.path, error)
  }
}
