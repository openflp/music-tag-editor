import { describe, expect, it } from 'vitest'
import { movePaths } from '../src/renderer/src/features/editor/lib/order'

describe('movePaths', () => {
  const order = ['a', 'b', 'c', 'd']

  it('переносит строку ниже', () => {
    expect(movePaths(order, ['a'], 3)).toEqual(['b', 'c', 'a', 'd'])
  })

  it('переносит строку в начало', () => {
    expect(movePaths(order, ['c'], 0)).toEqual(['c', 'a', 'b', 'd'])
  })

  it('переносит выделение одним блоком', () => {
    expect(movePaths(order, ['a', 'c'], 4)).toEqual(['b', 'd', 'a', 'c'])
  })

  it('оставляет порядок, если место не изменилось', () => {
    expect(movePaths(order, ['b'], 1)).toBe(order)
    expect(movePaths(order, ['b'], 2)).toBe(order)
  })
})