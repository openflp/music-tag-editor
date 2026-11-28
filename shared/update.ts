import { RELEASES_URL } from './types'

export interface ReleaseInfo {
  version: string
  tag: string
  publishedAt: string
  prerelease: boolean
}

const VERSION = /^v?(\d+(?:\.\d+){0,3})(?:[.-][A-Za-z0-9.]+)?$/
const TAG = /^[A-Za-z0-9._+-]{1,64}$/

export function compareVersions(left: string, right: string): number {
  const a = left.split('.')
  const b = right.split('.')
  const count = Math.max(a.length, b.length)
  for (let index = 0; index < count; index += 1) {
    const delta = part(a[index]) - part(b[index])
    if (delta !== 0) return delta > 0 ? 1 : -1
  }
  return 0
}

function part(value: string | undefined): number {
  const match = value ? /^(\d+)/.exec(value) : null
  return match ? Number(match[1]) : 0
}

export function hasNewer(current: string, versions: readonly ReleaseInfo[]): boolean {
  return versions.some((item) => !item.prerelease && compareVersions(item.version, current) > 0)
}

export function parseReleaseList(payload: unknown): ReleaseInfo[] {
  if (!Array.isArray(payload)) return []
  const out: ReleaseInfo[] = []
  const seen = new Set<string>()
  for (const item of payload) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    if (row.draft === true) continue
    const raw = typeof row.tag_name === 'string' ? row.tag_name : typeof row.name === 'string' ? row.name : ''
    const version = versionOf(raw)
    if (!version || seen.has(version)) continue
    seen.add(version)
    const published = typeof row.published_at === 'string' ? row.published_at : ''
    out.push({
      version,
      tag: raw.trim(),
      publishedAt: /^\d{4}-\d{2}-\d{2}/.test(published) ? published : '',
      prerelease: row.prerelease === true
    })
  }
  out.sort((left, right) => compareVersions(right.version, left.version))
  return out.slice(0, 20)
}

function versionOf(raw: string): string | null {
  const tag = raw.trim()
  if (!TAG.test(tag) || !VERSION.test(tag)) return null
  return tag.replace(/^v/i, '')
}

const RELEASE_API = 'https://api.github.com/repos/openflp/music-tag-editor/'

export function isReleaseApiUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.origin === 'https://api.github.com' && url.pathname.startsWith('/repos/openflp/music-tag-editor/')
  } catch {
    return false
  }
}

export function releaseResponse(status: number, finalUrl: string): 'empty' | 'json' | 'reject' {
  if (finalUrl !== '' && !isReleaseApiUrl(finalUrl)) return 'reject'
  if (status === 404) return 'empty'
  if (status >= 200 && status < 300) return 'json'
  return 'reject'
}

export const RELEASES_API = `${RELEASE_API}releases?per_page=20`
export const TAGS_API = `${RELEASE_API}tags?per_page=20`

/** Страница одного релиза. Чужой адрес и не-тег сюда не проходят. */
export function releasePageUrl(tag: string): string | null {
  const clean = tag.trim()
  if (!TAG.test(clean) || !VERSION.test(clean)) return null
  return `${RELEASES_URL}/tag/${encodeURIComponent(clean)}`
}
