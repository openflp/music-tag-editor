import { parentPort } from 'node:worker_threads'
import type { WriteJob, WriteResult } from '@shared/types'
import { orderWrites } from '@shared/filename'
import { writeTrack, readTrack, readCoverOnly } from '../services/tag-io'
import { readTracks } from '../services/library'

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

// Чтение тегов — в этом же процессе, что и запись: синхронный taglib не блокирует main/окно.
async function runRead(inputs: string[]): Promise<void> {
  try {
    await readTracks(inputs, (tracks) => emit({ type: 'batch', tracks }), { lite: true })
    emit({ type: 'done' })
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось прочитать файлы' })
  }
}

function runDetails(paths: string[]): void {
  try {
    const step = 24
    for (let index = 0; index < paths.length; index += step) {
      emit({ type: 'batch', tracks: paths.slice(index, index + step).map((filePath) => readTrack(filePath, false, 'none')) })
    }
    emit({ type: 'done' })
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось прочитать файлы' })
  }
}

function runCovers(paths: string[]): void {
  try {
    const step = 6
    for (let index = 0; index < paths.length; index += step) {
      emit({ type: 'covers', items: paths.slice(index, index + step).map((path) => ({ path, cover: readCoverOnly(path) })) })
    }
    emit({ type: 'done' })
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Не удалось прочитать обложки' })
  }
}

function unwrap(payload: unknown): unknown {
  if (payload && typeof payload === 'object' && 'data' in payload) {
    const inner = (payload as { data?: unknown }).data
    if (inner && typeof inner === 'object' && ('jobs' in inner || 'kind' in inner)) return inner
  }
  return payload
}

function accept(payload: unknown): void {
  const data = unwrap(payload) as { jobs?: WriteJob[]; kind?: string; inputs?: unknown; paths?: unknown } | null
  if (data?.kind === 'read' && Array.isArray(data.inputs)) {
    void runRead(data.inputs.filter((item): item is string => typeof item === 'string'))
    return
  }
  if (data?.kind === 'details' && Array.isArray(data.paths)) {
    runDetails(data.paths.filter((item): item is string => typeof item === 'string'))
    return
  }
  if (data?.kind === 'covers' && Array.isArray(data.paths)) {
    runCovers(data.paths.filter((item): item is string => typeof item === 'string'))
    return
  }
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
