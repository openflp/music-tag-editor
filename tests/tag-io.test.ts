import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readTrack } from '../electron/services/tag-io'

describe('readTrack', () => {
  it('reads an m4a file when the video codec slot is empty', () => {
    const snapshot = readTrack(resolve('tests/fixtures/sample.m4a'))
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.format).toBe('.m4a')
    expect(snapshot.tech.codec).toContain('mp4a')
  })

  it('keeps apple tags from an m4a file', () => {
    const snapshot = readTrack(resolve('tests/fixtures/sample.m4a.tmp.m4a'))
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.tags.title).toBe('Ночь')
    expect(snapshot.tech.facts.some((fact) => fact.value.includes('Ночь'))).toBe(true)
    expect(snapshot.tech.tagTypes).toContain('MP4')
    expect(snapshot.tech.bpm).toBe(120)
    expect(snapshot.tech.key).toBe('8A')
    expect(snapshot.tech.encoder).toBe('Lavf54.2.100')
    expect(snapshot.tech.facts.some((fact) => fact.key === 'tag.tmpo' && fact.value === '120')).toBe(true)
  })
})
