import { useState } from 'react'
import { baseName, formatBadge, formatBytes, formatDuration, formatRate } from '@/entities/track/lib'
import { useEditor, type TrackVm } from '@/features/editor/model/store'
import { camelotOf } from '@shared/key'
import { Hint } from '@/components/ui/tooltip'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { CheckIcon, CopyIcon, DownloadIcon, FolderIcon, OpenExternalIcon } from '@/shared/ui/icons'
import { getPack, useI18n } from '@/shared/i18n'

interface InfoRow {
  label: string
  value: string
  copy: string
}

function uniform(values: string[]): string {
  const filled = values.map((item) => item.trim()).filter(Boolean)
  if (!filled.length) return ''
  return new Set(filled).size === 1 ? filled[0] : getPack().mixedShort
}

function channels(count: number): string {
  const pack = getPack()
  if (count === 1) return `1, ${pack.mono}`
  if (count === 2) return `2, ${pack.stereo}`
  return count ? String(count) : ''
}

function preview(text: string): string {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > 160 ? `${line.slice(0, 160)}…` : line
}

function rowsOf(tracks: TrackVm[]): InfoRow[] {
  const pack = getPack()
  const one = tracks.length === 1 ? tracks[0] : null
  const cell = (read: (track: TrackVm) => string) => uniform(tracks.map(read))
  const row = (label: string, value: string, copy = value): InfoRow => ({ label, value, copy })
  const always: InfoRow[] = [
    one
      ? row(pack.infoPath, one.path)
      : row(pack.infoFiles, String(tracks.length), tracks.map((track) => track.path).join('\n')),
    row(pack.infoFormat, cell((track) => formatBadge(track.format))),
    row(pack.infoCodec, cell((track) => track.tech.codec ?? '')),
    row(pack.infoDuration, cell((track) => formatDuration(track.tech.durationMs))),
    row(pack.infoBitrate, cell((track) => (track.tech.bitrate ? `${Math.round(track.tech.bitrate / 1000)} kbps` : ''))),
    row(pack.infoRate, cell((track) => formatRate(track.tech.sampleRate))),
    row(pack.infoChannels, cell((track) => channels(track.tech.channels ?? 0))),
    row(pack.infoBits, cell((track) => (track.tech.bitsPerSample ? `${track.tech.bitsPerSample} ${pack.bits}` : ''))),
    row(pack.infoSize, cell((track) => (track.tech.size ? formatBytes(track.tech.size) : ''))),
    row('BPM', cell((track) => (track.tech.bpm ? String(track.tech.bpm) : ''))),
    row(pack.infoKey, cell((track) => track.tech.key ?? '')),
    row('Camelot', cell((track) => camelotOf(track.tech.key ?? ''))),
    row(pack.infoEncoder, cell((track) => track.tech.encoder ?? ''))
  ]
  const extra: InfoRow[] = [
    row(pack.infoComposer, cell((track) => track.tech.composer ?? '')),
    row(pack.infoPublisher, cell((track) => track.tech.publisher ?? '')),
    row(pack.infoConductor, cell((track) => track.tech.conductor ?? '')),
    row(pack.infoRemix, cell((track) => track.tech.remix ?? '')),
    row(pack.infoSubtitle, cell((track) => track.tech.subtitle ?? '')),
    row(pack.infoGrouping, cell((track) => track.tech.grouping ?? '')),
    row(pack.infoCopyright, cell((track) => track.tech.copyright ?? '')),
    row('ISRC', cell((track) => track.tech.isrc ?? '')),
    row('MusicBrainz', cell((track) => track.tech.musicBrainz ?? '')),
    row('ReplayGain', cell((track) => track.tech.replayGain ?? '')),
    row(pack.infoLyrics, cell((track) => preview(track.tech.lyrics ?? '')), cell((track) => track.tech.lyrics ?? ''))
  ].filter((item) => item.value)
  return [...always, ...extra]
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
          .catch(() => notify({ kind: 'err', text: 'Не удалось скопировать' }))
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

export function InfoPane({ tracks }: { tracks: TrackVm[] }) {
  const { pack } = useI18n()
  const notify = useEditor((state) => state.notify)
  const reveal = useEditor((state) => state.revealCurrent)
  const open = useEditor((state) => state.openCurrent)
  const items = rowsOf(tracks)
  const text = report(items)
  const single = tracks.length === 1
  const exportInfo = () => {
    const name = `${baseName(tracks[0]?.path || 'info').replace(/\.[^.]+$/, '')}.txt`
    void window.musicTagEditor
      ?.saveText({ text, name })
      .then((saved) => {
        if (saved) notify({ kind: 'ok', text: 'Сведения экспортированы' })
      })
      .catch(() => notify({ kind: 'err', text: 'Не удалось экспортировать' }))
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
      <AxisScroll className="info-scroll" watch={`${tracks.map((track) => track.path).join('\n')}:${items.length}`} shade>
        {(ref) => (
          <div ref={ref} className="prop-table">
            {items.map((item) => (
              <div className="prop-row" key={item.label}>
                <span>{item.label}</span>
                <b>{item.value || '—'}</b>
                <CopyButton text={item.copy} label={pack.copyItem(item.label)} />
              </div>
            ))}
          </div>
        )}
      </AxisScroll>
    </div>
  )
}
