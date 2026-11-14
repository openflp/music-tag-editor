import { createRequire } from 'node:module'
import type { File as TagFile } from 'node-taglib-sharp'
import type { TrackFact } from '@shared/types'

const require = createRequire(import.meta.url)
const { TagTypes } = require('node-taglib-sharp') as typeof import('node-taglib-sharp')

const MAX_VALUE = 8000
const MAX_FACTS = 300
const PICTURE_FLAGS = new Set([13, 14, 27])

export interface MediaDetails {
  encoder: string
  container: string
  lossless: boolean
  tagTypes: string
  channelMode: '' | 'joint' | 'dual'
  facts: TrackFact[]
}

interface Box {
  boxType?: { toByteArray?: () => ArrayLike<number>; toString: () => string }
  children?: Box[]
  text?: string
  flags?: number
}

interface Id3Frame {
  frameClassType?: number
  frameId?: { toString: () => string }
  text?: string | string[]
  description?: string
  lyrics?: string
  url?: string
  toString?: () => string
}

function clean(value: string): string {
  return value.replace(/\u0000/g, '').replace(/\r\n/g, '\n').trim()
}

function lines(value: unknown): string {
  if (typeof value === 'string') return clean(value)
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string').map(clean).filter(Boolean).join('\n')
  return ''
}

function addFact(facts: TrackFact[], key: string, value: string, replace = false): void {
  const text = clean(value)
  if (!key || !text) return
  const clipped = text.length > MAX_VALUE ? `${text.slice(0, MAX_VALUE)}…` : text
  const found = facts.find((item) => item.key === key)
  if (found) {
    if (replace || found.value === clipped || found.value.split('\n').includes(clipped)) return
    if (`${found.value}\n${clipped}`.length > MAX_VALUE) return
    found.value = `${found.value}\n${clipped}`
    return
  }
  if (facts.length >= MAX_FACTS) return
  facts.push({ key, value: clipped })
}

function fourcc(box: Box): string {
  const bytes = box.boxType?.toByteArray?.()
  if (bytes && bytes.length >= 4) return String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3])
  return box.boxType?.toString() ?? ''
}

function dataText(box: Box): string {
  if (box.flags === 21) {
    const tempo = (box as { data?: { toUshort?: () => number } }).data?.toUshort?.()
    return tempo ? String(tempo) : ''
  }
  if (box.flags != null && (box.flags === 0 || PICTURE_FLAGS.has(box.flags))) return ''
  const text = clean(box.text ?? '')
  if (!text || /[\u0001-\u0008]/.test(text)) return ''
  return text
}

function readApple(tag: object, facts: TrackFact[]): void {
  const ilst = (tag as { _ilstBox?: Box })._ilstBox
  for (const child of ilst?.children ?? []) {
    const id = fourcc(child)
    if (!id || id === 'covr') continue
    if (id === '----') {
      const name = child.children?.find((item) => fourcc(item) === 'name')
      const label = clean(name?.text ?? '') || '----'
      const values = (child.children ?? []).filter((item) => fourcc(item) === 'data').map(dataText).filter(Boolean)
      addFact(facts, `tag.${label}`, values.join('\n'))
      continue
    }
    const values = (child.children ?? []).filter((item) => fourcc(item) === 'data').map(dataText).filter(Boolean)
    addFact(facts, `tag.${id}`, values.join('\n') || dataText(child))
  }
}

function readId3(tag: object, facts: TrackFact[]): void {
  const frames = (tag as { frames?: Id3Frame[] }).frames ?? []
  for (const frame of frames) {
    const kind = frame.frameClassType
    if (kind === 0 || kind === 6 || kind === 12) continue
    const id = frame.frameId?.toString?.() || ''
    if (!id) continue
    if (kind === 15 || kind === 16) {
      const text = lines(frame.text) || clean(frame.url ?? '')
      addFact(facts, `tag.${clean(frame.description ?? '') || id}`, text)
      continue
    }
    if (kind === 1) {
      addFact(facts, `tag.${clean(frame.description ?? '') || 'COMM'}`, lines(frame.text))
      continue
    }
    if (kind === 13) {
      addFact(facts, 'tag.USLT', clean(frame.lyrics ?? '') || lines(frame.text))
      continue
    }
    const text = lines(frame.text) || clean(frame.lyrics ?? '') || clean(frame.url ?? '')
    if (text) {
      addFact(facts, `tag.${id}`, text)
      continue
    }
    const fallback = clean(frame.toString?.() ?? '')
    if (fallback && fallback !== id) addFact(facts, `tag.${id}`, fallback)
  }
}

function readXiph(tag: object, facts: TrackFact[]): string {
  const xiph = tag as { fieldNames?: string[]; getField?: (key: string) => string[]; vendorId?: string }
  if (typeof xiph.getField !== 'function') return ''
  for (const name of xiph.fieldNames ?? []) {
    if (/picture|coverart/i.test(name)) continue
    addFact(facts, `tag.${name}`, lines(xiph.getField(name)))
  }
  return clean(xiph.vendorId ?? '')
}

function readApe(tag: object, facts: TrackFact[]): void {
  const items = (tag as { items?: Array<{ key?: string; type?: number; text?: string[] }> }).items ?? []
  for (const item of items) {
    if (item.type === 1 || !item.key || /cover/i.test(item.key)) continue
    addFact(facts, `tag.${item.key}`, lines(item.text))
  }
}

function readRiff(tag: object, facts: TrackFact[]): void {
  const riff = tag as {
    list?: { load?: () => void; _values?: { keys?: () => Iterable<string> } }
    getValuesAsStrings?: (id: string) => string[]
  }
  try {
    riff.list?.load?.()
  } catch {
    return
  }
  const keys = riff.list?._values?.keys?.()
  if (!keys || typeof riff.getValuesAsStrings !== 'function') return
  for (const id of keys) addFact(facts, `tag.${id}`, lines(riff.getValuesAsStrings(id)))
}

function tagOf(file: TagFile, type: number): object | null {
  try {
    const tag = file.getTag(type, false)
    return tag ?? null
  } catch {
    return null
  }
}

function gainPair(gain: number, peak: number): string {
  const parts: string[] = []
  if (gain) parts.push(`${gain > 0 ? '+' : ''}${gain.toFixed(2)} dB`)
  if (peak) parts.push(peak.toFixed(3))
  return parts.join(' · ')
}

function pair(current: number, total: number): string {
  if (!current && !total) return ''
  if (current && total) return `${current}/${total}`
  return String(current || total)
}

function supplement(tag: TagFile['tag'], facts: TrackFact[]): void {
  const dated = tag.dateTagged
  const stamped = dated instanceof Date && !Number.isNaN(dated.getTime()) ? dated.toISOString() : ''
  const pairs: Array<[string, string]> = [
    ['TIT2', tag.title ?? ''],
    ['TPE1', (tag.performers ?? []).filter(Boolean).join('\n')],
    ['TALB', tag.album ?? ''],
    ['TPE2', (tag.albumArtists ?? []).filter(Boolean).join('\n')],
    ['TCON', (tag.genres ?? []).filter(Boolean).join('\n')],
    ['TDRC', tag.year ? String(tag.year) : ''],
    ['TRCK', pair(tag.track, tag.trackCount)],
    ['TPOS', pair(tag.disc, tag.discCount)],
    ['TCOM', (tag.composers ?? []).filter(Boolean).join('\n')],
    ['TPE3', tag.conductor ?? ''],
    ['TPE4', tag.remixedBy ?? ''],
    ['TIT3', tag.subtitle ?? ''],
    ['TIT1', tag.grouping ?? ''],
    ['TCOP', tag.copyright ?? ''],
    ['TPUB', tag.publisher ?? ''],
    ['TSRC', tag.isrc ?? ''],
    ['TBPM', tag.beatsPerMinute ? String(tag.beatsPerMinute) : ''],
    ['TKEY', tag.initialKey ?? ''],
    ['TSOT', tag.titleSort ?? ''],
    ['TSOA', tag.albumSort ?? ''],
    ['TSOP', (tag.performersSort ?? []).filter(Boolean).join('\n')],
    ['TSO2', (tag.albumArtistsSort ?? []).filter(Boolean).join('\n')],
    ['TSOC', (tag.composersSort ?? []).filter(Boolean).join('\n')],
    ['TDES', tag.description ?? ''],
    ['TMCL', (tag.performersRole ?? []).filter(Boolean).join('\n')],
    ['TXXX:MusicBrainz Track Id', tag.musicBrainzTrackId ?? ''],
    ['TXXX:MusicBrainz Artist Id', tag.musicBrainzArtistId ?? ''],
    ['TXXX:MusicBrainz Album Id', tag.musicBrainzReleaseId ?? ''],
    ['TXXX:MusicBrainz Album Artist Id', tag.musicBrainzReleaseArtistId ?? ''],
    ['TXXX:MusicBrainz Release Group Id', tag.musicBrainzReleaseGroupId ?? ''],
    ['TXXX:MusicBrainz Disc Id', tag.musicBrainzDiscId ?? ''],
    ['TXXX:MusicBrainz Album Status', tag.musicBrainzReleaseStatus ?? ''],
    ['TXXX:MusicBrainz Album Type', tag.musicBrainzReleaseType ?? ''],
    ['TXXX:MusicBrainz Album Release Country', tag.musicBrainzReleaseCountry ?? ''],
    ['TXXX:MusicIP PUID', tag.musicIpId ?? ''],
    ['TXXX:ASIN', tag.amazonId ?? ''],
    ['TCMP', tag.isCompilation ? '1' : ''],
    ['TDTG', stamped],
    ['REPLAYGAIN_TRACK_GAIN', gainPair(tag.replayGainTrackGain, tag.replayGainTrackPeak)],
    ['REPLAYGAIN_ALBUM_GAIN', gainPair(tag.replayGainAlbumGain, tag.replayGainAlbumPeak)]
  ]
  for (const [key, value] of pairs) {
    if (facts.some((item) => item.key === `tag.${key}`)) continue
    addFact(facts, `tag.${key}`, value)
  }
}

function encoderFrom(facts: TrackFact[], vendor: string): string {
  const want = new Set(['TENC', 'TSSE', 'ENCODER', 'ENCODED-BY', 'ENCODEDBY', 'ENCODED BY', '\u00a9too', '\u00a9enc'])
  const parts: string[] = []
  const push = (value: string) => {
    const text = clean(value)
    if (!text || parts.includes(text)) return
    parts.push(text)
  }
  if (vendor) push(vendor)
  for (const fact of facts) {
    const id = fact.key.slice(4)
    if (want.has(id) || want.has(id.toLowerCase())) push(fact.value)
  }
  return parts.join(' · ')
}

function tagTypesOf(file: TagFile, id3: object | null): string {
  const flags = file.tagTypesOnDisk || file.tag?.tagTypes || 0
  const names: Array<[number, string]> = [
    [TagTypes.Xiph, 'Vorbis'],
    [TagTypes.Id3v1, 'ID3v1'],
    [TagTypes.Id3v2, 'ID3v2'],
    [TagTypes.Ape, 'APEv2'],
    [TagTypes.Apple, 'MP4'],
    [TagTypes.Asf, 'ASF'],
    [TagTypes.RiffInfo, 'RIFF'],
    [TagTypes.Matroska, 'Matroska']
  ]
  const found = names.filter(([bit]) => (flags & bit) !== 0).map(([, name]) => name)
  const version = (id3 as { version?: number } | null)?.version
  if (version && found.includes('ID3v2')) found[found.indexOf('ID3v2')] = `ID3v2.${version}`
  return found.join(', ')
}

function channelModeOf(properties: TagFile['properties']): '' | 'joint' | 'dual' {
  for (const codec of properties.codecs ?? []) {
    const mode = (codec as { channelMode?: number } | undefined)?.channelMode
    if (mode === 1) return 'joint'
    if (mode === 2) return 'dual'
  }
  return ''
}

export function describeMedia(file: TagFile): MediaDetails {
  const facts: TrackFact[] = []
  const id3 = tagOf(file, TagTypes.Id3v2)
  const xiph = tagOf(file, TagTypes.Xiph)
  const ape = tagOf(file, TagTypes.Ape)
  const apple = tagOf(file, TagTypes.Apple)
  const riff = tagOf(file, TagTypes.RiffInfo)
  if (id3) readId3(id3, facts)
  const vendor = xiph ? readXiph(xiph, facts) : ''
  if (ape) readApe(ape, facts)
  if (apple) readApple(apple, facts)
  if (riff) readRiff(riff, facts)
  supplement(file.tag, facts)
  const container = (file.properties.description ?? '').trim()
  return {
    encoder: encoderFrom(facts, vendor),
    container,
    lossless: (file.properties.mediaTypes & 16) !== 0,
    tagTypes: tagTypesOf(file, id3),
    channelMode: channelModeOf(file.properties),
    facts
  }
}
