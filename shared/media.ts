export const MEDIA_SCHEME = 'media'
export const MEDIA_HOST = 'track'

export function mediaTrackUrl(filePath: string): string {
  const url = new URL(`${MEDIA_SCHEME}://${MEDIA_HOST}/`)
  url.searchParams.set('p', filePath)
  return url.href
}

export function parseByteRange(header: string | null, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/i.exec(header.trim())
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!Number.isFinite(suffix) || suffix <= 0) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Number(match[2])
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size || end < start) return 'invalid'
  return { start, end: Math.min(end, size - 1) }
}
