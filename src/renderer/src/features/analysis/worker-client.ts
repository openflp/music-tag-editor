import type { AnalysisResult } from '@shared/analysis'

type WorkerResult = Pick<AnalysisResult, 'bpm' | 'key' | 'scale' | 'camelot'>

interface OkMessage {
  id: number
  ok: true
  result: WorkerResult
}

interface ErrMessage {
  id: number
  ok: false
  error: string
}

let worker: Worker | null = null
let seq = 0

function client(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' })
  }
  return worker
}

export function analyzeSamples(samples: Float32Array): Promise<WorkerResult> {
  const id = ++seq
  const current = client()
  return new Promise((resolve, reject) => {
    const onMessage = (event: MessageEvent<OkMessage | ErrMessage>) => {
      if (event.data.id !== id) return
      current.removeEventListener('message', onMessage)
      if (event.data.ok) resolve(event.data.result)
      else reject(new Error(event.data.error))
    }
    current.addEventListener('message', onMessage)
    current.postMessage({ id, samples }, [samples.buffer])
  })
}
