import type { TrackTags, WriteJob } from './types'

export interface FileNamePlan {
  mask: string
  directory: string
  platform?: string
  seed?: number
  numbers?: Record<string, string>
  fixed?: Record<string, string>
  all?: boolean
  selected?: string[]
  start?: number
  width?: number
  tokens?: Record<string, string>
}

export interface FileParts {
  dir: string
  stem: string
  ext: string
}

export const NAME_TOKENS = [
  { token: '%artist%', label: 'Исполнитель' },
  { token: '%title%', label: 'Название' },
  { token: '%album%', label: 'Альбом' },
  { token: '%albumartist%', label: 'Исполнитель альбома' },
  { token: '%year%', label: 'Год' },
  { token: '%track%', label: 'Номер' },
  { token: '%disc%', label: 'Диск' },
  { token: '%genre%', label: 'Жанр' },
  { token: '%filename%', label: 'Имя файла' },
  { token: '%n%', label: 'Номер' }
] as const

const TOKEN_VALUE: Record<string, (tags: TrackTags, file: FileParts) => string> = {
  title: (tags) => tags.title,
  artist: (tags) => tags.artist,
  album: (tags) => tags.album,
  albumartist: (tags) => tags.albumArtist,
  genre: (tags) => tags.genre,
  year: (tags) => (tags.year == null ? '' : String(tags.year)),
  track: (tags) => (tags.trackNumber == null ? '' : String(tags.trackNumber).padStart(2, '0')),
  disc: (tags) => (tags.discNumber == null ? '' : String(tags.discNumber)),
  filename: (_tags, file) => file.stem
}

export function fileParts(filePath: string): FileParts {
  const slash = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  const dir = slash >= 0 ? filePath.slice(0, slash) : ''
  const base = slash >= 0 ? filePath.slice(slash + 1) : filePath
  const dot = base.lastIndexOf('.')
  const ext = dot > 0 ? base.slice(dot) : ''
  const stem = dot > 0 ? base.slice(0, dot) : base
  return { dir, stem, ext }
}

export function fileName(filePath: string): string {
  const file = fileParts(filePath)
  return `${file.stem}${file.ext}`
}

export function sameFilePath(a: string, b: string, platform = 'win32'): boolean {
  const left = a.replaceAll('\\', '/')
  const right = b.replaceAll('\\', '/')
  return platform === 'linux' ? left === right : left.toLowerCase() === right.toLowerCase()
}

export function joinPath(dir: string, name: string): string {
  if (!dir) return name
  if (dir.endsWith('/') || dir.endsWith('\\')) return dir + name
  const sep = dir.includes('\\') ? '\\' : '/'
  return dir + sep + name
}

export function sanitizeFileStem(value: string): string {
  return value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
}

export function hasNumberToken(value: string): boolean {
  return /%n%/i.test(value)
}

export function putNumber(value: string, number: string): string {
  return value.replace(/%n%/gi, number)
}

export function shuffleNumbers(paths: string[], seed: number, options?: { start?: number; width?: number }): Record<string, string> {
  const list = [...paths]
  let state = seed >>> 0 || 1
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(next() * (index + 1))
    const item = list[index]
    list[index] = list[swap]
    list[swap] = item
  }
  const start = Math.max(0, Math.min(9999, options?.start ?? 1))
  const auto = String(Math.max(list.length + start - 1, 1)).length
  const width = options?.width && options.width > 0 ? Math.min(6, options.width) : auto
  const numbers: Record<string, string> = {}
  list.forEach((path, index) => {
    numbers[path] = String(start + index).padStart(width, '0')
  })
  return numbers
}

export function applyMask(mask: string, tags: TrackTags, sourcePath: string, number?: string, tokens?: Record<string, string>): string {
  const file = fileParts(sourcePath)
  const replaced = mask.replace(/%([a-z]+)%/gi, (all, key: string) => {
    const name = key.toLowerCase()
    if (name === 'n') return number ?? ''
    if (tokens && Object.prototype.hasOwnProperty.call(tokens, name)) return tokens[name] ?? ''
    const token = TOKEN_VALUE[name]
    return token ? token(tags, file) : all
  })
  let stem = sanitizeFileStem(replaced)
  if (file.ext && stem.toLowerCase().endsWith(file.ext.toLowerCase())) stem = sanitizeFileStem(stem.slice(0, -file.ext.length))
  return stem || file.stem
}

export function insertMask(mask: string, token: string): string {
  if (!mask.trim()) return token
  if (mask.endsWith(' ') || mask.endsWith('-')) return `${mask}${token}`
  return `${mask} ${token}`
}

export function resolveTarget(sourcePath: string, tags: TrackTags, plan?: FileNamePlan): string | null {
  if (!plan) return null
  if (plan.all === false && !(plan.selected ?? []).includes(sourcePath)) return null
  const mask = plan.mask.trim()
  const directory = plan.directory.trim()
  if (!mask && !directory) return null
  const file = fileParts(sourcePath)
  const number = plan.numbers?.[sourcePath]
  const stem = mask ? applyMask(mask, tags, sourcePath, number, plan.tokens) : file.stem
  const dir = directory || file.dir
  const target = joinPath(dir, `${stem}${file.ext}`)
  if (sameFilePath(target, sourcePath, plan.platform)) return null
  return target
}

function pathKey(filePath: string, platform: string): string {
  const slash = filePath.replaceAll('\\', '/')
  return platform === 'linux' ? slash : slash.toLowerCase()
}

export function orderWrites(jobs: WriteJob[], platform = 'win32'): { ready: WriteJob[]; blocked: WriteJob[] } {
  const destOf = (job: WriteJob) => pathKey(job.targetPath ?? job.path, platform)
  const counts = new Map<string, number>()
  for (const job of jobs) counts.set(destOf(job), (counts.get(destOf(job)) ?? 0) + 1)
  const unique: WriteJob[] = []
  const blocked: WriteJob[] = []
  for (const job of jobs) {
    if ((counts.get(destOf(job)) ?? 0) > 1) blocked.push(job)
    else unique.push(job)
  }
  const ready: WriteJob[] = []
  const pending = [...unique]
  while (pending.length) {
    const sources = new Set(pending.map((job) => pathKey(job.path, platform)))
    const index = pending.findIndex((job) => {
      const dest = destOf(job)
      return dest === pathKey(job.path, platform) || !sources.has(dest)
    })
    if (index < 0) {
      blocked.push(...pending)
      break
    }
    const [next] = pending.splice(index, 1)
    ready.push(next)
  }
  return { ready, blocked }
}
