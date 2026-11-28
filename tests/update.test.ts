import { describe, expect, it } from 'vitest'
import { RELEASES_API, compareVersions, hasNewer, isReleaseApiUrl, parseReleaseList, releasePageUrl, releaseResponse } from '@shared/update'

describe('release list', () => {
  it('keeps published versions and skips drafts and junk', () => {
    const list = parseReleaseList([
      { tag_name: 'v0.2.0', draft: false, prerelease: false, published_at: '2026-02-01T00:00:00Z' },
      { tag_name: 'v0.3.0-beta', prerelease: true, published_at: '2026-03-01T00:00:00Z' },
      { tag_name: 'v0.9.0', draft: true },
      { tag_name: 'not a version' },
      { name: 'Release notes' },
      null
    ])
    expect(list.map((item) => item.version)).toEqual(['0.3.0-beta', '0.2.0'])
    expect(list[0]?.prerelease).toBe(true)
    expect(list[1]?.publishedAt.startsWith('2026-02-01')).toBe(true)
  })

  it('reads tag names when the payload has no releases', () => {
    expect(parseReleaseList([{ name: 'v1.2.0' }])).toEqual([{ version: '1.2.0', tag: 'v1.2.0', publishedAt: '', prerelease: false }])
  })

  it('orders versions by number and notices a newer stable one', () => {
    expect(compareVersions('1.10.0', '1.9.0')).toBe(1)
    expect(compareVersions('0.1.0', '0.1')).toBe(0)
    const versions = parseReleaseList([
      { tag_name: 'v0.1.0', prerelease: false },
      { tag_name: 'v0.2.0-rc1', prerelease: true }
    ])
    expect(hasNewer('0.1.0', versions)).toBe(false)
    expect(hasNewer('0.1.0', parseReleaseList([{ tag_name: 'v0.2.0' }]))).toBe(true)
  })

  it('ignores a payload that is not a list', () => {
    expect(parseReleaseList({ tag_name: 'v1.0.0' })).toEqual([])
  })

  it('accepts the GitHub API and an empty final URL from Electron', () => {
    expect(isReleaseApiUrl(RELEASES_API)).toBe(true)
    expect(isReleaseApiUrl('https://example.com/repos/openflp/music-tag-editor/releases')).toBe(false)
    expect(releaseResponse(200, '')).toBe('json')
    expect(releaseResponse(404, '')).toBe('empty')
    expect(releaseResponse(200, 'https://evil.example/releases')).toBe('reject')
    expect(releaseResponse(403, '')).toBe('reject')
  })

  it('builds a release page only for a real tag', () => {
    expect(releasePageUrl('v0.2.0')).toBe('https://github.com/openflp/music-tag-editor/releases/tag/v0.2.0')
    expect(releasePageUrl('v0.3.0-beta')).toBe('https://github.com/openflp/music-tag-editor/releases/tag/v0.3.0-beta')
    expect(releasePageUrl('https://evil.example')).toBeNull()
    expect(releasePageUrl('../secret')).toBeNull()
  })
})
