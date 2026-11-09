import { describe, expect, it } from 'vitest'
import { fileKind } from '../src/renderer/src/features/editor/lib/drop'

describe('fileKind', () => {
  it('различает аудио, папку, картинку и текст', () => {
    expect(fileKind('song.mp3', false)).toBe('audio')
    expect(fileKind('Album', true)).toBe('folder')
    expect(fileKind('cover.PNG', false)).toBe('image')
    expect(fileKind('note.txt', false)).toBe('text')
    expect(fileKind('notes.md', false)).toBe('other')
  })
})
