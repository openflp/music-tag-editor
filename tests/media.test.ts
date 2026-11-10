import { describe, expect, it } from 'vitest'
import { mediaTrackUrl, parseByteRange } from '@shared/media'

describe('media url', () => {
  it('round-trips a local audio path', () => {
    const filePath = 'D:\\music\\a b.mp3'
    const url = new URL(mediaTrackUrl(filePath))
    expect(url.protocol).toBe('media:')
    expect(url.hostname).toBe('track')
    expect(url.searchParams.get('p')).toBe(filePath)
  })

  it('parses a playback seek range', () => {
    expect(parseByteRange('bytes=1000-', 5000)).toEqual({ start: 1000, end: 4999 })
    expect(parseByteRange('bytes=0-99', 5000)).toEqual({ start: 0, end: 99 })
    expect(parseByteRange('bytes=-500', 5000)).toEqual({ start: 4500, end: 4999 })
    expect(parseByteRange('bytes=9000-', 5000)).toBe('invalid')
    expect(parseByteRange(null, 5000)).toBeNull()
  })
})
