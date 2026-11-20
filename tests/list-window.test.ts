import { describe, expect, it } from 'vitest'
import { contentSpan, thumbBox, virtualRange } from '../src/renderer/src/shared/ui/scroll-metrics'
import { rankBy, scoreHay } from '../src/renderer/src/widgets/chrome/palette-rank'

const ROW = 46

describe('virtual list', () => {
  it('окно покрывает видимые строки и не сдвигается, когда список растёт снизу', () => {
    const scroll = 2400
    const view = 400
    const early = virtualRange(scroll, view, 80, ROW, 12)
    const later = virtualRange(scroll, view, 5000, ROW, 12)
    expect(later).toEqual(early)
    const first = Math.floor(scroll / ROW)
    const last = Math.ceil((scroll + view) / ROW)
    expect(later.start).toBeLessThanOrEqual(first)
    expect(later.end).toBeGreaterThanOrEqual(Math.min(5000, last))
  })

  it('высота контента линейна по числу строк', () => {
    expect(contentSpan(0, ROW, 10)).toBe(10)
    expect(contentSpan(5000, ROW, 10)).toBe(5000 * ROW + 10)
  })

  it('ползунок считается от известной высоты и ужимается по мере роста списка', () => {
    const small = thumbBox(400, contentSpan(30, ROW, 10), 400, 0)
    const large = thumbBox(400, contentSpan(5000, ROW, 10), 400, 0)
    expect(small.height).toBeGreaterThan(large.height)
    expect(large.height).toBeGreaterThanOrEqual(48)
    expect(large.height).toBeLessThan(400)
    const mid = thumbBox(400, contentSpan(5000, ROW, 10), 400, 20_000)
    expect(mid.y).toBeGreaterThan(0)
    expect(mid.y).toBeLessThan(400)
  })
})

describe('palette rank', () => {
  it('ищет по всем строкам, а не по первым десяткам', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => `title ${index} artist ${index % 40}`)
    const found = rankBy(rows, 'title 4999', (row) => row)
    expect(found[0]).toBe('title 4999 artist 39')
    expect(found.some((row) => row.startsWith('title 4999'))).toBe(true)
    expect(found.length).toBeLessThan(rows.length)
  })

  it('пустое слово оставляет тот же массив', () => {
    const rows = ['a', 'b']
    expect(rankBy(rows, '   ', (row) => row)).toBe(rows)
  })

  it('все слова запроса должны встретиться', () => {
    expect(scoreHay('title 12 artist queen', 'queen 12')).toBeGreaterThan(0)
    expect(scoreHay('title 12 artist queen', 'queen beatles')).toBe(0)
  })

  it('пять тысяч подписей фильтруются быстрее кадра', () => {
    const rows = Array.from({ length: 5000 }, (_, index) => `title ${index} artist ${index % 40}`)
    const started = performance.now()
    const found = rankBy(rows, 'artist 7', (row) => row)
    expect(performance.now() - started).toBeLessThan(40)
    expect(found.length).toBeGreaterThan(0)
  })
})
