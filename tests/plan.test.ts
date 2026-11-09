import { buildJob, buildJobs, trackDirty, uniformField, type PlanState, type PlanTrack } from '@shared/plan'
import { emptyTags } from '@shared/types'

function track(patch: Partial<PlanTrack> = {}): PlanTrack {
  const tags = emptyTags()
  return {
    path: 'C:/music/a.mp3',
    original: tags,
    draft: { ...tags },
    originalCover: null,
    draftCover: null,
    ...patch
  }
}

function state(patch: Partial<PlanState> = {}): PlanState {
  return {
    applyAll: { artist: false, album: false, albumArtist: false, genre: false, year: false, comment: false },
    applyValues: emptyTags(),
    applyCover: false,
    sharedCover: null,
    ...patch
  }
}

describe('buildJob', () => {
  it('skips fields the user did not change', () => {
    const item = track()
    item.draft = { ...item.draft, title: 'Ночь' }
    const job = buildJob(item, state())
    expect(job?.patch).toEqual({ title: 'Ночь' })
    expect(job?.cover).toBeUndefined()
  })

  it('writes an apply-all field onto every track', () => {
    const first = track()
    const second = track({ path: 'C:/music/b.flac' })
    const plan = state({
      applyAll: { artist: true, album: false, albumArtist: false, genre: false, year: false, comment: false },
      applyValues: { ...emptyTags(), artist: 'Группа' }
    })
    const jobs = buildJobs([first, second], plan)
    expect(jobs).toHaveLength(2)
    expect(jobs.every((job) => job.patch.artist === 'Группа')).toBe(true)
  })

  it('returns null when nothing changed', () => {
    const item = track()
    expect(buildJob(item, state())).toBeNull()
    expect(trackDirty(item, state())).toBe(false)
  })

  it('includes a shared cover only when it differs', () => {
    const cover = { mime: 'image/png', bytes: 4, dataBase64: 'aaaa' }
    const item = track({ originalCover: cover, draftCover: cover })
    const same = state({ applyCover: true, sharedCover: cover })
    expect(buildJob(item, same)).toBeNull()
    const next = state({ applyCover: true, sharedCover: null })
    expect(buildJob(item, next)?.cover).toBeNull()
  })

  it('marks mixed values', () => {
    expect(uniformField(['a', 'a'], (left, right) => left === right)).toEqual({ mixed: false, value: 'a' })
    expect(uniformField(['a', 'b'], (left, right) => left === right).mixed).toBe(true)
  })

  it('keeps the file when the mask repeats its name', () => {
    expect(buildJob(track(), state({ fileName: { mask: '%filename%', directory: '' } }))).toBeNull()
  })

  it('renames from the title that will be written', () => {
    const item = track()
    item.draft = { ...item.draft, title: 'Ночь' }
    const job = buildJob(item, state({ fileName: { mask: '%title%', directory: '' } }))
    expect(job?.targetPath).toBe('C:/music/Ночь.mp3')
    expect(job?.patch.title).toBe('Ночь')
  })

  it('keeps a number the user typed for one file', () => {
    const first = track()
    const second = track({ path: 'C:/music/b.mp3' })
    const jobs = buildJobs([first, second], state({ fileName: { mask: '', directory: '', fixed: { 'C:/music/a.mp3': '7' } } }))
    expect(jobs).toHaveLength(1)
    expect(jobs[0]?.patch.trackNumber).toBe(7)
    expect(jobs[0]?.targetPath).toBe('C:/music/7 a.mp3')
  })

  it('writes one random number into the track tag, the text and the file name', () => {
    const first = track()
    const second = track({ path: 'C:/music/b.mp3' })
    first.draft = { ...first.draft, title: 'Ночь %n%' }
    const jobs = buildJobs([first, second], state({ fileName: { mask: '%n% - %filename%', directory: '', seed: 2 } }))
    expect(jobs).toHaveLength(2)
    const numbers = jobs.map((job) => String(job.patch.trackNumber).padStart(1, '0'))
    expect(new Set(numbers).size).toBe(2)
    const named = jobs.find((job) => job.path.endsWith('a.mp3'))
    const number = String(named?.patch.trackNumber)
    expect(named?.patch.title).toBe(`Ночь ${number}`)
    expect(named?.targetPath).toBe(`C:/music/${number} - a.mp3`)
    expect(jobs.find((job) => job.path.endsWith('b.mp3'))?.patch.trackNumber).not.toBe(named?.patch.trackNumber)
  })
})
