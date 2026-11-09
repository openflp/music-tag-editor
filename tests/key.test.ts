import { camelotOf } from '@shared/key'

describe('camelot', () => {
  it('maps major and minor keys', () => {
    expect(camelotOf('C')).toBe('8B')
    expect(camelotOf('Am')).toBe('8A')
    expect(camelotOf('F# minor')).toBe('11A')
  })

  it('keeps a code that is already Camelot', () => {
    expect(camelotOf('8a')).toBe('8A')
  })
})
