import { describe, expect, it } from 'vitest'
import { noteFileVisit, stepFileNav, type FileNav } from '@shared/file-nav'

const files = new Set(['a', 'b', 'c'])
const empty: FileNav = { past: [], future: [] }

describe('noteFileVisit', () => {
  it('запоминает предыдущий файл и сбрасывает вперёд', () => {
    const once = noteFileVisit(empty, null, 'a', files)
    const twice = noteFileVisit(once, 'a', 'b', files)
    const branched = noteFileVisit({ past: ['a'], future: ['c'] }, 'b', 'c', files)
    expect(once).toEqual(empty)
    expect(twice).toEqual({ past: ['a'], future: [] })
    expect(branched).toEqual({ past: ['a', 'b'], future: [] })
  })

  it('не пишет удалённый файл и не стирает «вперёд», пока файл тот же', () => {
    const nav = noteFileVisit({ past: ['a', 'gone'], future: ['c'] }, 'b', 'b', new Set(['a', 'b', 'c']))
    expect(nav).toEqual({ past: ['a'], future: ['c'] })
  })
})

describe('stepFileNav', () => {
  it('ходит назад и вперёд', () => {
    const back = stepFileNav({ past: ['a', 'b'], future: [] }, -1, 'c', files)
    const forward = stepFileNav(back.nav, 1, back.path, files)
    expect(back).toEqual({ path: 'b', nav: { past: ['a'], future: ['c'] } })
    expect(forward).toEqual({ path: 'c', nav: { past: ['a', 'b'], future: [] } })
  })
})
