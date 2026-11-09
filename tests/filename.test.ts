import { applyMask, orderWrites, resolveTarget, shuffleNumbers } from '@shared/filename'
import { emptyTags, type WriteJob } from '@shared/types'

describe('filename mask', () => {
  const tags = { ...emptyTags(), artist: 'Группа', title: 'Ночь', trackNumber: 3, year: 2020 }

  it('keeps the original name when the mask is empty', () => {
    expect(resolveTarget('C:/music/a.mp3', tags, { mask: '', directory: '' })).toBeNull()
  })

  it('builds a name from tokens and drops empty edges', () => {
    expect(applyMask('%track% - %artist% - %title%', tags, 'C:/music/a.mp3')).toBe('03 - Группа - Ночь')
    expect(resolveTarget('C:/music/a.mp3', tags, { mask: '%artist% - %title%', directory: '' })).toBe('C:/music/Группа - Ночь.mp3')
  })

  it('leaves other files alone when the mask is not for everyone', () => {
    expect(resolveTarget('C:/music/a.mp3', tags, { mask: '%title%', directory: '', all: false, selected: [] })).toBeNull()
    expect(resolveTarget('C:/music/a.mp3', tags, { mask: '%title%', directory: '', all: false, selected: ['C:/music/a.mp3'] })).toBe('C:/music/Ночь.mp3')
  })

  it('moves into another folder without renaming', () => {
    expect(resolveTarget('C:/music/a.mp3', tags, { mask: '', directory: 'D:/out' })).toBe('D:/out/a.mp3')
  })

  it('places the number token where it stands', () => {
    expect(applyMask('(%n%) %title%', tags, 'C:/music/a.mp3', '12')).toBe('(12) Ночь')
  })

  it('assigns a stable unique number to each path', () => {
    const first = shuffleNumbers(['a', 'b', 'c'], 4)
    expect(Object.values(first).sort()).toEqual(['1', '2', '3'])
    expect(shuffleNumbers(['a', 'b', 'c'], 4)).toEqual(first)
  })

  it('starts numbering and pads when asked', () => {
    expect(Object.values(shuffleNumbers(['a', 'b'], 1, { start: 5, width: 3 })).sort()).toEqual(['005', '006'])
  })

  it('replaces a custom token', () => {
    expect(applyMask('%label% %title%', tags, 'C:/music/a.mp3', undefined, { label: 'Live' })).toBe('Live Ночь')
  })

  it('strips characters a file name cannot contain', () => {
    expect(applyMask('%title%', { ...tags, title: 'a/b:c' }, 'C:/music/a.mp3')).toBe('a b c')
  })

  it('writes a chain of renames from the free name first', () => {
    const jobs: WriteJob[] = [
      { path: 'C:/music/a.mp3', patch: {}, targetPath: 'C:/music/b.mp3' },
      { path: 'C:/music/b.mp3', patch: {}, targetPath: 'C:/music/c.mp3' }
    ]
    expect(orderWrites(jobs).ready.map((job) => job.path)).toEqual(['C:/music/b.mp3', 'C:/music/a.mp3'])
  })

  it('blocks files that would receive the same name', () => {
    const jobs: WriteJob[] = [
      { path: 'C:/music/a.mp3', patch: {}, targetPath: 'C:/music/c.mp3' },
      { path: 'C:/music/b.mp3', patch: {}, targetPath: 'C:/music/c.mp3' }
    ]
    expect(orderWrites(jobs).ready).toHaveLength(0)
    expect(orderWrites(jobs).blocked).toHaveLength(2)
  })
})
