import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { createPortal, flushSync } from 'react-dom'
import { editorPlan, useEditor, type TrackVm } from '@/features/editor/model/store'
import { CoverImg } from '@/entities/track/cover-thumb'
import { Command, CommandDialog, CommandInput, CommandList } from '@/components/ui/command'
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
import { rankBy, scoreHay } from './palette-rank'
import { virtualRange } from '@/shared/ui/scroll-metrics'

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

// сколько держим содержимое палитры живым после закрытия — чуть дольше анимации закрытия (.command-glass, 260–300мс)
const PALETTE_EXIT_MS = 320
const ROW = 44
const HEAD = 32
const OVERSCAN = 16
const EMPTY_TRACKS: TrackVm[] = []
// клавиши, после которых активную строку нужно довести до видимой области
const NAV_KEYS = new Set(['ArrowDown', 'ArrowUp', 'Home', 'End', 'PageDown', 'PageUp'])

const TAB_IDS = ['all', 'files', 'dirty', 'commands'] as const

type PaletteTab = (typeof TAB_IDS)[number]

type FileRow = {
  track: TrackVm
  title: string
  artist: string
  number: string | undefined   // было: number | undefined
  text: string
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
  const requestClear = useEditor((state) => state.requestClear)
  const loading = useEditor((state) => (active ? state.loading : false))
  const [tab, setTab] = useState<PaletteTab>('all')
  const [query, setQuery] = useState('')
  const deferred = useDeferredValue(query)
  const q = deferred.trim().toLowerCase()
  const [cursor, setCursor] = useState(0)
  const [span, setSpan] = useState({ start: 0, end: 24 })
  const spanRef = useRef(span)
  spanRef.current = span
  const held = useRef<RefObject<HTMLDivElement | null> | null>(null)
  // Содержимое диалога монтируется через Portal уже ПОСЛЕ layout-эффектов родителя, поэтому
  // слушатель scroll нельзя вешать по held.current.current в эффекте [open]: там ещё null.
  // Узел приходит через ref-колбэк, эффект подписки зависит от него.
  const [listEl, setListEl] = useState<HTMLDivElement | null>(null)
  const bindList = useCallback((node: HTMLDivElement | null) => {
    const ref = held.current
    if (ref) (ref as { current: HTMLDivElement | null }).current = node
    setListEl(node)
  }, [])
  const revealRef = useRef(false)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const cssRef = useRef('')
  const geomRef = useRef({ filesTop: 0, fileCount: 0, view: 360 })

  const openKey = useShortcut('open')
  const saveKey = useShortcut('save')
  const clearKey = useShortcut('clear')
  const commands = useMemo(
    () => [
      { id: 'open', label: pack.openFiles, shortcut: openKey, icon: <FolderIcon />, run: () => void openDialog() },
      { id: 'save', label: pack.writeTags, shortcut: saveKey, icon: <DownloadIcon />, run: () => saveAll() },
      { id: 'clear', label: pack.clearList, shortcut: clearKey, icon: <TrashIcon />, run: requestClear }
    ],
    [openDialog, saveAll, requestClear, pack.openFiles, pack.writeTags, pack.clearList, openKey, saveKey, clearKey]
  )

  // Строка поиска собирается вместе с пачкой, а не на каждый символ.
  // Хвост дописывается отдельно: на 5000 файлах полный проход на каждую пачку заметно тормозит ввод.
  const catalogCache = useRef<{ tracks: TrackVm[]; plan: ReturnType<typeof editorPlan> | null; rows: FileRow[] }>({
    tracks: EMPTY_TRACKS,
    plan: null,
    rows: []
  })
  const catalog = useMemo(() => {
    if (!active) {
      catalogCache.current = { tracks: EMPTY_TRACKS, plan: null, rows: [] }
      return catalogCache.current.rows
    }
    const prev = catalogCache.current
    const grown =
      prev.plan === plan &&
      prev.tracks.length <= tracks.length &&
      prev.tracks.every((track, index) => track === tracks[index])
    const rows = grown ? prev.rows.slice(0, prev.tracks.length) : []
    const from = grown ? prev.tracks.length : 0
    for (let index = from; index < tracks.length; index += 1) {
      const track = tracks[index]
      const label = labelOf(track, plan)
      rows.push({
        track,
        title: label.title,
        artist: label.artist,
        number: label.number,
        text: `${label.title} ${label.artist} ${track.draft.title} ${track.draft.artist} ${label.number ?? ''}`.toLowerCase()
      })
    }
    catalogCache.current = { tracks, plan, rows }
    return rows
  }, [active, tracks, plan])
  const pool = useMemo(() => {
    if (tab === 'commands') return [] as FileRow[]
    if (tab === 'dirty') return catalog.filter((row) => (plan ? isDirty(row.track, plan) : false))
    return catalog
  }, [catalog, tab, plan])
  const rankedFiles = useMemo(() => rankBy(pool, q, (row) => row.text), [pool, q])
  const rankedCommands = useMemo(() => rankBy(commands, q, (command) => command.label.toLowerCase()), [commands, q])
  const showCommands = tab === 'all' || tab === 'commands'
  const fileCount = rankedFiles.length
  const cmdCount = showCommands ? rankedCommands.length : 0
  const fileScore = rankedFiles[0] ? scoreHay(rankedFiles[0].text, q) : 0
  const commandScore = rankedCommands[0] ? scoreHay(rankedCommands[0].label.toLowerCase(), q) : 0
  const filesLead = !q || fileScore >= commandScore
  const fileBlock = fileCount ? HEAD + fileCount * ROW : 0
  const cmdBlock = cmdCount ? HEAD + cmdCount * ROW : 0
  const total = fileBlock + cmdBlock
  const filesTop = !filesLead && cmdBlock ? cmdBlock : 0
  const cmdsTop = filesLead ? fileBlock : 0
  const hits = fileCount + cmdCount
  const activeIndex = hits ? Math.min(cursor, hits - 1) : -1
  geomRef.current.filesTop = filesTop
  geomRef.current.fileCount = fileCount

  const filterKey = `${tab}:${q}`
  const [filterMark, setFilterMark] = useState(filterKey)
  if (filterMark !== filterKey) {
    setFilterMark(filterKey)
    setCursor(0)
  }

  // сброс — только когда окно уже полностью закрыто (после анимации)
  useEffect(() => {
    if (active) return
    setQuery('')
    setTab('all')
    setCursor(0)
  }, [active])

  const paint = (rowsY: number) => {
    const css = [
      `.command-glass .cmd-virtual{height:${total}px}`,
      `.command-glass .cmd-vhead-files{transform:translateY(${filesTop}px)}`,
      `.command-glass .cmd-vrows{transform:translateY(${rowsY}px)}`,
      `.command-glass .cmd-vhead-cmds{transform:translateY(${cmdsTop}px)}`,
      `.command-glass .cmd-vcmds{transform:translateY(${cmdsTop + HEAD}px)}`
    ].join('')
    if (css === cssRef.current) return
    cssRef.current = css
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    sheetRef.current.replaceSync(css)
  }

  const syncWindow = (flush: boolean) => {
    const el = held.current?.current
    if (!el) return
    const view = el.clientHeight || geomRef.current.view
    geomRef.current.view = view
    const origin = geomRef.current.filesTop + (geomRef.current.fileCount ? HEAD : 0)
    const next = virtualRange(el.scrollTop, view, geomRef.current.fileCount, ROW, OVERSCAN, origin)
    paint(geomRef.current.filesTop + HEAD + next.start * ROW)
    if (spanRef.current.start === next.start && spanRef.current.end === next.end) return
    if (flush) flushSync(() => setSpan(next))
    else setSpan(next)
  }

  const latest = useRef({ syncWindow })
  latest.current = { syncWindow }

  useLayoutEffect(() => {
    latest.current.syncWindow(false)
  }, [total, filesTop, cmdsTop, fileCount, open])

  useLayoutEffect(() => {
    const el = listEl
    if (!el || !open) return
    latest.current.syncWindow(false)
    const onScroll = () => latest.current.syncWindow(true)
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => latest.current.syncWindow(false))
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [open, listEl])

  useLayoutEffect(() => {
    const el = held.current?.current
    if (!el) return
    el.scrollTop = 0
    latest.current.syncWindow(false)
  }, [q, tab])

  const fileCountRef = useRef(fileCount)
  useLayoutEffect(() => {
    const previous = fileCountRef.current
    fileCountRef.current = fileCount
    // Курсор на команде хранится абсолютным индексом. Рост списка файлов не должен переносить его на файл.
    if (!filesLead || fileCount === previous) return
    setCursor((current) => (current > 0 && current >= previous ? current + (fileCount - previous) : current))
  }, [fileCount, filesLead])

  useLayoutEffect(() => {
    // К активной строке едем только после клавиатуры. Наведение мыши тоже меняет activeIndex,
    // но список из-под курсора двигаться не должен.
    if (!revealRef.current) return
    revealRef.current = false
    const el = held.current?.current
    if (!el || activeIndex < 0) return
    const filesFirst = filesLead || cmdCount === 0
    const rowTop = filesFirst
      ? activeIndex < fileCount
        ? filesTop + HEAD + activeIndex * ROW
        : cmdsTop + HEAD + (activeIndex - fileCount) * ROW
      : activeIndex < cmdCount
        ? cmdsTop + HEAD + activeIndex * ROW
        : filesTop + HEAD + (activeIndex - cmdCount) * ROW
    // первая строка едет вместе с заголовком секции
    const top = activeIndex === 0 ? 0 : rowTop
    const bottom = rowTop + ROW
    const view = geomRef.current.view || el.clientHeight
    if (top < el.scrollTop) el.scrollTop = top
    else if (bottom > el.scrollTop + view) el.scrollTop = bottom - view
  }, [activeIndex])

  useEffect(() => {
    return () => {
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  const stepTab = (dir: -1 | 1) => {
    setTab((current) => {
      const index = tabs.findIndex((item) => item.id === current)
      return tabs[(index + dir + tabs.length) % tabs.length].id
    })
  }

  const choose = (index: number) => {
    if (index < 0) return
    const filesFirst = filesLead || cmdCount === 0
    if (filesFirst) {
      if (index < fileCount) {
        select(rankedFiles[index].track.path, 'single')
        onClose()
        return
      }
      rankedCommands[index - fileCount]?.run()
      onClose()
      return
    }
    if (index < cmdCount) {
      rankedCommands[index]?.run()
      onClose()
      return
    }
    const file = rankedFiles[index - cmdCount]
    if (!file) return
    select(file.track.path, 'single')
    onClose()
  }

  const onCommandKey = (event: React.KeyboardEvent) => {
    if (!hits && event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    if (NAV_KEYS.has(event.key)) revealRef.current = true
    const page = Math.max(1, Math.floor((geomRef.current.view || 320) / ROW) - 1)
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setCursor(Math.min(hits - 1, (activeIndex < 0 ? -1 : activeIndex) + 1))
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setCursor(Math.max(0, (activeIndex < 0 ? 0 : activeIndex) - 1))
      return
    }
    if (event.key === 'Home') {
      event.preventDefault()
      setCursor(0)
      return
    }
    if (event.key === 'End') {
      event.preventDefault()
      setCursor(hits - 1)
      return
    }
    if (event.key === 'PageDown') {
      event.preventDefault()
      setCursor(Math.min(hits - 1, (activeIndex < 0 ? 0 : activeIndex) + page))
      return
    }
    if (event.key === 'PageUp') {
      event.preventDefault()
      setCursor(Math.max(0, (activeIndex < 0 ? 0 : activeIndex) - page))
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      choose(activeIndex)
    }
  }

  const fileCursor = (index: number) => (filesLead || cmdCount === 0 ? index : cmdCount + index)
  const commandCursor = (index: number) => (filesLead || cmdCount === 0 ? fileCount + index : index)
  const windowRows = rankedFiles.slice(span.start, span.end)
  const fileHeading = tab === 'dirty' ? pack.changed : pack.files

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
      <Command shouldFilter={false} onKeyDown={onCommandKey}>
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
        <AxisScroll className="cmd-results" shade watch={tab} extent={total} smooth={loading}>
          {(ref) => {
            held.current = ref
            return (
            <CommandList ref={bindList} className="cmd-scroll-body">
              {total === 0 ? (
                <div data-slot="command-empty">
                  <span className="cmd-empty-title">{loading ? pack.loadingList : pack.noResults}</span>
                  <span className="cmd-empty-hint">{pack.noResultsHint}</span>
                </div>
              ) : (
                <div className="cmd-virtual" role="listbox" aria-label={pack.files}>
                  {fileCount ? (
                    <div className="cmd-vhead cmd-vhead-files">
                      <span className="cmd-heading-label">
                        {fileHeading}
                        {loading ? <span className="cmd-spinner" role="status" aria-label={pack.loadingList} /> : null}
                      </span>
                    </div>
                  ) : null}
                  <div className="cmd-vrows">
                    {windowRows.map((row, offset) => {
                      const index = span.start + offset
                      const cover = row.track.draftCover
                      const on = fileCursor(index) === activeIndex
                      return (
                        <button
                          key={row.track.path}
                          type="button"
                          className="cmd-row"
                          role="option"
                          aria-selected={on}
                          data-selected={on ? 'true' : 'false'}
                          onMouseDown={(event) => event.preventDefault()}
                          onMouseEnter={() => {
                            revealRef.current = false
                            setCursor(fileCursor(index))
                          }}
                          onClick={() => choose(fileCursor(index))}
                        >
                          {cover ? (
                            <CoverImg cover={cover} className="cmd-glyph" iconSize={15} />
                          ) : (
                            <span className="cmd-glyph" aria-hidden="true">
                              <CoverIcon size={15} />
                            </span>
                          )}
                          <FadeText className="cmd-label">
                            {row.title}
                            {row.number ? ` %n% ${row.number}` : ''}
                            {row.artist ? ` — ${row.artist}` : ''}
                          </FadeText>
                        </button>
                      )
                    })}
                  </div>
                  {cmdCount ? <div className="cmd-vhead cmd-vhead-cmds">{pack.commands}</div> : null}
                  {cmdCount ? (
                    <div className="cmd-vcmds">
                      {rankedCommands.map((command, index) => {
                        const on = commandCursor(index) === activeIndex
                        return (
                          <button
                            key={command.id}
                            type="button"
                            className="cmd-row"
                            role="option"
                            aria-selected={on}
                            data-selected={on ? 'true' : 'false'}
                            onMouseDown={(event) => event.preventDefault()}
                            onMouseEnter={() => {
                              revealRef.current = false
                              setCursor(commandCursor(index))
                            }}
                            onClick={() => choose(commandCursor(index))}
                          >
                            <span className="cmd-glyph" aria-hidden="true">
                              {command.icon}
                            </span>
                            <FadeText className="cmd-label">{command.label}</FadeText>
                            {command.shortcut ? (
                              <span className="cmd-keys">
                                <ShortcutKeys shortcut={command.shortcut} />
                              </span>
                            ) : null}
                          </button>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )}
            </CommandList>
            )
          }}
        </AxisScroll>
      </Command>
    </CommandDialog>
  )
}

export function DragOverlay({ mode, count }: { mode: DropMode | null; count: number }) {
  const { pack } = useI18n()
  // Последний показанный режим держим, пока оверлей гаснет: иначе текст успевает смениться на «файлы».
  const last = useRef<{ mode: DropMode; count: number }>({ mode: 'library', count: 0 })
  if (mode) last.current = { mode, count }
  const shown = last.current
  const title = shown.mode === 'cover' ? pack.dropCover : shown.mode === 'comment' ? pack.dropComment : pack.dropRelease
  const detail =
    shown.mode === 'cover' || shown.mode === 'comment' ? '' : shown.count > 0 ? `${shown.count} ${fileWord(shown.count, pack)}` : pack.filesOrFolder
  // В body, а не внутри .shell: у .shell стоит container-type: size, и position: fixed внутри него
  // считается от самой оболочки. Из body оверлей накрывает всё окно, включая titlebar.
  return createPortal(
    <div className={mode ? 'drag-overlay on' : 'drag-overlay'} aria-hidden="true">
      <div className="drag-card">
        <UploadIcon />
        <strong>{title}</strong>
        {detail ? <span>{detail}</span> : null}
      </div>
    </div>,
    document.body
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