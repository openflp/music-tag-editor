import { parseFile } from 'music-metadata'
import type { StoredRhythm } from '@shared/analysis'
import { roundBpm } from '@shared/analysis'

export async function readStoredRhythm(filePath: string): Promise<StoredRhythm> {
  try {
    const meta = await parseFile(filePath, { duration: false, skipCovers: true })
    const bpm = typeof meta.common.bpm === 'number' ? roundBpm(meta.common.bpm) : 0
    return {
      bpm: bpm > 0 ? bpm : null,
      initialKey: (meta.common.key ?? '').trim()
    }
  } catch (error) {
    console.error('Rhythm tags', error)
    return { bpm: null, initialKey: '' }
  }
}
