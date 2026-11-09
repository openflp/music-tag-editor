import { parentPort } from 'node:worker_threads'
import type { WriteJob, WriteResult } from '@shared/types'
import { orderWrites } from '@shared/filename'
import { writeTrack } from '../services/tag-io'

interface UtilityPort {
  on(event: 'message', listener: (event: { data: unknown }) => void): void
  postMessage(message: unknown): void
}

const utility = (process as NodeJS.Process & { parentPort?: UtilityPort }).parentPort

function emit(message: unknown): void {
  if (utility) {
    utility.postMessage(message)
    return
  }
  parentPort?.postMessage(message)
}

async function run(jobs: WriteJob[]): Promise<void> {
  const planned = orderWrites(jobs, process.platform)
  const sequence = [
    ...planned.ready.map((job) => ({ job, blocked: false })),
    ...planned.blocked.map((job) => ({ job, blocked: true }))
  ]
  const results: WriteResult[] = []
  for (let index = 0; index < sequence.length; index += 1) {
    const item = sequence[index]
    emit({ type: 'progress', current: index + 1, total: sequence.length, path: item.job.path })
    results.push(
      item.blocked
        ? { path: item.job.path, ok: false, code: 'invalid', error: 'Имя совпадает с другим файлом' }
        : await writeTrack(item.job)
    )
  }
  emit({ type: 'done', results })
}

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data?: unknown }).data
    if (inner && typeof inner === 'object' && 'jobs' in inner) return inner
  }
  return payload
}

function accept(payload: unknown): void {
  const data = unwrap(payload) as { jobs?: WriteJob[] } | null
  const jobs = data?.jobs
  if (!Array.isArray(jobs)) {
    emit({ type: 'done', results: [] })
    return
  }
  void run(jobs)
}

if (utility) {
  utility.on('message', (event) => accept(event.data))
} else {
  parentPort?.on('message', (data) => accept(data))
}
