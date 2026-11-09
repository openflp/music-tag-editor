import { readdir, realpath, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { MAX_FILES, emptyTags, emptyTech, type TrackSnapshot } from '@shared/types'
import { readTrack } from './tag-io'
import { isAudioPath } from './validate'

const MAX_DEPTH = 6
const READ_BATCH = 8

function breathe(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve))
}

async function walk(dir: string, depth: number, push: (filePath: string) => Promise<void>, limit: () => boolean): Promise<void> {
  if (depth > MAX_DEPTH || limit()) return
  const entries = await readdir(dir, { withFileTypes: true })
  const files: string[] = []
  const dirs: string[] = []
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) dirs.push(full)
    else if (entry.isFile() && isAudioPath(full)) files.push(full)
  }
  for (const filePath of files) {
    if (limit()) return
    await push(filePath)
  }
  for (const nested of dirs) {
    if (limit()) return
    await walk(nested, depth + 1, push, limit)
  }
}

export async function readTracks(inputs: string[], onBatch?: (tracks: TrackSnapshot[]) => void): Promise<TrackSnapshot[]> {
  const snapshots: TrackSnapshot[] = []
  const seen = new Set<string>()
  let pending: TrackSnapshot[] = []

  const flush = async () => {
    if (!pending.length) return
    const batch = pending
    pending = []
    onBatch?.(batch)
    await breathe()
  }

  const pushFile = async (filePath: string) => {
    const key = process.platform === 'linux' ? filePath : filePath.toLowerCase()
    if (seen.has(key) || snapshots.length >= MAX_FILES) return
    seen.add(key)
    const snapshot = readTrack(filePath)
    snapshots.push(snapshot)
    pending.push(snapshot)
    if (snapshots.length <= READ_BATCH || pending.length >= READ_BATCH) await flush()
  }

  for (const input of inputs) {
    if (snapshots.length >= MAX_FILES) break
    try {
      const resolved = await realpath(input)
      const info = await stat(resolved)
      if (info.isDirectory()) {
        await walk(resolved, 0, pushFile, () => snapshots.length >= MAX_FILES)
        continue
      }
      if (!info.isFile()) continue
      if (!isAudioPath(resolved)) {
        const key = process.platform === 'linux' ? resolved : resolved.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        const snapshot = {
          path: resolved,
          format: '',
          error: 'Формат не поддерживается',
          tags: emptyTags(),
          cover: null,
          tech: emptyTech()
        }
        snapshots.push(snapshot)
        pending.push(snapshot)
        continue
      }
      await pushFile(resolved)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось прочитать файл'
      const snapshot = {
        path: input,
        format: '',
        error: message,
        tags: emptyTags(),
        cover: null,
        tech: emptyTech()
      }
      snapshots.push(snapshot)
      pending.push(snapshot)
    }
  }

  await flush()
  return snapshots
}
