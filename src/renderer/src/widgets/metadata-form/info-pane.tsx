import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { baseName, formatBadge, formatBitrate, formatBytes, formatDuration, formatRate, formatStamp } from '@/entities/track/lib'
import { useEditor, type TrackVm } from '@/features/editor/model/store'
import { displayKey } from '@shared/analysis'
import { camelotOf } from '@shared/key'
import type { Pack } from '@shared/i18n'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Hint } from '@/components/ui/tooltip'
import { IconGripVertical } from '@tabler/icons-react'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { Collapse } from '@/shared/ui/collapse'
import { CheckIcon, ChevronRightIcon, CopyIcon, DownloadIcon, FileIcon, FolderOutIcon, MoreIcon } from '@/shared/ui/icons'
import { useAudioAnalysis } from '@/features/analysis/use-audio-analysis'
import { getPack, menuLocaleOf, useI18n } from '@/shared/i18n'

const INFO_SECTIONS = ['file', 'audio', 'rhythm', 'tags'] as const

type InfoSectionId = (typeof INFO_SECTIONS)[number]

interface InfoRow {
  id: string // уникален в пределах таблицы (label может повторяться: TIT2 и TITLE и т. п.)
  section: InfoSectionId
  label: string
  value: string
  copy: string
  slow?: boolean
}

// TODO: перенести в языковые паки (@shared/i18n): infoExpandSection, infoCollapseSection, infoExpandAll, infoCollapseAll
const SECTION_TEXT = {
  ru: { expand: 'Развернуть пункт', collapse: 'Свернуть пункт', expandAll: 'Развернуть все пункты', collapseAll: 'Свернуть все пункты' },
  en: { expand: 'Expand section', collapse: 'Collapse section', expandAll: 'Expand all sections', collapseAll: 'Collapse all sections' }
} as const

const ORDER_KEY = 'mte.info.order'
const CLOSED_KEY = 'mte.info.closed'
// Свой MIME, а не text/plain: иначе при отпускании над полем ввода туда вставился бы id раздела,
// а App.dropInfo по пустому/чужому набору types не примет перетаскивание за файловое.
const DRAG_MIME = 'application/x-mte-info-section'

function store(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage can be unavailable */
  }
}

function isSection(value: unknown): value is InfoSectionId {
  return value === 'file' || value === 'audio' || value === 'rhythm' || value === 'tags'
}

function readOrder(): InfoSectionId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(ORDER_KEY) || '')
    if (!Array.isArray(raw)) return [...INFO_SECTIONS]
    const known = raw.filter(isSection)
    return [...known, ...INFO_SECTIONS.filter((id) => !known.includes(id))]
  } catch {
    return [...INFO_SECTIONS]
  }
}

function readClosed(): InfoSectionId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CLOSED_KEY) || '[]')
    return Array.isArray(raw) ? raw.filter(isSection) : []
  } catch {
    return []
  }
}

function moveSection(list: InfoSectionId[], from: InfoSectionId, to: InfoSectionId): InfoSectionId[] {
  const fromIndex = list.indexOf(from)
  const toIndex = list.indexOf(to)
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list
  const next = list.slice()
  next.splice(fromIndex, 1)
  next.splice(toIndex, 0, from)
  return next
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
  const row = (section: InfoSectionId, label: string, value: string, copy = value, slow = false): InfoRow => ({ id: '', section, label, value, copy, slow })
  const sameText = (left: string, right: string) => left.trim().toLowerCase() === right.trim().toLowerCase()
  const codec = cell((track) => track.tech.codec ?? '')
  const container = cell((track) => track.tech.container ?? '')
  const file: InfoRow[] = [
    row('file', pack.infoName, cell((track) => baseName(track.path))),
    one
      ? row('file', pack.infoPath, one.path)
      : row('file', pack.infoFiles, String(tracks.length), tracks.map((track) => track.path).join('\n')),
    row('file', pack.infoSize, cell((track) => (track.tech.size ? formatBytes(track.tech.size) : ''))),
    row('file', pack.infoCreated, cell((track) => formatStamp(track.tech.createdMs, locale))),
    row('file', pack.infoModified, cell((track) => formatStamp(track.tech.modifiedMs, locale)))
  ]
  const audio: InfoRow[] = [
    row('audio', pack.infoFormat, cell((track) => formatBadge(track.format))),
    row('audio', pack.infoContainer, sameText(container, codec) ? '' : container),
    row('audio', pack.infoCodec, codec),
    row('audio', pack.infoDuration, cell((track) => formatDuration(track.tech.durationMs))),
    row('audio', pack.infoBitrate, cell((track) => formatBitrate(track.tech.bitrate))),
    row('audio', pack.infoRate, cell((track) => formatRate(track.tech.sampleRate))),
    row('audio', pack.infoChannels, cell(channels)),
    row('audio', pack.infoBits, cell((track) => (track.tech.bitsPerSample ? `${track.tech.bitsPerSample} ${pack.bits}` : ''))),
    row('audio', pack.infoLossless, cell((track) => (track.tech.codec || track.format ? (track.tech.lossless ? pack.yes : pack.no) : '')))
  ].filter((item) => item.label !== pack.infoContainer || item.value)
  const rhythm: InfoRow[] = [
    row('rhythm', 'BPM', cell(bpmOf), cell(bpmOf), true),
    row('rhythm', pack.infoKey, cell(keyOf), cell(keyOf), true),
    row('rhythm', 'Camelot', cell((track) => camelotOf(keyOf(track))), cell((track) => camelotOf(keyOf(track))), true)
  ]
  const tagHead: InfoRow[] = [
    row('tags', pack.infoTagTypes, cell((track) => track.tech.tagTypes ?? '')),
    row('tags', pack.infoEncoder, cell(encoderOf))
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
      return row('tags', label, shownFact(key, copy, pack), copy)
    })
    .filter((item) => item.copy && item.copy !== pack.mixedShort)
  const summary = [...file, ...audio, ...rhythm, ...tagHead]
  const seen = new Set(summary.filter((item) => item.value).map((item) => `${item.label}\n${item.copy}`))
  const extra = tags.filter((item) => {
    const signature = `${item.label}\n${item.copy}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true })
  extra.sort((left, right) => collator.compare(left.label, right.label))
  const all = [...file, ...audio, ...rhythm, ...tagHead, ...extra]
  const seenIds = new Map<string, number>()
  return all.map((item) => {
    const base = `${item.section}:${item.label}`
    const n = seenIds.get(base) ?? 0
    seenIds.set(base, n + 1)
    return { ...item, id: n ? `${base}#${n}` : base }
  })
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
  const [rowKey, setRowKey] = useState<string | null>(null)
  // раздел, на котором открыли контекстное меню (null — клик мимо разделов)
  const [ctxSection, setCtxSection] = useState<InfoSectionId | null>(null)
  const [order, setOrder] = useState(readOrder)
  const [closed, setClosed] = useState(readClosed)
  const [dragId, setDragId] = useState<InfoSectionId | null>(null)
  const [overId, setOverId] = useState<InfoSectionId | null>(null)
  // блоки с анимацией сообщают, что высота устоялась: прокрутка и тени пересчитываются
  const [settle, setSettle] = useState(0)
  const bumpSettle = useCallback(() => setSettle((count) => count + 1), [])
  const items = useMemo(() => rowsOf(tracks, menuLocaleOf(locale)), [tracks, locale])
  const sections = useMemo(() => {
    const grouped = new Map<InfoSectionId, InfoRow[]>(INFO_SECTIONS.map((id) => [id, []]))
    for (const item of items) grouped.get(item.section)?.push(item)
    return order.map((id) => ({ id, rows: grouped.get(id) ?? [] }))
  }, [items, order])
  const text = report(sections.flatMap((section) => section.rows))
  const row = rowKey === null ? null : items.find((item) => item.id === rowKey) ?? null
  const titles: Record<InfoSectionId, string> = {
    file: pack.infoSectionFile,
    audio: pack.infoSectionAudio,
    rhythm: pack.infoSectionRhythm,
    tags: pack.infoSectionTags
  }
  useEffect(() => {
    store(ORDER_KEY, order)
  }, [order])
  useEffect(() => {
    store(CLOSED_KEY, closed)
  }, [closed])
  // после перестановки с клавиатуры DOM-узел раздела переезжает и теряет фокус: возвращаем его на ручку
  const refocus = useRef<InfoSectionId | null>(null)
  useLayoutEffect(() => {
    const id = refocus.current
    if (!id) return
    refocus.current = null
    document.querySelector<HTMLElement>(`[data-info-grip="${id}"]`)?.focus()
  }, [order])
  const place = (from: InfoSectionId, to: InfoSectionId) => {
    setOrder((current) => moveSection(current, from, to))
  }
  const toggle = (id: InfoSectionId) => {
    setClosed((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]))
  }
  const label = SECTION_TEXT[String(menuLocaleOf(locale)).toLowerCase().startsWith('en') ? 'en' : 'ru']
  const ctxOpen = ctxSection !== null && !closed.includes(ctxSection)
  const expandAll = () => setClosed([])
  const collapseAll = () => setClosed([...INFO_SECTIONS])
  const rowPending = Boolean(row?.slow && analysis.loading)
  const bpmRowPicked = single && row?.id === 'rhythm:BPM'
  const copyText = (value: string) => {
    void navigator.clipboard.writeText(value).catch(() => notify({ kind: 'err', text: pack.copyFail }))
  }
  const copyAll = () => {
    void navigator.clipboard
      .writeText(text)
      .then(() => notify({ kind: 'ok', text: pack.copied }))
      .catch(() => notify({ kind: 'err', text: pack.copyFail }))
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
          <DropdownMenu>
            <Hint label={pack.menuMore} align="end">
              <DropdownMenuTrigger asChild>
                <button type="button" className="icon-btn" aria-label={pack.menuMore}>
                  <MoreIcon />
                </button>
              </DropdownMenuTrigger>
            </Hint>
            <DropdownMenuContent align="end" sideOffset={4}>
              <DropdownMenuItem disabled={!text} onSelect={copyAll}>
                <CopyIcon />
                {pack.copyAll}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!text} onSelect={exportInfo}>
                <DownloadIcon />
                {pack.export}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={!single} onSelect={() => void reveal()}>
                <FolderOutIcon />
                {pack.revealFile}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={!single} onSelect={() => void open()}>
                <FileIcon />
                {pack.openFile}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ContextMenu onOpenChange={(open) => { if (!open) setRowKey(null) }}>
        <AxisScroll className="info-scroll" watch={`${tracks.length}:${items.length}:${order.join()}:${closed.join()}:${settle}`} shade>
          {(ref) => (
            <ContextMenuTrigger asChild>
              <div
                ref={ref}
                className="prop-table"
                onContextMenu={(event) => {
                  const target = event.target as HTMLElement
                  if (!target.closest('.prop-row')) setRowKey(null)
                  const id = target.closest<HTMLElement>('.info-section')?.dataset.section
                  setCtxSection(isSection(id) ? id : null)
                }}
              >
                {sections.map((section) => {
                  const open = !closed.includes(section.id)
                  const dragging = dragId === section.id
                  const over = overId === section.id && dragId !== null && dragId !== section.id
                  // линия показывает, куда встанет раздел: при переносе вверх — над целью, вниз — под ней
                  const overClass = !over ? '' : order.indexOf(dragId) > order.indexOf(section.id) ? 'over-before' : 'over-after'
                  return (
                    <section
                      key={section.id}
                      data-section={section.id}
                      className={['info-section', dragging ? 'dragging' : '', overClass].filter(Boolean).join(' ')}
                      onDragOver={(event) => {
                        if (!dragId || !event.dataTransfer.types.includes(DRAG_MIME)) return
                        event.preventDefault()
                        // preload (window dragover) выставляет dropEffect = 'copy' для любого драга и при
                        // effectAllowed = 'move' отменял бы drop. Не даём событию дойти до window.
                        event.stopPropagation()
                        event.dataTransfer.dropEffect = 'move'
                        if (overId !== section.id) setOverId(section.id)
                      }}
                      onDrop={(event) => {
                        if (!dragId || !event.dataTransfer.types.includes(DRAG_MIME)) return
                        event.preventDefault()
                        event.stopPropagation()
                        place(dragId, section.id)
                        setDragId(null)
                        setOverId(null)
                      }}
                    >
                      <div className="info-section-head">
                        <button
                          type="button"
                          className="info-section-toggle"
                          aria-expanded={open}
                          onClick={() => toggle(section.id)}
                        >
                          <ChevronRightIcon size={14} className={open ? 'info-chevron open' : 'info-chevron'} />
                          <span>{titles[section.id]}</span>
                        </button>
                        <button
                          type="button"
                          className="info-grip"
                          data-info-grip={section.id}
                          draggable
                          aria-label={pack.infoMoveSection}
                          onDragStart={(event) => {
                            event.stopPropagation()
                            event.dataTransfer.effectAllowed = 'move'
                            event.dataTransfer.setData(DRAG_MIME, section.id)
                            const host = event.currentTarget.closest('.info-section')
                            if (host) event.dataTransfer.setDragImage(host, 20, 16)
                            // состояние ставим после снимка drag-образа, иначе он снимется уже с .dragging (opacity .45)
                            const id = section.id
                            window.setTimeout(() => setDragId(id), 0)
                          }}
                          onDragEnd={() => {
                            setDragId(null)
                            setOverId(null)
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return
                            event.preventDefault()
                            const index = order.indexOf(section.id)
                            const next = order[index + (event.key === 'ArrowUp' ? -1 : 1)]
                            if (!next) return
                            refocus.current = section.id
                            place(section.id, next)
                          }}
                        >
                          <IconGripVertical size={16} stroke={2} aria-hidden="true" />
                        </button>
                      </div>
                      <Collapse open={open} innerClassName="info-section-body" onSettled={bumpSettle}>
                        {section.rows.map((item) => {
                          const key = item.id
                          const pending = Boolean(item.slow && analysis.loading)
                          const ready = !pending && canCopy(item.copy, pack.mixedShort)
                          return (
                            <div
                              className={rowKey === key ? 'prop-row active' : 'prop-row'}
                              key={key}
                              onContextMenu={() => setRowKey(key)}
                            >
                              <span>{item.label}</span>
                              <b>
                                {pending ? <span className="info-spinner" role="status" aria-label={pack.reading} /> : item.value || '—'}
                                {ready ? <CopyButton text={item.copy} label={pack.copyItem(item.label)} /> : null}
                              </b>
                            </div>
                          )
                        })}
                      </Collapse>
                    </section>
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
          <ContextMenuItem disabled={!text} onSelect={copyAll}>
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
          {/* темп из анализа бывает в 2 раза меньше/больше настоящего (92.5 вместо 185): правка по строке BPM */}
          {bpmRowPicked ? (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem disabled={!analysis.result || rowPending} onSelect={() => analysis.scaleBpm(2)}>
                BPM × 2
              </ContextMenuItem>
              <ContextMenuItem disabled={!analysis.result || rowPending} onSelect={() => analysis.scaleBpm(0.5)}>
                BPM ÷ 2
              </ContextMenuItem>
            </>
          ) : null}
          <ContextMenuSeparator />
          <ContextMenuItem disabled={ctxSection === null} onSelect={() => ctxSection && toggle(ctxSection)}>
            <ChevronRightIcon size={14} className={ctxOpen ? 'info-chevron open' : 'info-chevron'} />
            {ctxOpen ? label.collapse : label.expand}
          </ContextMenuItem>
          <ContextMenuItem disabled={closed.length === 0} onSelect={expandAll}>
            <ChevronRightIcon size={14} className="info-chevron" />
            {label.expandAll}
          </ContextMenuItem>
          <ContextMenuItem disabled={closed.length === INFO_SECTIONS.length} onSelect={collapseAll}>
            <ChevronRightIcon size={14} className="info-chevron open" />
            {label.collapseAll}
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    </div>
  )
}