import { useEffect, useMemo, useRef, useState } from 'react'
import { defaultFilter } from 'cmdk'
import { editorPlan, useEditor, type TrackVm } from '@/features/editor/model/store'
import { coverSrc } from '@/entities/track/lib'
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut
} from '@/components/ui/command'
import { ShortcutKeys } from '@/components/ui/kbd'
import { Hint } from '@/components/ui/tooltip'
import { FadeText } from '@/shared/ui/fade-text'
import { AxisScroll } from '@/shared/ui/axis-scroll'
import { ArrowLeftIcon, ArrowRightIcon, CoverIcon, DownloadIcon, FolderIcon, NoteIcon, TrashIcon, UploadIcon } from '@/shared/ui/icons'
import { shownTrackArtist, shownTrackTitle, trackDirty } from '@shared/plan'
import { useShortcut } from '@/features/settings/prefs'
import { fileWord, useI18n } from '@/shared/i18n'
import type { DropMode } from '@/features/editor/lib/drop'
import { readSidebarWidth } from './sidebar-layout'

export { TitleBar } from './titlebar'

const SIDEBAR_MIN = 220
const SIDEBAR_MAX = 350
const SIDEBAR_REST = 300

let sidebarSheet: CSSStyleSheet | null = null

function paintSidebar(width: number): number {
  const next = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)))
  if (!sidebarSheet) {
    sidebarSheet = new CSSStyleSheet()
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sidebarSheet]
  }
  sidebarSheet.replaceSync(`html:root{--sbw:${next}px}`)
  return next
}

// --sbw должен существовать уже на первом кадре. Иначе у закрытого sidebar
// margin-right: calc(var(--sbw) * -1) сначала невалиден (= 0), а после useEffect
// «доезжает» до -ширины — при запуске с закрытым sidebar было видно движение.
paintSidebar(readSidebarWidth())

const PAGE = 48
const PALETTE_LIMIT = 80
// сколько держим содержимое палитры живым после закрытия — чуть дольше анимации закрытия (.command-glass, 260–300мс)
const PALETTE_EXIT_MS = 320
const EMPTY_TRACKS: TrackVm[] = []

const TAB_IDS = ['all', 'files', 'dirty', 'commands'] as const

type PaletteTab = (typeof TAB_IDS)[number]

function rankRows<T>(rows: T[], query: string, text: (row: T) => string): T[] {
  const q = query.trim()
  if (!q) return rows
  return rows
    .map((row, index) => ({ row, index, score: defaultFilter(text(row), q) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((item) => item.row)
}

function toView(track: TrackVm) {
  return {
    path: track.path,
    error: track.error,
    original: track.original,
    draft: track.draft,
    originalCover: track.originalCover,
    draftCover: track.draftCover
  }
}

function isDirty(track: TrackVm, plan: ReturnType<typeof editorPlan>): boolean {
  return trackDirty(toView(track), plan)
}

function labelOf(track: TrackVm, plan: ReturnType<typeof editorPlan> | null) {
  if (!plan) return { title: track.draft.title, artist: track.draft.artist, number: undefined }
  const view = toView(track)
  return {
    title: shownTrackTitle(view, plan),
    artist: shownTrackArtist(view, plan),
    number: plan.fileName?.numbers?.[track.path]
  }
}

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { pack } = useI18n()
  const tabs = [
    { id: 'all' as const, label: pack.all },
    { id: 'files' as const, label: pack.allFiles },
    { id: 'dirty' as const, label: pack.changed },
    { id: 'commands' as const, label: pack.commands }
  ]
  // active = открыта ИЛИ ещё проигрывает анимацию закрытия: пока окно тает,
  // список, текст и вкладка остаются как были, а не очищаются раньше времени
  const [live, setLive] = useState(open)
  useEffect(() => {
    if (open) {
      setLive(true)
      return
    }
    const id = window.setTimeout(() => setLive(false), PALETTE_EXIT_MS)
    return () => window.clearTimeout(id)
  }, [open])
  const active = open || live
  const tracks = useEditor((state) => (active ? state.tracks : EMPTY_TRACKS))
  const plan = useEditor((state) => (active ? editorPlan(state) : null))
  const select = useEditor((state) => state.select)
  const openDialog = useEditor((state) => state.openDialog)
  const saveAll = useEditor((state) => state.requestSave)
  const clear = useEditor((state) => state.clear)
  const [tab, setTab] = useState<PaletteTab>('all')
  const [query, setQuery] = useState('')
  const [shown, setShown] = useState(PAGE)
  const listKey = `${tab}:${tracks.length}`
  const [shownKey, setShownKey] = useState(listKey)
  if (shownKey !== listKey) {
    setShownKey(listKey)
    setShown(PAGE)
  }

  const openKey = useShortcut('open')
  const saveKey = useShortcut('save')
  const commands = useMemo(
    () => [
      { id: 'open', label: pack.openFiles, shortcut: openKey, icon: <FolderIcon />, run: () => void openDialog() },
      { id: 'save', label: pack.writeTags, shortcut: saveKey, icon: <DownloadIcon />, run: () => saveAll() },
      { id: 'clear', label: pack.clearList, shortcut: '', icon: <TrashIcon />, run: clear }
    ],
    [openDialog, saveAll, clear, pack.openFiles, pack.writeTags, pack.clearList, openKey, saveKey]
  )

  const files = tracks.filter((track) => {
    if (tab === 'commands') return false
    if (tab === 'dirty') return plan ? isDirty(track, plan) : false
    return true
  })
  const showCommands = tab === 'all' || tab === 'commands'
  const q = query.trim()
  const labels = useMemo(() => {
    const map = new Map<string, ReturnType<typeof labelOf>>()
    if (!active) return map
    for (const track of tracks) map.set(track.path, labelOf(track, plan))
    return map
  }, [active, tracks, plan])
  const labelFor = (track: TrackVm) => labels.get(track.path) ?? labelOf(track, plan)
  const rankedFiles = rankRows(files, q, (track) => {
    const label = labelFor(track)
    return `${label.title} ${label.artist} ${track.draft.title} ${track.draft.artist} ${label.number ?? ''}`
  })
  const rankedCommands = rankRows(commands, q, (command) => command.label)
  const visibleFiles = (q ? rankedFiles : rankedFiles.slice(0, shown)).slice(0, PALETTE_LIMIT)
  const busy = !q && shown < Math.min(files.length, PALETTE_LIMIT)
  const fileLeadScore = rankedFiles[0] ? defaultFilter(`${labelFor(rankedFiles[0]).title} ${labelFor(rankedFiles[0]).artist}`, q) : 0
  const commandLeadScore = rankedCommands[0] ? defaultFilter(rankedCommands[0].label, q) : 0
  const filesLead = !q || fileLeadScore >= commandLeadScore

  useEffect(() => {
    if (!open || q || shown >= Math.min(files.length, PALETTE_LIMIT)) return
    const id = window.setTimeout(() => setShown((count) => Math.min(PALETTE_LIMIT, files.length, count + PAGE)), 32)
    return () => window.clearTimeout(id)
  }, [open, shown, files.length, q])

  // сброс — только когда окно уже полностью закрыто (после анимации)
  useEffect(() => {
    if (active) return
    setQuery('')
    setTab('all')
    setShown(PAGE)
  }, [active])

  useEffect(() => {
    document.querySelector('.command-glass .cmd-results .cmd-scroll-body')?.scrollTo({ top: 0 })
  }, [q, tab])

  const stepTab = (dir: -1 | 1) => {
    setTab((current) => {
      const index = tabs.findIndex((item) => item.id === current)
      return tabs[(index + dir + tabs.length) % tabs.length].id
    })
  }

  const fileGroup = visibleFiles.length ? (
    <CommandGroup
      key="files"
      heading={
        <span className="cmd-heading-label">
          {tab === 'dirty' ? pack.changed : pack.files}
          {busy ? <span className="cmd-spinner" role="status" aria-label={pack.loadingList} /> : null}
        </span>
      }
    >
      {visibleFiles.map((track) => {
        const { title, artist, number } = labelFor(track)
        const cover = track.draftCover
        return (
          <CommandItem
            key={track.path}
            value={`file:${track.path}`}
            onSelect={() => {
              select(track.path, 'single')
              onClose()
            }}
          >
            {cover ? (
              <img className="cmd-glyph" alt="" src={coverSrc(cover.mime, cover.dataBase64)} />
            ) : (
              <span className="cmd-glyph" aria-hidden="true">
                <CoverIcon size={15} />
              </span>
            )}
            <FadeText className="cmd-label">
              {title}
              {number ? ` %n% ${number}` : ''}
              {artist ? ` — ${artist}` : ''}
            </FadeText>
          </CommandItem>
        )
      })}
    </CommandGroup>
  ) : null

  const commandGroup = showCommands && rankedCommands.length ? (
    <CommandGroup key="commands" heading={pack.commands}>
      {rankedCommands.map((command) => (
        <CommandItem
          key={command.id}
          value={`cmd:${command.id}`}
          onSelect={() => {
            command.run()
            onClose()
          }}
        >
          <span className="cmd-glyph" aria-hidden="true">
            {command.icon}
          </span>
          <FadeText className="cmd-label">{command.label}</FadeText>
          {command.shortcut ? (
            <CommandShortcut>
              <ShortcutKeys shortcut={command.shortcut} />
            </CommandShortcut>
          ) : null}
        </CommandItem>
      ))}
    </CommandGroup>
  ) : null

  return (
    <CommandDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      title={pack.palette}
      description={pack.searchLong}
      className="command-glass"
    >
      <Command shouldFilter={false}>
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder={pack.searchLong}
          aria-label={pack.searchLong}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            const input = event.currentTarget
            const start = input.selectionStart ?? 0
            const end = input.selectionEnd ?? 0
            if (start !== end) return
            if (event.key === 'ArrowLeft' && start !== 0) return
            if (event.key === 'ArrowRight' && start !== input.value.length) return
            event.preventDefault()
            stepTab(event.key === 'ArrowLeft' ? -1 : 1)
          }}
        />
        <div className="cmd-tabs">
          <AxisScroll className="cmd-tabs-scroll" watch={tab}>
            {(ref) => (
              <div ref={ref} className="cmd-scroll-body cmd-tabs-body" role="tablist" aria-label={pack.sections}>
                {tabs.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    id={`cmd-tab-${item.id}`}
                    className={item.id === tab ? 'cmd-tab on' : 'cmd-tab'}
                    aria-selected={item.id === tab}
                    tabIndex={-1}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setTab(item.id)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </AxisScroll>
          <span className="cmd-tab-keys">
            <button type="button" className="cmd-tab-arrow" aria-label={pack.prevSection} onMouseDown={(event) => event.preventDefault()} onClick={() => stepTab(-1)}>
              <ArrowLeftIcon />
            </button>
            <button type="button" className="cmd-tab-arrow" aria-label={pack.nextSection} onMouseDown={(event) => event.preventDefault()} onClick={() => stepTab(1)}>
              <ArrowRightIcon />
            </button>
          </span>
        </div>
        <AxisScroll className="cmd-results" shade watch={`${tab}:${visibleFiles.length}:${showCommands}:${busy}`}>
          {(ref) => (
            <CommandList ref={ref} className="cmd-scroll-body">
              {filesLead ? (
                <>
                  {fileGroup}
                  {commandGroup}
                </>
              ) : (
                <>
                  {commandGroup}
                  {fileGroup}
                </>
              )}
            </CommandList>
          )}
        </AxisScroll>
        <CommandEmpty>
          <span className="cmd-empty-title">{pack.noResults}</span>
          <span className="cmd-empty-hint">{pack.noResultsHint}</span>
        </CommandEmpty>
      </Command>
    </CommandDialog>
  )
}

export function DragOverlay({ mode, count }: { mode: DropMode | null; count: number }) {
  const { pack } = useI18n()
  const title = mode === 'cover' ? pack.dropCover : mode === 'comment' ? pack.dropComment : pack.dropRelease
  const detail = mode === 'cover' || mode === 'comment' ? '' : count > 0 ? `${count} ${fileWord(count, pack)}` : pack.filesOrFolder
  return (
    <div className="drag-overlay" aria-hidden="true">
      <div className="drag-card">
        <UploadIcon />
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>
  )
}

export function EmptyStage({ onOpenFiles, onOpenFolder }: { onOpenFiles: () => void; onOpenFolder: () => void }) {
  const { pack } = useI18n()
  return (
    <div className="empty-stage">
      <NoteIcon size={40} />
      <strong>{pack.dropHere}</strong>
      <span>{pack.formats}</span>
      <div className="empty-actions">
        <button type="button" className="btn primary" onClick={onOpenFiles}>
          {pack.openFilesShort}
        </button>
        <button type="button" className="btn" onClick={onOpenFolder}>
          {pack.openFolderShort}
        </button>
      </div>
    </div>
  )
}

export function SidebarResizer({ width, onWidth, collapsed = false }: { width: number; onWidth: (width: number) => void; collapsed?: boolean }) {
  const { pack } = useI18n()
  const drag = useRef<{ x: number; width: number } | null>(null)
  const live = useRef(width)

  useEffect(() => {
    if (drag.current) return
    const next = paintSidebar(width)
    live.current = next
    if (next !== width) onWidth(next)
  }, [width, onWidth])

  const commit = (next: number, node: HTMLElement) => {
    const value = paintSidebar(next)
    live.current = value
    node.setAttribute('aria-valuenow', String(value))
    return value
  }

  const finish = (node: HTMLElement) => {
    node.closest('.workspace')?.classList.remove('sb-drag')
    if (!drag.current) return
    drag.current = null
    onWidth(live.current)
  }

  return (
    <div
      className="resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label={pack.listWidth}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      aria-valuenow={width}
      tabIndex={collapsed ? -1 : 0}
      aria-hidden={collapsed || undefined}
      onKeyDown={(event) => {
        if (event.key === 'Home' || event.key === 'End') {
          event.preventDefault()
          // не пускаем наверх: глобальный Home/End в use-bindings иначе ещё и выделяет первый/последний трек (аудит H3)
          event.stopPropagation()
          onWidth(commit(event.key === 'Home' ? SIDEBAR_MIN : SIDEBAR_MAX, event.currentTarget))
          return
        }
        const step = event.key === 'ArrowLeft' ? -16 : event.key === 'ArrowRight' ? 16 : 0
        if (!step) return
        event.preventDefault()
        event.stopPropagation()
        onWidth(commit(live.current + step, event.currentTarget))
      }}
      onPointerDown={(event) => {
        if (event.button !== 0 || collapsed) return
        event.currentTarget.closest('.workspace')?.classList.add('sb-drag')
        drag.current = { x: event.clientX, width: live.current }
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        commit(drag.current.width + event.clientX - drag.current.x, event.currentTarget)
      }}
      onPointerUp={(event) => finish(event.currentTarget)}
      onPointerCancel={(event) => finish(event.currentTarget)}
      onLostPointerCapture={(event) => finish(event.currentTarget)}
      onDoubleClick={(event) => {
        drag.current = null
        onWidth(commit(SIDEBAR_REST, event.currentTarget))
      }}
    />
  )
}