import { describe, expect, it } from 'vitest'
import { collectHistory, historyChoices, mergeHistoryList } from '@shared/history'

describe('mergeHistoryList', () => {
  it('ставит новое значение первым и не дублирует регистр', () => {
    expect(mergeHistoryList(['Rock', 'Jazz'], ['rock', 'Soul'])).toEqual(['rock', 'Soul', 'Jazz'])
  })

  it('хранит не больше лимита', () => {
    expect(mergeHistoryList(['b', 'c'], ['a'], 2)).toEqual(['a', 'b'])
  })

  it('пропускает пустые строки', () => {
    expect(mergeHistoryList(['Jazz'], ['  ', ''])).toEqual(['Jazz'])
  })
})

describe('historyChoices', () => {
  it('скрывает значения, которые уже есть в загруженных файлах', () => {
    expect(historyChoices(['Rock', 'Soul', 'jazz'], ['rock', 'Pop'], '')).toEqual(['Soul', 'jazz'])
  })

  it('фильтрует по вводу', () => {
    expect(historyChoices(['Soul', 'Synth'], ['Rock'], 'so')).toEqual(['Soul'])
  })
})

describe('collectHistory', () => {
  it('собирает непустые поля из тегов', () => {
    expect(
      collectHistory([
        { artist: ' Neon ', album: '', genre: 'Rock' },
        { artist: 'Neon', albumArtist: 'Band' }
      ])
    ).toEqual({
      artist: ['Neon', 'Neon'],
      albumArtist: ['Band'],
      genre: ['Rock']
    })
  })
})
