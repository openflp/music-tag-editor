import { ANALYSIS_RATE, sliceWindow } from '@shared/analysis'
import { mediaTrackUrl } from '@shared/media'

export async function readAudioBytes(filePath: string): Promise<ArrayBuffer> {
  const response = await fetch(mediaTrackUrl(filePath))
  if (!response.ok) throw new Error('Не удалось прочитать аудио')
  return response.arrayBuffer()
}

export async function monoSlice(bytes: ArrayBuffer): Promise<Float32Array> {
  const probe = new OfflineAudioContext(1, 1, ANALYSIS_RATE)
  const decoded = await probe.decodeAudioData(bytes.slice(0))
  const { startSec, lengthSec } = sliceWindow(decoded.duration)
  if (lengthSec <= 0) throw new Error('Пустой аудиофайл')
  const frames = Math.max(1, Math.round(lengthSec * ANALYSIS_RATE))
  const render = new OfflineAudioContext(1, frames, ANALYSIS_RATE)
  const source = render.createBufferSource()
  source.buffer = decoded
  source.connect(render.destination)
  source.start(0, startSec, lengthSec)
  const mixed = await render.startRendering()
  return new Float32Array(mixed.getChannelData(0))
}
