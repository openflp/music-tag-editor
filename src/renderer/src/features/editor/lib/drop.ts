import { AUDIO_EXTENSIONS, IMAGE_EXTENSIONS, MAX_COVER_BYTES, type CoverArt } from '@shared/types'

const AUDIO = new Set<string>(AUDIO_EXTENSIONS)
const IMAGES = new Set<string>(IMAGE_EXTENSIONS)
const COMMENT_LIMIT = 4000

export type FileKind = 'audio' | 'folder' | 'image' | 'text' | 'other'
export type DropMode = 'library' | 'cover' | 'comment'

export interface OsDrop {
  library: string[]
  images: File[]
  texts: File[]
  missedPath: number
  missedKind: number
}

export function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot).toLowerCase() : ''
}

export function fileKind(name: string, directory: boolean): FileKind {
  if (directory) return 'folder'
  const ext = extensionOf(name)
  if (AUDIO.has(ext)) return 'audio'
  if (IMAGES.has(ext)) return 'image'
  if (ext === '.txt') return 'text'
  return 'other'
}

export function takeDrop(files: FileList | File[]): OsDrop {
  const library: string[] = []
  const images: File[] = []
  const texts: File[] = []
  let missedPath = 0
  let missedKind = 0
  const api = window.musicTagEditor
  for (const file of Array.from(files)) {
    const path = api?.getPathForFile(file) ?? ''
    const kind = fileKind(file.name, false)
    const folder = !extensionOf(file.name)
    if (kind === 'audio' || kind === 'folder' || folder) {
      if (path) library.push(path)
      else missedPath += 1
      continue
    }
    if (kind === 'image') {
      images.push(file)
      continue
    }
    if (kind === 'text') {
      texts.push(file)
      continue
    }
    missedKind += 1
  }
  return { library, images, texts, missedPath, missedKind }
}

function mimeOf(file: File): string {
  if (file.type === 'image/jpg') return 'image/jpeg'
  if (file.type.startsWith('image/')) return file.type
  const ext = extensionOf(file.name)
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  return ''
}

function encodeBase64(bytes: Uint8Array): string {
  let binary = ''
  const step = 0x8000
  for (let index = 0; index < bytes.length; index += step) {
    const slice = bytes.subarray(index, index + step)
    binary += String.fromCharCode(...slice)
  }
  return btoa(binary)
}

// тот же отпечаток, что и в main (tag-io coverKey): размер + первые 20 hex-символов sha1
async function coverKeyOf(bytes: Uint8Array<ArrayBuffer>): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-1', bytes)
    const hex = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
    return `${bytes.byteLength}:${hex.slice(0, 20)}`
  } catch {
    return undefined
  }
}

export async function coverFromFile(file: File): Promise<CoverArt> {
  if (file.size <= 0 || file.size > MAX_COVER_BYTES) throw new Error('Обложка больше 8 МБ или пустая')
  const mime = mimeOf(file)
  if (!mime) throw new Error('Обложка должна быть изображением')
  const bytes = new Uint8Array(await file.arrayBuffer())
  return { mime, bytes: bytes.byteLength, dataBase64: encodeBase64(bytes), key: await coverKeyOf(bytes) }
}

export async function commentFromFile(file: File): Promise<string> {
  const text = (await file.text()).replace(/^\uFEFF/, '')
  if (text.length > COMMENT_LIMIT) throw new Error('Комментарий длиннее 4000 символов')
  return text
}
