interface VectorFloat {
  delete?: () => void
}

interface RhythmVectors {
  bpm: number
  ticks?: VectorFloat
  estimates?: VectorFloat
  bpmIntervals?: VectorFloat
}

interface KeyVectors {
  key: string
  scale: string
}

declare module 'essentia.js/dist/essentia.js-core.es.js' {
  export default class Essentia {
    constructor(wasm: unknown, isDebug?: boolean)
    arrayToVector(input: Float32Array): VectorFloat
    RhythmExtractor2013(signal: VectorFloat, maxTempo?: number, method?: string, minTempo?: number): RhythmVectors
    KeyExtractor(audio: VectorFloat): KeyVectors
    shutdown(): void
  }
}

declare module 'essentia.js/dist/essentia-wasm.es.js' {
  export const EssentiaWASM: { ready?: Promise<unknown> }
}

declare module 'essentia.js/dist/essentia-wasm.web.wasm?url' {
  const url: string
  export default url
}
