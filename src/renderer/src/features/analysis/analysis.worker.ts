import Essentia from 'essentia.js/dist/essentia.js-core.es.js'
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js'
import essentiaWasmUrl from 'essentia.js/dist/essentia-wasm.web.wasm?url'
import { camelotOf } from '@shared/key'
import { initialKeyOf, roundBpm, type AnalysisResult } from '@shared/analysis'

interface RequestMessage {
  id: number
  samples: Float32Array
}

interface VectorFloat {
  delete?: () => void
}

interface OkMessage {
  id: number
  ok: true
  result: Pick<AnalysisResult, 'bpm' | 'key' | 'scale' | 'camelot'>
}

interface ErrMessage {
  id: number
  ok: false
  error: string
}

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<RequestMessage>) => void) | null
  postMessage: (message: OkMessage | ErrMessage) => void
}

// Отдельный .wasm нужен сборке electron-builder (asarUnpack). Алгоритм поднимается из ESM-модуля.
void essentiaWasmUrl

function release(value: VectorFloat | undefined): void {
  value?.delete?.()
}

let engine: Promise<Essentia> | null = null

function wasmEngine(): Promise<Essentia> {
  if (!engine) {
    engine = (async () => {
      if (EssentiaWASM.ready) await EssentiaWASM.ready
      return new Essentia(EssentiaWASM)
    })()
  }
  return engine
}

async function analyze(samples: Float32Array): Promise<Pick<AnalysisResult, 'bpm' | 'key' | 'scale' | 'camelot'>> {
  if (samples.length < 2) throw new Error('Слишком короткий фрагмент')
  const essentia = await wasmEngine()
  const vector = essentia.arrayToVector(samples)
  try {
    const rhythm = essentia.RhythmExtractor2013(vector)
    const tonal = essentia.KeyExtractor(vector)
    const bpm = roundBpm(rhythm.bpm)
    const key = String(tonal.key ?? '').trim()
    const scale = String(tonal.scale ?? '').toLowerCase() === 'minor' ? 'minor' : 'major'
    release(rhythm.ticks)
    release(rhythm.estimates)
    release(rhythm.bpmIntervals)
    if (!bpm || !key) throw new Error('Не удалось определить темп и тональность')
    return { bpm, key, scale, camelot: camelotOf(initialKeyOf(key, scale)) }
  } finally {
    release(vector)
  }
}

let chain = Promise.resolve()

scope.onmessage = (event) => {
  const { id, samples } = event.data
  chain = chain.then(async () => {
    try {
      scope.postMessage({ id, ok: true, result: await analyze(samples) })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось определить темп и тональность'
      scope.postMessage({ id, ok: false, error: message })
    }
  })
}
