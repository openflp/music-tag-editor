import { useEffect, useMemo, useState } from 'react'
import { baseName, formatBadge, formatBitrate, formatBytes, formatDuration, formatRate, formatStamp } from '@/entities/track/lib'
import { useEditor, type TrackVm } from '@/features/editor/model/store'
import { displayKey } from '@shared/analysis'
import { camelotOf } from '@shared/key'
import type { Pack } from '@shared/i18n'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Hint } from '@/components/ui/tooltip'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { CheckIcon, CopyIcon, DownloadIcon, FileIcon, FolderIcon, FolderOutIcon, OpenExternalIcon } from '@/shared/ui/icons'
import { useAudioAnalysis } from '@/features/analysis/use-audio-analysis'
import { getPack, menuLocaleOf, useI18n } from '@/shared/i18n'

interface InfoRow {
  label: string
  value: string
  copy: string
  slow?: boolean
}

function uniform(values: string[]): string {
  const filled = values.map((item) => item.trim()).filter(Boolean)
  if (!filled.length) return ''
  return new Set(filled).size === 1 ? filled[0] : getPack().mixedShort
}

const TAG_LABELS: Record<string, keyof Pack> = {
  TIT2: 'fieldTitle',
  TITLE: 'fieldTitle',
  INAM: 'fieldTitle',
  '\u00A9NAM': 'fieldTitle',
  TPE1: 'fieldArtist',
  ARTIST: 'fieldArtist',
  IART: 'fieldArtist',
  '\u00A9ART': 'fieldArtist',
  TALB: 'fieldAlbum',
  ALBUM: 'fieldAlbum',
  '\u00A9ALB': 'fieldAlbum',
  TPE2: 'fieldAlbumArtist',
  ALBUMARTIST: 'fieldAlbumArtist',
  'ALBUM ARTIST': 'fieldAlbumArtist',
  AART: 'fieldAlbumArtist',
  TCON: 'fieldGenre',
  GENRE: 'fieldGenre',
  IGNR: 'fieldGenre',
  '\u00A9GEN': 'fieldGenre',
  TDRC: 'fieldYear',
  TYER: 'fieldYear',
  DATE: 'fieldYear',
  YEAR: 'fieldYear',
  ICRD: 'fieldYear',
  '\u00A9DAY': 'fieldYear',
  TRCK: 'fieldTrack',
  TRACKNUMBER: 'fieldTrack',
  TRACK: 'fieldTrack',
  TRKN: 'fieldTrack',
  TPOS: 'fieldDisc',
  DISCNUMBER: 'fieldDisc',
  DISC: 'fieldDisc',
  DISK: 'fieldDisc',
  COMM: 'comment',
  COMMENT: 'comment',
  ICMT: 'comment',
  DESCRIPTION: 'infoDescription',
  '\u00A9CMT': 'comment',
  USLT: 'infoLyrics',
  LYRICS: 'infoLyrics',
  '\u00A9LYR': 'infoLyrics',
  TCOM: 'infoComposer',
  COMPOSER: 'infoComposer',
  IWRI: 'infoComposer',
  '\u00A9WRT': 'infoComposer',
  TPE3: 'infoConductor',
  CONDUCTOR: 'infoConductor',
  '\u00A9CON': 'infoConductor',
  TPE4: 'infoRemix',
  REMIXEDBY: 'infoRemix',
  REMIXER: 'infoRemix',
  TIT3: 'infoSubtitle',
  SUBTITLE: 'infoSubtitle',
  TXXX: 'infoDescription',
  TDES: 'infoDescription',
  TIT1: 'infoGrouping',
  GROUPING: 'infoGrouping',
  CONTENTGROUP: 'infoGrouping',
  '\u00A9GRP': 'infoGrouping',
  TCOP: 'infoCopyright',
  COPYRIGHT: 'infoCopyright',
  ICOP: 'infoCopyright',
  '\u00A9CPY': 'infoCopyright',
  TPUB: 'infoPublisher',
  PUBLISHER: 'infoPublisher',
  ORGANIZATION: 'infoPublisher',
  LABEL: 'infoPublisher',
  TENC: 'infoEncoder',
  TSSE: 'infoEncoder',
  ENCODER: 'infoEncoder',
  'ENCODED-BY': 'infoEncoder',
  ENCODEDBY: 'infoEncoder',
  'ENCODED BY': 'infoEncoder',
  '\u00A9TOO': 'infoEncoder',
  '\u00A9ENC': 'infoEncoder',
  TKEY: 'infoKey',
  INITIALKEY: 'infoKey',
  TLAN: 'infoLanguage',
  LANGUAGE: 'infoLanguage',
  TMOO: 'infoMood',
  MOOD: 'infoMood',
  TEXT: 'infoLyricist',
  LYRICIST: 'infoLyricist',
  TSOT: 'infoTitleSort',
  TITLESORT: 'infoTitleSort',
  TSOP: 'infoArtistSort',
  ARTISTSORT: 'infoArtistSort',
  TSOA: 'infoAlbumSort',
  ALBUMSORT: 'infoAlbumSort',
  TSO2: 'infoAlbumArtistSort',
  ALBUMARTISTSORT: 'infoAlbumArtistSort',
  TSOC: 'infoComposerSort',
  COMPOSERSORT: 'infoComposerSort',
  TMCL: 'infoPeople',
  TIPL: 'infoPeople',
  REPLAYGAIN_TRACK_GAIN: 'infoReplayTrack',
  REPLAYGAIN_ALBUM_GAIN: 'infoReplayAlbum',
  TCMP: 'infoCompilation',
  COMPILATION: 'infoCompilation',
  CPIL: 'infoCompilation'
}

function channels(track: TrackVm): string {
  const pack = getPack()
  const count = track.tech.channels ?? 0
  if (track.tech.channelMode === 'joint') return `2, ${pack.jointStereo}`
  if (track.tech.channelMode === 'dual') return `2, ${pack.dualChannel}`
  if (count === 1) return `1, ${pack.mono}`
  if (count === 2) return `2, ${pack.stereo}`
  return count ? String(count) : ''
}

function factId(key: string): string {
  return key.startsWith('tag.') ? key.slice(4).replace(/^TXXX:/i, '') : key
}

function factLabel(key: string, pack: Pack): string {
  const id = factId(key)
  const mapped = TAG_LABELS[id.toUpperCase()]
  if (mapped) {
    const value = pack[mapped]
    if (typeof value === 'string') return value
  }
  if (id.toUpperCase() === 'TBPM' || id.toUpperCase() === 'BPM' || id.toUpperCase() === 'TEMPO' || id.toUpperCase() === 'TMPO') return 'BPM'
  if (id.toUpperCase() === 'TSRC' || id.toUpperCase() === 'ISRC') return 'ISRC'
  return id
}

const HIDDEN_TAGS = new Set([
  'COMM',
  'COMMENT',
  'ICMT',
  '\u00A9CMT',
  'USLT',
  'LYRICS',
  '\u00A9LYR',
  'UNSYNCEDLYRICS'
])

const SUMMARY_TAGS = new Set([
  'TBPM',
  'BPM',
  'TEMPO',
  'TMPO',
  'TKEY',
  'INITIALKEY',
  'KEY',
  'INITIAL KEY',
  'TENC',
  'TSSE',
  'ENCODER',
  'ENCODED-BY',
  'ENCODEDBY',
  'ENCODED BY',
  '\u00A9TOO',
  '\u00A9ENC'
])

function tagId(key: string): string {
  return factId(key).toUpperCase()
}

function fromFacts(track: TrackVm, ids: string[]): string {
  const want = new Set(ids)
  for (const fact of track.tech.facts ?? []) {
    if (!want.has(tagId(fact.key))) continue
    const text = fact.value.trim()
    if (text) return text
  }
  return ''
}

function bpmOf(track: TrackVm): string {
  if (track.tech.bpm) return String(track.tech.bpm)
  const raw = fromFacts(track, ['TBPM', 'BPM', 'TEMPO', 'TMPO'])
  const value = Number(raw.replace(',', '.'))
  return Number.isFinite(value) && value > 0 ? String(Math.round(value)) : ''
}

function keyOf(track: TrackVm): string {
  const stored = track.tech.key?.trim()
  const raw = stored || fromFacts(track, ['TKEY', 'INITIALKEY', 'KEY', 'INITIAL KEY'])
  return displayKey(raw)
}

function encoderOf(track: TrackVm): string {
  const stored = track.tech.encoder?.trim()
  if (stored) return stored
  return fromFacts(track, ['TENC', 'TSSE', 'ENCODER', 'ENCODED-BY', 'ENCODEDBY', 'ENCODED BY', '\u00A9TOO', '\u00A9ENC'])
}

function shownFact(key: string, value: string, pack: Pack): string {
  const id = factId(key).toUpperCase()
  if ((id === 'TCMP' || id === 'COMPILATION' || id === 'CPIL') && (value === '1' || value.toLowerCase() === 'true')) return pack.yes
  if ((id === 'USLT' || id === 'LYRICS' || id.includes('LYRIC')) && value.length > 160) return preview(value)
  return value
}

function preview(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

function rowsOf(tracks: TrackVm[], locale: string): InfoRow[] {
  const pack = getPack()
  const one = tracks.length === 1 ? tracks[0] : null
  const cell = (read: (track: TrackVm) => string) => uniform(tracks.map(read))
  const row = (label: string, value: string, copy = value, slow = false): InfoRow => ({ label, value, copy, slow })
  const sameText = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()
  const codec = cell((track) => track.tech.codec ?? '')
  const container = cell((track) => track.tech.container ?? '')
  const always: InfoRow[] = [
    row(pack.infoName, cell((track) => baseName(track.path))),
    one
      ? row(pack.infoPath, one.path)
      : row(pack.infoFiles, String(tracks.length), tracks.map((track) => track.path).join('\n')),
    row(pack.infoSize, cell((track) => (track.tech.size ? formatBytes(track.tech.size) : ''))),
    row(pack.infoCreated, cell((track) => formatStamp(track.tech.createdMs, locale))),
    row(pack.infoModified, cell((track) => formatStamp(track.tech.modifiedMs, locale))),
    row(pack.infoFormat, cell((track) => formatBadge(track.format))),
    row(pack.infoContainer, sameText(container, codec) ? '' : container),
    row(pack.infoCodec, codec),
    row(pack.infoDuration, cell((track) => formatDuration(track.tech.durationMs))),
    row(pack.infoBitrate, cell((track) => formatBitrate(track.tech.bitrate))),
    row(pack.infoRate, cell((track) => formatRate(track.tech.sampleRate))),
    row(pack.infoChannels, cell(channels)),
    row(pack.infoBits, cell((track) => (track.tech.bitsPerSample ? `${track.tech.bitsPerSample} ${pack.bits}` : ''))),
    row(pack.infoLossless, cell((track) => (track.tech.codec || track.format ? (track.tech.lossless ? pack.yes : pack.no) : ''))),
    row(pack.infoTagTypes, cell((track) => track.tech.tagTypes ?? '')),
    row(pack.infoEncoder, cell(encoderOf))
  ]
  const rhythm: InfoRow[] = [
    row('BPM', cell(bpmOf), cell(bpmOf), true),
    row(pack.infoKey, cell(keyOf), cell(keyOf), true),
    row('Camelot', cell((track) => camelotOf(keyOf(track))), cell((track) => camelotOf(keyOf(track))), true)
  ]
  const keys: string[] = []
  for (const track of tracks) {
    for (const fact of track.tech.facts ?? []) {
      if (!fact.key.startsWith('tag.') || !fact.value.trim() || keys.includes(fact.key)) continue
      const id = tagId(fact.key)
      if (HIDDEN_TAGS.has(id) || SUMMARY_TAGS.has(id)) continue
      keys.push(fact.key)
    }
  }
  const tags: InfoRow[] = keys
    .map((key) => {
      const copy = cell((track) => track.tech.facts?.find((fact) => fact.key === key)?.value ?? '')
      const label = factLabel(key, pack)
      return row(label, shownFact(key, copy, pack), copy)
    })
    .filter((item) => item.copy && item.copy !== pack.mixedShort)
  const summary = always.filter((item) => item.label !== pack.infoContainer || item.value)
  const seen = new Set(summary.filter((item) => item.value).map((item) => `${item.label}\n${item.copy}`))
  const extra = tags.filter((item) => {
    const signature = `${item.label}\n${item.copy}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  return [...rhythm, ...summary, ...extra].sort((left, right) => collator.compare(left.label, right.label))
}

function report(items: InfoRow[]): string {
  return items
    .filter((item) => item.copy && item.copy !== getPack().mixedShort)
    .map((item) => `${item.label}: ${item.copy}`)
    .join('\n')
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const { pack } = useI18n()
  const notify = useEditor((state) => state.notify)
  const [copied, setCopied] = useState(false)
  const disabled = !text || text === pack.mixedShort
  return (
    <button
      type="button"
      className={copied ? 'icon-btn copy-swap copied' : 'icon-btn copy-swap'}
      aria-label={copied ? pack.copied : label}
      disabled={disabled}
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true)
            window.setTimeout(() => setCopied(false), 1600)
          })
          .catch(() => notify({ kind: 'err', text: pack.copyFail }))
      }}
    >
      <span className="copy-swap-icon copy">
        <CopyIcon />
      </span>
      <span className="copy-swap-icon check">
        <CheckIcon />
      </span>
    </button>
  )
}

function canCopy(text: string, mixed: string): boolean {
  return Boolean(text) && text !== mixed
}

export function InfoPane({ tracks }: { tracks: TrackVm[] }) {
  const { locale, pack } = useI18n()
  const notify = useEditor((state) => state.notify)
  const reveal = useEditor((state) => state.revealCurrent)
  const open = useEditor((state) => state.openCurrent)
  const loadDetails = useEditor((state) => state.loadDetails)
  // список читается «легко» — полные сведения (facts, encoder, tagTypes) догружаем для выбранных
  const pendingKey = useMemo(
    () => tracks.filter((track) => !track.detailed && !track.error).map((track) => track.path).join('\n'),
    [tracks]
  )
  useEffect(() => {
    if (pendingKey) void loadDetails(pendingKey.split('\n'))
  }, [pendingKey, loadDetails])
  const single = tracks.length === 1
  const analysis = useAudioAnalysis(single ? tracks[0].path : null)
  const [rowIndex, setRowIndex] = useState<number | null>(null)
  const items = useMemo(() => rowsOf(tracks, menuLocaleOf(locale)), [tracks, locale])
  const text = report(items)
  const row = rowIndex === null ? null : items[rowIndex] ?? null
  const rowPending = Boolean(row?.slow && analysis.loading)
  const copyText = (value: string) => {
    void navigator.clipboard.writeText(value).catch(() => notify({ kind: 'err', text: pack.copyFail }))
  }
  const exportInfo = () => {
    const name = `${baseName(tracks[0]?.path || 'info').replace(/\.[^.]+$/, '')}.txt`
    void window.musicTagEditor
      ?.saveText({ text, name })
      .then((saved) => {
        if (saved) notify({ kind: 'ok', text: pack.exported })
      })
      .catch(() => notify({ kind: 'err', text: pack.exportFail }))
  }
  return (
    <div className="info-pane">
      <div className="info-head">
        <span>{pack.tabInfo}</span>
        <div className="info-tools">
          <Hint label={pack.copyAll} align="end">
            <CopyButton text={text} label={pack.copyAll} />
          </Hint>
          <Hint label={pack.export} align="end">
            <button type="button" className="icon-btn" aria-label={pack.export} disabled={!text} onClick={exportInfo}>
              <DownloadIcon />
            </button>
          </Hint>
          <Hint label={pack.revealFile} align="end">
            <button type="button" className="icon-btn" aria-label={pack.revealFile} disabled={!single} onClick={() => void reveal()}>
              <FolderIcon />
            </button>
          </Hint>
          <Hint label={pack.openFile} align="end">
            <button type="button" className="icon-btn" aria-label={pack.openFile} disabled={!single} onClick={() => void open()}>
              <OpenExternalIcon />
            </button>
          </Hint>
        </div>
      </div>
      <ContextMenu onOpenChange={(open) => { if (!open) setRowIndex(null) }}>
        <AxisScroll className="info-scroll" watch={`${tracks.length}:${items.length}`} shade>
          {(ref) => (
            <ContextMenuTrigger asChild>
              <div
                ref={ref}
                className="prop-table"
                onContextMenu={(event) => {
                  if (!(event.target as HTMLElement).closest('.prop-row')) setRowIndex(null)
                }}
              >
                {items.map((item, index) => {
                  const pending = Boolean(item.slow && analysis.loading)
                  const ready = !pending && canCopy(item.copy, pack.mixedShort)
                  return (
                    <div
                      className={rowIndex === index ? 'prop-row active' : 'prop-row'}
                      key={`${item.label}:${index}`}
                      onContextMenu={() => setRowIndex(index)}
                    >
                      <span>{item.label}</span>
                      <b>
                        {pending ? <span className="info-spinner" role="status" aria-label={pack.reading} /> : item.value || '—'}
                        {ready ? <CopyButton text={item.copy} label={pack.copyItem(item.label)} /> : null}
                      </b>
                    </div>
                  )
                })}
              </div>
            </ContextMenuTrigger>
          )}
        </AxisScroll>
        <ContextMenuContent>
          <ContextMenuItem disabled={!row || rowPending || !canCopy(row.copy, pack.mixedShort)} onSelect={() => row && copyText(row.copy)}>
            <CopyIcon />
            {pack.copyValue}
          </ContextMenuItem>
          <ContextMenuItem disabled={!row || rowPending || !canCopy(row.copy, pack.mixedShort)} onSelect={() => row && copyText(`${row.label}: ${row.copy}`)}>
            <CopyIcon />
            {pack.copyLine}
          </ContextMenuItem>
          <ContextMenuItem disabled={!text} onSelect={() => copyText(text)}>
            <CopyIcon />
            {pack.copyAll}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!text} onSelect={exportInfo}>
            <DownloadIcon />
            {pack.export}
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuItem disabled={!single} onSelect={() => void reveal()}>
            <FolderOutIcon />
            {pack.revealFile}
          </ContextMenuItem>
          <ContextMenuItem disabled={!single} onSelect={() => void open()}>
            <FileIcon />
            {pack.openFile}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}
