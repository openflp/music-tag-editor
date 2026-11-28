import { net } from 'electron'
import { RELEASES_API, TAGS_API, isReleaseApiUrl, parseReleaseList, releaseResponse, type ReleaseInfo } from '@shared/update'

const HEADERS = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'MusicTagEditor'
}

const FAIL = 'Не удалось проверить обновления'

async function readJson(url: string): Promise<unknown> {
  if (!isReleaseApiUrl(url)) throw new Error(FAIL)
  const response = await net.fetch(url, { headers: HEADERS, redirect: 'error', signal: AbortSignal.timeout(12000) })
  const gate = releaseResponse(response.status, response.url)
  if (gate === 'empty') return []
  if (gate === 'reject') throw new Error(FAIL)
  return response.json() as Promise<unknown>
}

export async function fetchVersions(): Promise<ReleaseInfo[]> {
  const releases = parseReleaseList(await readJson(RELEASES_API))
  if (releases.length) return releases
  return parseReleaseList(await readJson(TAGS_API))
}
