import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { extname } from 'node:path'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { MEDIA_HOST, MEDIA_SCHEME, parseByteRange } from '@shared/media'
import { assertAudioFilePath } from '../services/validate'

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.wave': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.aif': 'audio/aiff',
  '.aiff': 'audio/aiff',
  '.wma': 'audio/x-ms-wma'
}

function audioMime(filePath: string): string {
  return AUDIO_MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: MEDIA_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true
      }
    }
  ])
}

export function installMediaProtocol(): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    try {
      const url = new URL(request.url)
      if (url.hostname !== MEDIA_HOST) return new Response(null, { status: 404 })
      const filePath = assertAudioFilePath(url.searchParams.get('p'))
      const info = await stat(filePath)
      if (!info.isFile()) return new Response(null, { status: 404 })
      const size = info.size
      const mime = audioMime(filePath)
      const range = parseByteRange(request.headers.get('range'), size)
      if (range === 'invalid') {
        return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
      }
      const start = range?.start ?? 0
      const end = range?.end ?? Math.max(0, size - 1)
      const length = size === 0 ? 0 : end - start + 1
      const headers = new Headers({
        'Accept-Ranges': 'bytes',
        'Content-Type': mime,
        'Content-Length': String(length),
        'Cache-Control': 'no-store'
      })
      if (range) headers.set('Content-Range', `bytes ${start}-${end}/${size}`)
      if (request.method === 'HEAD' || length === 0) {
        return new Response(null, { status: range ? 206 : 200, headers })
      }
      const node = createReadStream(filePath, { start, end })
      const body = Readable.toWeb(node) as ReadableStream
      return new Response(body, { status: range ? 206 : 200, headers })
    } catch {
      return new Response(null, { status: 404 })
    }
  })
}
