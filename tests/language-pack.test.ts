import { describe, expect, it } from 'vitest'
import { applyLanguagePack, languagePackTemplate, parseLanguagePack } from '@shared/language-pack'

describe('language pack', () => {
  it('keeps known strings and drops unknown ones', () => {
    const pack = parseLanguagePack({
      id: 'de',
      name: 'Deutsch',
      base: 'en',
      strings: { settings: 'Einstellungen', missing: 'nope' }
    })
    expect(pack.strings).toEqual({ settings: 'Einstellungen' })
    expect(applyLanguagePack(pack.base, pack.strings).settings).toBe('Einstellungen')
    expect(applyLanguagePack(pack.base, pack.strings).language).toBe('Language')
  })

  it('uses name as the language title in a sample', () => {
    expect(parseLanguagePack(JSON.parse(languagePackTemplate('en'))).name).toBe('Language name')
    expect(parseLanguagePack(JSON.parse(languagePackTemplate('ru'))).name).toBe('Название языка')
  })

  it('rejects a built-in id', () => {
    expect(() => parseLanguagePack({ id: 'en', name: 'English', base: 'en', strings: { settings: 'Settings' } })).toThrow(/пакет/)
  })
})
