import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readTrack, writeTrack } from '../electron/services/tag-io'

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

function pcmWav(): Buffer {
  const samples = Buffer.alloc(16)
  const file = Buffer.alloc(44 + samples.length)
  file.write('RIFF', 0)
  file.writeUInt32LE(36 + samples.length, 4)
  file.write('WAVE', 8)
  file.write('fmt ', 12)
  file.writeUInt32LE(16, 16)
  file.writeUInt16LE(1, 20)
  file.writeUInt16LE(1, 22)
  file.writeUInt32LE(8000, 24)
  file.writeUInt32LE(16000, 28)
  file.writeUInt16LE(2, 32)
  file.writeUInt16LE(16, 34)
  file.write('data', 36)
  file.writeUInt32LE(samples.length, 40)
  samples.copy(file, 44)
  return file
}

describe('writeTrack', () => {
  const dirs: string[] = []

  afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
  })

  it('writes a wav copy whose temporary name is not a wav extension', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'music-tag-'))
    dirs.push(dir)
    const filePath = join(dir, 'audio [drums].wav')
    await writeFile(filePath, pcmWav())

    const result = await writeTrack({ path: filePath, patch: { title: 'Drums' } })

    expect(result).toEqual({ path: filePath, ok: true })
    const snapshot = readTrack(filePath)
    expect(snapshot.error).toBeUndefined()
    expect(snapshot.tags.title).toBe('Drums')
  })
})
