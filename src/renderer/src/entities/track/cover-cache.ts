import { useEffect, useSyncExternalStore } from 'react'
import type { CoverArt } from '@shared/types'

// ───── полные обложки (для формы, плеера, записи): маленький LRU ─────
const FULL_LIMIT = 6
const full = new Map<string, CoverArt>()
const inflight = new Map<string, Promise<CoverArt>>()

type CoverTrack = { path: string; originalCover: CoverArt | null; draftCover: CoverArt | null }

// Пути, из которых можно прочитать обложку с этим key: сначала src, потом треки,
// у которых такая обложка записана в файле (их пути актуальны даже после переименования).
export function candidatesFor(tracks: readonly CoverTrack[], cover: CoverArt): string[] {
  const out: string[] = []
  if (cover.src) out.push(cover.src)
  for (const track of tracks) {
    if (out.length >= 4) break
    if (track.originalCover?.key === cover.key && !out.includes(track.path)) out.push(track.path)
  }
  return out
}

async function fetchFull(cover: CoverArt, paths: string[]): Promise<CoverArt> {
  const api = window.musicTagEditor
  if (!api) throw new Error('Нет связи с приложением')
  for (const path of paths) {
    try {
      const [item] = await api.readCovers([path])
      if (item?.cover && item.cover.key === cover.key && item.cover.dataBase64) return item.cover
    } catch {
      /* пробуем следующий путь */
    }
  }
  throw new Error('Не удалось прочитать обложку: файл изменился или недоступен')
}

export function loadFullCover(cover: CoverArt, paths: string[]): Promise<CoverArt> {
  if (!cover.lazy) return Promise.resolve(cover)
  const key = cover.key ?? ''
  const hit = full.get(key)
  if (hit) {
    full.delete(key)
    full.set(key, hit)
    return Promise.resolve(hit)
  }
  let pending = inflight.get(key)
  if (!pending) {
    pending = fetchFull(cover, paths)
      .then((value) => {
        full.set(key, value)
        while (full.size > FULL_LIMIT) full.delete(full.keys().next().value as string)
        return value
      })
      .finally(() => inflight.delete(key))
    inflight.set(key, pending)
  }
  return pending
}

// В IPC уходит только то, что ждёт валидатор в main: mime, размер, данные.
export function plainCover(cover: CoverArt): CoverArt {
  return { mime: cover.mime, bytes: cover.bytes, dataBase64: cover.dataBase64 }
}

// ───── миниатюры для строк списка ─────
const THUMB_WIDTH = 96
const THUMB_LIMIT = 600
const BATCH = 12
const DEBOUNCE_MS = 90

const thumbs = new Map<string, string>() // key -> data URL миниатюры ('' = не получилось, не повторяем)
const interest = new Map<string, number>() // key -> сколько строк сейчас его показывают
const hints = new Map<string, string>() // key -> путь, откуда читать
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setTimeout> | null = null
let running = false
// Ошибка чтения (main занят загрузкой, IPC упал) не должна навсегда оставлять строку без миниатюры:
// пустой результат запоминаем только после нескольких неудачных попыток.
const attempts = new Map<string, number>()
const RETRY_MS = 800
const MAX_ATTEMPTS = 3

function emit(): void {
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// CSP приложения запрещает fetch(data:...), поэтому декодируем base64 вручную,
// а миниатюру отдаём тоже как data: URL (img-src для data: уже разрешён).
function toBlob(cover: CoverArt): Blob {
  const binary = atob(cover.dataBase64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type: cover.mime })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => resolve('')
    reader.readAsDataURL(blob)
  })
}

async function makeThumb(cover: CoverArt): Promise<string> {
  const bitmap = await createImageBitmap(toBlob(cover), { resizeWidth: THUMB_WIDTH, resizeQuality: 'medium' })
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const context = canvas.getContext('2d')
    if (!context) return ''
    context.drawImage(bitmap, 0, 0)
    return await blobToDataUrl(await canvas.convertToBlob({ type: 'image/webp', quality: 0.82 }))
  } finally {
    bitmap.close()
  }
}

function remember(key: string, url: string): void {
  attempts.delete(key)
  thumbs.set(key, url)
  while (thumbs.size > THUMB_LIMIT) {
    thumbs.delete(thumbs.keys().next().value as string)
  }
}

async function pump(): Promise<void> {
  if (running) return
  running = true
  try {
    for (;;) {
      const keys: string[] = []
      for (const [key, count] of interest) {
        if (count > 0 && !thumbs.has(key) && hints.has(key)) keys.push(key)
        if (keys.length >= BATCH) break
      }
      if (!keys.length) break
      const api = window.musicTagEditor
      const byPath = new Map<string, string>()
      for (const key of keys) byPath.set(hints.get(key) as string, key)
      let items: { path: string; cover: CoverArt | null }[] = []
      let failed = false
      try {
        items = api ? await api.readCovers([...byPath.keys()]) : []
      } catch {
        failed = true
      }
      if (failed) {
        let retry = false
        for (const key of keys) {
          const count = (attempts.get(key) ?? 0) + 1
          attempts.set(key, count)
          if (count >= MAX_ATTEMPTS) remember(key, '')
          else retry = true
        }
        if (retry && !timer) {
          timer = setTimeout(() => {
            timer = null
            void pump()
          }, RETRY_MS)
        }
        emit()
        break
      }
      const done = new Set<string>()
      for (const item of items) {
        const wanted = byPath.get(item.path)
        if (!wanted || !item.cover || item.cover.key !== wanted || !item.cover.dataBase64) continue
        try {
          remember(wanted, await makeThumb(item.cover))
        } catch {
          remember(wanted, '')
        }
        done.add(wanted)
      }
      // не удалось прочитать — запоминаем пустой результат, чтобы не крутиться в цикле
      for (const key of keys) if (!done.has(key)) remember(key, '')
      emit()
    }
  } finally {
    running = false
  }
}

function schedule(): void {
  if (timer) return
  timer = setTimeout(() => {
    timer = null
    void pump()
  }, DEBOUNCE_MS)
}

// Миниатюра для lazy-обложки. undefined — ещё грузится; '' — не получилось.
export function useThumb(cover: CoverArt): string | undefined {
  const key = cover.key ?? ''
  const url = useSyncExternalStore(subscribe, () => thumbs.get(key))
  useEffect(() => {
    if (!key || !cover.src) return
    interest.set(key, (interest.get(key) ?? 0) + 1)
    if (!hints.has(key)) hints.set(key, cover.src)
    if (!thumbs.has(key)) schedule()
    return () => {
      const left = (interest.get(key) ?? 1) - 1
      if (left > 0) interest.set(key, left)
      else {
        interest.delete(key)
        hints.delete(key)
      }
    }
  }, [key, cover.src])
  return url
}
