import { describe, expect, it } from 'vitest'
import { issueReportUrl } from '../electron/services/validate'

describe('issue report url', () => {
  it('opens a new GitHub issue and keeps the error text', () => {
    const url = new URL(issueReportUrl('TypeError: boom', 'Непредвиденная ошибка'))
    expect(url.origin).toBe('https://github.com')
    expect(url.pathname).toBe('/openflp/music-tag-editor/issues/new')
    expect(url.searchParams.get('title')).toBe('Непредвиденная ошибка')
    expect(url.searchParams.get('body')).toBe('TypeError: boom')
  })

  it('rejects anything that is not the report text', () => {
    expect(() => issueReportUrl({ url: 'https://evil.example' }, 'Unexpected error')).toThrow(/ссылка/)
  })
})
