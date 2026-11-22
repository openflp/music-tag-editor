import { readFileSync } from 'node:fs'
import { browserEssentiaWasm } from '../electron/essentia-wasm'
import { displayKey, initialKeyOf, partsOf, roundBpm, sliceWindow } from '@shared/analysis'
import { camelotOf } from '@shared/key'

describe('audio slice', () => {
  it('keeps short files and takes the middle of long ones', () => {
    expect(sliceWindow(0)).toEqual({ startSec: 0, lengthSec: 0 })
    expect(sliceWindow(45)).toEqual({ startSec: 0, lengthSec: 45 })
    expect(sliceWindow(80)).toEqual({ startSec: 0, lengthSec: 80 })
    expect(sliceWindow(180)).toEqual({ startSec: 52.5, lengthSec: 75 })
  })

  it('rounds bpm to one decimal', () => {
    expect(roundBpm(127.96)).toBe(128)
    expect(roundBpm(120.44)).toBe(120.4)
    expect(roundBpm(0)).toBe(0)
  })

  it('maps sharps and flats to Camelot', () => {
    expect(partsOf('F# minor')).toEqual({ key: 'F#', scale: 'minor' })
    expect(partsOf('Bb')).toEqual({ key: 'Bb', scale: 'major' })
    expect(partsOf('D♭m')).toEqual({ key: 'Db', scale: 'minor' })
    expect(initialKeyOf('F#', 'minor')).toBe('F#m')
    expect(camelotOf(initialKeyOf('F#', 'minor'))).toBe('11A')
    expect(camelotOf(initialKeyOf('Bb', 'major'))).toBe('6B')
    expect(camelotOf('8A')).toBe('8A')
    expect(displayKey('C')).toBe('C major')
    expect(displayKey('Am')).toBe('A minor')
    expect(displayKey('F# minor')).toBe('F# minor')
    expect(displayKey('Bb')).toBe('Bb major')
    expect(camelotOf(displayKey('C'))).toBe('8B')
  })
})

describe('essentia wasm glue', () => {
  it('drops the node loader so a module worker can boot', () => {
    const source = readFileSync('node_modules/essentia.js/dist/essentia-wasm.es.js', 'utf8')
    const browser = browserEssentiaWasm(source)
    expect(browser).toContain('ENVIRONMENT_IS_WORKER=typeof WorkerGlobalScope!=="undefined"')
    expect(browser).toContain('ENVIRONMENT_IS_NODE=false')
    expect(browser).not.toContain('require(')
    expect(browser).toContain('data:application/octet-stream;base64,AGFzbQ')
  })
})
