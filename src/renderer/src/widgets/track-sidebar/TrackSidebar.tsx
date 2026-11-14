import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { coverSrc, formatBadge } from '@/entities/track/lib'
import { copyPlain, copyTracks } from '@/features/editor/lib/copy'
import { editorPlan, useEditor, type TrackVm } from '@/features/editor/model/store'
import { usePrefs } from '@/features/settings/prefs'
import { SidebarStatus } from '@/widgets/save-bar/SaveBar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Hint } from '@/components/ui/tooltip'
import { FadeText } from '@/shared/ui/fade-text'
import {
  ArtistIcon,
  CheckIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  CopyIcon,
  CreatedIcon,
  DurationIcon,
  FileIcon,
  FilePlusIcon,
  FilterIcon,
  FolderIcon,
  FolderOutIcon,
  ModifiedIcon,
  CoverIcon,
  MoreIcon,
  NoteIcon,
  OrderIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  RefreshIcon,
  SortNameIcon,
  TrashIcon
} from '@/shared/ui/icons'
import { shownTrackArtist, shownTrackTitle, trackDirty } from '@shared/plan'
import { getLocale, tr, useI18n } from '@/shared/i18n'

type SideSort = 'open' | 'name' | 'title' | 'artist' | 'created' | 'modified' | 'duration'

const ROW = 46
const OVERSCAN = 8
const TRACK_MS = 200
const HEAD_MS = 220

type ExitRow = { track: TrackVm; index: number }

type ListMotion = {
  ready: boolean
  generation: number
  paths: string[]
  entered: ReadonlySet<string>
  exits: ExitRow[]
  above: number
  defer: boolean
}

function samePaths(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) return false
  return true
}

function sameFiles(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false
  const known = new Set(left)
  return right.every((path) => known.has(path))
}

function viewportRows(list: HTMLUListElement | null): { first: number; last: number } {
  if (!list || list.clientHeight <= 0) return { first: 0, last: 0 }
  return {
    first: Math.floor(list.scrollTop / ROW),
    last: Math.ceil((list.scrollTop + list.clientHeight) / ROW)
  }
}

function placeExits(visible: TrackVm[], exits: readonly ExitRow[], above: number): { track: TrackVm; leaving: boolean }[] {
  const rows = visible.map((track) => ({ track, leaving: false }))
  for (const exit of exits) {
    const at = Math.min(rows.length, Math.max(0, exit.index - above))
    rows.splice(at, 0, { track: exit.track, leaving: true })
  }
  return rows
}

const SORT_ICON: Record<SideSort, ReactNode> = {
  open: <OrderIcon />,
  name: <SortNameIcon />,
  title: <NoteIcon />,
  artist: <ArtistIcon />,
  created: <CreatedIcon />,
  modified: <ModifiedIcon />,
  duration: <DurationIcon />
}

function fileLabel(path: string): string {
  return path.split(/[/\\]/).pop() || path
}

function compareTracks(left: TrackVm, right: TrackVm, sort: SideSort): number {
  const text = (a: string, b: string) => a.localeCompare(b, getLocale(), { sensitivity: 'base' })
  const olderLast = (a: number, b: number) => b - a
  if (sort === 'name') return text(fileLabel(left.path), fileLabel(right.path))
  if (sort === 'title') return text(left.draft.title || fileLabel(left.path), right.draft.title || fileLabel(right.path))
  if (sort === 'artist') return compareArtist(left.draft.artist, right.draft.artist, text)
  if (sort === 'created') return olderLast(left.tech.createdMs ?? 0, right.tech.createdMs ?? 0)
  if (sort === 'modified') return olderLast(left.tech.modifiedMs ?? 0, right.tech.modifiedMs ?? 0)
  if (sort === 'duration') return olderLast(left.tech.durationMs ?? 0, right.tech.durationMs ?? 0)
  return 0
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

// TODO: move to the i18n packs (needs keys in @/shared/i18n)
const MSG = {
  pathCopied: 'Путь скопирован',
  pathCopyFailed: 'Не удалось скопировать путь',
  pathsCopied: 'Пути скопированы',
  pathsCopyFailed: 'Не удалось скопировать пути',
  refreshFailed: 'Не удалось обновить список'
} as const

// Tracks without an artist go last instead of first.
function compareArtist(a: string, b: string, text: (a: string, b: string) => number): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return text(a, b)
}

function ToolMenu({
  label,
  disabled,
  align,
  icon,
  pressed,
  children
}: {
  label: string
  disabled?: boolean
  align: 'start' | 'end'
  icon: ReactNode
  pressed?: boolean
  children: ReactNode
}) {
  return (
    <DropdownMenu>
      <Hint label={label} align={align}>
        <DropdownMenuTrigger asChild>
          <button type="button" className={pressed ? 'icon-btn on' : 'icon-btn'} aria-label={label} aria-pressed={pressed} disabled={disabled}>
            {icon}
          </button>
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent align={align} aria-label={label}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function TrackMenu({
  path,
  picked,
  group,
  broken,
  children
}: {
  path: string
  picked: boolean
  group: boolean
  broken: boolean
  children: ReactNode
}) {
  const select = useEditor((state) => state.select)
  const remove = useEditor((state) => state.remove)
  const removeSelected = useEditor((state) => state.removeSelected)
  const revealFile = useEditor((state) => state.revealFile)
  const openFile = useEditor((state) => state.openFile)
  const requestPlay = useEditor((state) => state.requestPlay)
  const nowPlaying = useEditor((state) => state.nowPlaying)
  const { pack } = useI18n()
  const playing = nowPlaying === path
  return (
    <ContextMenu
      onOpenChange={(open) => {
        if (open && !picked) select(path, 'single')
      }}
    >
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={broken} onSelect={() => requestPlay(path)}>
          {playing ? <PauseIcon /> : <PlayIcon />}
          {playing ? pack.pause : pack.play}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void revealFile(path)}>
          <FolderOutIcon />
          {pack.revealFile}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void openFile(path)}>
          <FileIcon />
          {pack.openFile}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyTracks('files', path)}>
          <CopyIcon />
          {group ? pack.copyFiles : pack.copyFile}
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => void copyTracks('paths', path)}>
          <CopyIcon />
          {group ? pack.copyPaths : pack.copyPath}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => (group ? removeSelected() : remove(path))}>
          <TrashIcon />
          {group ? pack.removeMany : pack.removeOne}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

export function TrackSidebar({ loading, collapsed = false }: { loading: boolean; collapsed?: boolean }) {
  const tracks = useEditor((state) => state.tracks)
  const selected = useEditor((state) => state.selected)
  const plan = useEditor(editorPlan)
  const clear = useEditor((state) => state.clear)
  const refresh = useEditor((state) => state.refresh)
  const refreshSource = useEditor((state) => state.refreshSource)
  const openSource = useEditor((state) => state.openSource)
  const sourceDir = useEditor((state) => state.sourceDir)
  const revealCurrent = useEditor((state) => state.revealCurrent)
  const openCurrent = useEditor((state) => state.openCurrent)
  const openDialog = useEditor((state) => state.openDialog)
  const openFolder = useEditor((state) => state.openFolder)
  const select = useEditor((state) => state.select)
  const selectDelta = useEditor((state) => state.selectDelta)
  const setListOrder = useEditor((state) => state.setListOrder)
  const focus = useEditor((state) => state.focus)
  const [refreshing, setRefreshing] = useState(false)
  const { pack } = useI18n()
  const showFormat = usePrefs().showFormatBadges
  const sorts: { id: SideSort; label: string; icon: ReactNode }[] = [
    { id: 'open', label: pack.sortOpen, icon: SORT_ICON.open },
    { id: 'name', label: pack.sortName, icon: SORT_ICON.name },
    { id: 'title', label: pack.sortTitle, icon: SORT_ICON.title },
    { id: 'artist', label: pack.sortArtist, icon: SORT_ICON.artist },
    { id: 'created', label: pack.sortCreated, icon: SORT_ICON.created },
    { id: 'modified', label: pack.sortModified, icon: SORT_ICON.modified },
    { id: 'duration', label: pack.sortDuration, icon: SORT_ICON.duration }
  ]
  const picked = new Set(selected)
  const [sort, setSort] = useState<SideSort>('open')
  const [span, setSpan] = useState({ start: 0, end: 32 })
  const spanRef = useRef(span)
  const countRef = useRef(0)
  spanRef.current = span
  const [edges, setEdges] = useState({ top: false, bottom: false })
  const [overflow, setOverflow] = useState(false)
  const [barOn, setBarOn] = useState(false)
  const listRef = useRef<HTMLUListElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const thumbRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<CSSStyleSheet | null>(null)
  const hideTimer = useRef(0)
  const drag = useRef<{ y: number; top: number } | null>(null)
  const overThumb = useRef(false)
  const overList = useRef(false)
  const barOnRef = useRef(false)
  const cssRef = useRef('')
  const lastPick = useRef(0)
  const knownTracks = useRef(new Map<string, TrackVm>())
  const scrollGen = useRef(0)
  const [motion, setMotion] = useState<ListMotion>({
    ready: false,
    generation: 0,
    paths: [],
    entered: new Set(),
    exits: [],
    above: 0,
    defer: false
  })

  const visible = useMemo(() => {
    if (sort === 'open') return tracks
    return tracks
      .map((track, index) => ({ track, index }))
      .sort((left, right) => compareTracks(left.track, right.track, sort) || left.index - right.index)
      .map((item) => item.track)
  }, [tracks, sort])
  const orderKey = useMemo(() => visible.map((track) => track.path).join('\0'), [visible])

  useEffect(() => {
    if (!tracks.length) setSort('open')
  }, [tracks.length])

  const placeThumb = () => {
    const el = listRef.current
    if (!el) return
    const max = el.scrollHeight - el.clientHeight
    const can = max > 1
    const top = can && el.scrollTop > 2
    const bottom = max - el.scrollTop > 16
    setEdges((prev) => (prev.top === top && prev.bottom === bottom ? prev : { top, bottom }))
    setOverflow((prev) => (prev === can ? prev : can))
    const rail = railRef.current
    const thumb = thumbRef.current
    if (can && rail && thumb) {
      const track = rail.clientHeight
      const height = Math.max(28, Math.min(track, (el.clientHeight / el.scrollHeight) * track))
      const y = (el.scrollTop / max) * Math.max(0, track - height)
      thumb.style.height = `${height}px`
      thumb.style.transform = `translateY(${y}px)`
    }
    const pad = spanRef.current.start * ROW
    const rest = Math.max(0, countRef.current - spanRef.current.end) * ROW
    const css = `.track-list{--list-pad:${pad}px;--list-rest:${rest}px}`
    if (css === cssRef.current) return
    cssRef.current = css
    if (!sheetRef.current) {
      const sheet = new CSSStyleSheet()
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet]
      sheetRef.current = sheet
    }
    sheetRef.current.replaceSync(css)
  }

  const syncWindow = () => {
    const el = listRef.current
    if (!el) return
    const count = countRef.current
    const start = Math.max(0, Math.floor(el.scrollTop / ROW) - OVERSCAN)
    const end = Math.min(count, Math.ceil((el.scrollTop + el.clientHeight) / ROW) + OVERSCAN)
    const current = spanRef.current
    if (current.start === start && current.end === end) return
    setSpan({ start, end })
  }

  const reveal = () => {
    const el = listRef.current
    if (!el || el.scrollHeight - el.clientHeight <= 1) return
    if (!barOnRef.current) {
      barOnRef.current = true
      setBarOn(true)
    }
    window.clearTimeout(hideTimer.current)
    if (overList.current || overThumb.current || drag.current) return
    hideTimer.current = window.setTimeout(() => {
      if (overList.current || overThumb.current || drag.current) return
      barOnRef.current = false
      setBarOn(false)
    }, 800)
  }

  const latest = useRef({ syncWindow, placeThumb, reveal })
  latest.current = { syncWindow, placeThumb, reveal }

  useLayoutEffect(() => {
    const el = listRef.current
    if (!el) return
    const onScroll = () => {
      latest.current.syncWindow()
      latest.current.placeThumb()
      latest.current.reveal()
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(() => {
      latest.current.syncWindow()
      latest.current.placeThumb()
    })
    observer.observe(el)
    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
    }
  }, [])

  useLayoutEffect(() => {
    syncWindow()
    placeThumb()
  }, [tracks.length, overflow, sort, span.start, span.end])

  useLayoutEffect(() => {
    if (scrollGen.current === motion.generation) return
    scrollGen.current = motion.generation
    const list = listRef.current
    if (!list || !motion.above) return
    // Rows removed above the viewport are not drawn; shift scroll so the visible files stay put.
    list.scrollTop = Math.max(0, list.scrollTop - motion.above * ROW)
    latest.current.syncWindow()
    latest.current.placeThumb()
  }, [motion.generation, motion.above])

  useLayoutEffect(() => {
    const list = listRef.current
    if (!list || !visible.length) return
    const path = focus && visible.some((track) => track.path === focus) ? focus : selected.at(-1)
    // A click already shows the row; scrolling to selected.at(-1) would jump (ctrl-toggle, shift-range).
    const fromClick = performance.now() - lastPick.current < 400
    if (path && !fromClick) {
      const index = visible.findIndex((track) => track.path === path)
      if (index >= 0) {
        const top = index * ROW
        const bottom = top + ROW
        if (top < list.scrollTop) list.scrollTop = top
        else if (bottom > list.scrollTop + list.clientHeight) list.scrollTop = bottom - list.clientHeight
      }
    }
    syncWindow()
    placeThumb()
  }, [focus, orderKey, selected])

  useLayoutEffect(() => {
    knownTracks.current = new Map(visible.map((track) => [track.path, track]))
  }, [visible])

  useEffect(() => {
    return () => {
      window.clearTimeout(hideTimer.current)
      const sheet = sheetRef.current
      if (!sheet) return
      document.adoptedStyleSheets = document.adoptedStyleSheets.filter((item) => item !== sheet)
      sheetRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!motion.entered.size && !motion.exits.length) return
    const wait = motion.defer ? HEAD_MS + TRACK_MS : TRACK_MS
    const id = window.setTimeout(() => {
      setMotion((current) => {
        if (!current.entered.size && !current.exits.length) return current
        return { ...current, entered: new Set(), exits: [], above: 0, defer: false }
      })
    }, wait)
    return () => window.clearTimeout(id)
  }, [motion.generation, motion.defer])

  const onThumbDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const el = listRef.current
    if (!el) return
    drag.current = { y: event.clientY, top: el.scrollTop }
    event.currentTarget.setPointerCapture(event.pointerId)
    event.preventDefault()
    thumbRef.current?.classList.add('dragging')
    reveal()
  }

  const onThumbMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const state = drag.current
    const el = listRef.current
    const rail = railRef.current
    const thumb = thumbRef.current
    if (!state || !el || !rail || !thumb) return
    const max = el.scrollHeight - el.clientHeight
    const travel = Math.max(1, rail.clientHeight - thumb.getBoundingClientRect().height)
    el.scrollTop = state.top + ((event.clientY - state.y) / travel) * max
  }

  const onThumbUp = () => {
    drag.current = null
    thumbRef.current?.classList.remove('dragging')
    reveal()
  }

  const nextPaths = visible.map((track) => track.path)
  if (!motion.ready) {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const entered = reduced ? new Set<string>() : new Set(nextPaths)
    setMotion({
      ready: true,
      generation: 1,
      paths: nextPaths,
      entered,
      exits: [],
      above: 0,
      defer: entered.size > 0
    })
  } else if (!samePaths(motion.paths, nextPaths)) {
    if (sameFiles(motion.paths, nextPaths)) {
      setMotion({ ...motion, paths: nextPaths, exits: [], above: 0 })
    } else {
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      const previous = new Set(motion.paths)
      const nextSet = new Set(nextPaths)
      const entered = new Set<string>()
      const exits: ExitRow[] = []
      let above = 0
      if (!reduced) {
        for (const path of nextPaths) {
          if (!previous.has(path)) entered.add(path)
        }
        const { first, last } = viewportRows(listRef.current)
        motion.paths.forEach((path, index) => {
          if (nextSet.has(path)) return
          const track = knownTracks.current.get(path)
          if (!track) return
          if (index < first) {
            above += 1
            return
          }
          if (index >= last) return
          exits.push({ track, index })
        })
        exits.sort((left, right) => left.index - right.index)
      }
      setMotion({
        ready: true,
        generation: motion.generation + 1,
        paths: nextPaths,
        entered,
        exits,
        above,
        defer: motion.paths.length === 0 && entered.size > 0
      })
    }
  }

  const spinning = loading || refreshing
  const placed = motion.exits.length ? placeExits(visible, motion.exits, motion.above) : null
  countRef.current = placed ? placed.length : visible.length
  const rows = placed
    ? placed.slice(span.start, span.end)
    : visible.slice(span.start, span.end).map((track) => ({ track, leaving: false }))
  const headOpen = tracks.length > 0 || motion.exits.length > 0
  const anchor = focus ?? selected.at(-1) ?? null
  const anchorShown = anchor !== null && rows.some((row) => row.track.path === anchor)

  const reload = () => {
    if (refreshing) return
    setRefreshing(true)
    const started = performance.now()
    void (async () => {
      try {
        if (useEditor.getState().sourceDir) await refreshSource()
        if (useEditor.getState().tracks.length) await refresh()
      } catch (error: unknown) {
        useEditor.getState().notify({ kind: 'err', text: error instanceof Error && error.message ? error.message : MSG.refreshFailed })
      } finally {
        const wait = 500 - (performance.now() - started)
        if (wait > 0) await new Promise((resolve) => window.setTimeout(resolve, wait))
        setRefreshing(false)
      }
    })()
  }

  useEffect(() => {
    setListOrder(orderKey ? orderKey.split('\0') : [])
  }, [orderKey, setListOrder])

  return (
    <aside className="sidebar" aria-hidden={collapsed} inert={collapsed ? true : undefined}>
      <div className="toolbar">
        <ToolMenu label={pack.addFiles} align="start" icon={<PlusIcon />}>
          <DropdownMenuItem onSelect={() => void openDialog()}>
            <FilePlusIcon />
            {pack.files}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void openFolder()}>
            <FolderIcon />
            {pack.folder}
          </DropdownMenuItem>
        </ToolMenu>
        <Hint label={pack.refresh} align="start">
          <button
            type="button"
            className="icon-btn"
            aria-label={pack.refresh}
            disabled={(!tracks.length && !sourceDir) || spinning}
            onClick={reload}
          >
            <RefreshIcon />
          </button>
        </Hint>
        <ToolMenu label={pack.sort} disabled={!tracks.length} align="start" pressed={sort !== 'open'} icon={<FilterIcon />}>
          {sorts.map((item) => (
            <DropdownMenuItem key={item.id} onSelect={() => setSort(item.id)}>
              {item.icon}
              {item.label}
              <CheckIcon className={sort === item.id ? 'menu-check' : 'menu-check-off'} />
            </DropdownMenuItem>
          ))}
        </ToolMenu>
        <span className="toolbar-gap" />
        <Hint label={pack.prevFileKey} align="end">
          <button type="button" className="icon-btn" aria-label={pack.prevFile} disabled={!tracks.length} onClick={() => selectDelta(-1)}>
            <ChevronUpIcon />
          </button>
        </Hint>
        <Hint label={pack.nextFileKey} align="end">
          <button type="button" className="icon-btn" aria-label={pack.nextFile} disabled={!tracks.length} onClick={() => selectDelta(1)}>
            <ChevronDownIcon />
          </button>
        </Hint>
        <ToolMenu label={pack.more} align="end" disabled={!sourceDir && !tracks.length} icon={<MoreIcon />}>
          <DropdownMenuItem disabled={!selected.length} onSelect={() => void revealCurrent()}>
            <FolderOutIcon />
            {pack.revealFile}
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!selected.length} onSelect={() => void openCurrent()}>
            <FileIcon />
            {pack.openFile}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!sourceDir} onSelect={() => void openSource()}>
            <FolderIcon />
            {pack.folderInExplorer}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!sourceDir}
            onSelect={() => {
              if (!sourceDir) return
              void copyPlain(sourceDir, MSG.pathCopied, MSG.pathCopyFailed)
            }}
          >
            <CopyIcon />
            {pack.copyFolderPath}
          </DropdownMenuItem>
          <DropdownMenuItem
            disabled={!tracks.length}
            onSelect={() => {
              const text = visible.map((track) => track.path).join('\n')
              void copyPlain(text, MSG.pathsCopied, MSG.pathsCopyFailed)
            }}
          >
            <FileIcon />
            {pack.copyFilePaths}
          </DropdownMenuItem>
        </ToolMenu>
      </div>
      <div className="list-pane">
      <div className={headOpen ? 'list-head on' : 'list-head'}>
        <div>
          <span className="list-head-label">
            <span>{pack.files} · <span className="list-count">{tracks.length}</span></span>
            {spinning ? <span className="list-spinner" role="status" aria-label={pack.refreshing} /> : null}
          </span>
          <button type="button" className="list-clear" onClick={clear}>{pack.clear}</button>
        </div>
      </div>
      <div
        className="list-body"
        onPointerEnter={() => {
          overList.current = true
          reveal()
        }}
        onPointerLeave={() => {
          overList.current = false
          reveal()
        }}
        onPointerMove={reveal}
      >
      <div className="list-scroll">
      <div className={edges.top ? 'list-edge top on' : 'list-edge top'} />
      {!tracks.length && !motion.exits.length ? <div className="list-empty">{loading ? pack.reading : pack.emptyList}</div> : null}
      <ul ref={listRef} className={motion.defer && motion.entered.size ? 'track-list defer-in' : 'track-list'} role="listbox" aria-multiselectable="true" aria-label={pack.tracks}>
        {rows.map(({ track, leaving }, i) => {
          const active = picked.has(track.path)
          const motionClass = leaving ? 'track-out' : motion.entered.has(track.path) ? 'track-in' : ''
          const view = toView(track)
          const title = shownTrackTitle(view, plan)
          const artist = shownTrackArtist(view, plan)
          const dirty = isDirty(track, plan)
          const cover = track.draftCover
          return (
            <li
              key={track.path}
              className={motionClass ? `track-item ${motionClass}` : 'track-item'}
              role="presentation"
              data-selected={active ? 'true' : 'false'}
              aria-hidden={leaving ? true : undefined}
              inert={leaving ? true : undefined}
            >
              <div className="track-clip">
              <TrackMenu path={track.path} picked={active} group={active && selected.length > 1} broken={Boolean(track.error)}>
              <button
                type="button"
                role="option"
                aria-selected={active}
                aria-setsize={visible.length}
                aria-posinset={span.start + i + 1}
                tabIndex={anchorShown ? (track.path === anchor ? 0 : -1) : i === 0 ? 0 : -1}
                data-selected={active ? 'true' : 'false'}
                draggable
                data-path={track.path}
                className={active ? 'track-row selected' : 'track-row'}
                onClick={(event) => {
                  lastPick.current = performance.now()
                  if (event.shiftKey) select(track.path, 'range')
                  else if (event.ctrlKey || event.metaKey) select(track.path, 'toggle')
                  else select(track.path, 'single')
                }}
              >
                {cover ? (
                  <img className="thumb" alt="" src={coverSrc(cover.mime, cover.dataBase64)} />
                ) : (
                  <span className="thumb" aria-hidden="true">
                    <CoverIcon size={16} />
                  </span>
                )}
                <span className="track-copy">
                  <span className="track-title">
                    <span className={dirty ? 'head-dirty on' : 'head-dirty'}>
                      <span>
                        <span
                          className="dirty"
                          role={dirty ? 'img' : undefined}
                          aria-label={dirty ? pack.dirty : undefined}
                          aria-hidden={dirty ? undefined : true}
                        />
                      </span>
                    </span>
                    <FadeText>{title}</FadeText>
                  </span>
                  <span className={track.error ? 'track-sub error' : 'track-sub'}>
                    <FadeText>{(track.error ? tr(track.error) : '') || artist || pack.noArtist}</FadeText>
                  </span>
                </span>
                <span className={showFormat ? 'track-badge on' : 'track-badge'}>
                  <span>
                    <span className="badge">{formatBadge(track.format)}</span>
                  </span>
                </span>
              </button>
              </TrackMenu>
              </div>
            </li>
          )
        })}
      </ul>
      <div className={edges.bottom ? 'list-edge bottom on' : 'list-edge bottom'} />
      {overflow ? (
        <div ref={railRef} className={barOn ? 'list-rail live' : 'list-rail'}>
          <div
            ref={thumbRef}
            className="list-thumb"
            onPointerEnter={() => {
              overThumb.current = true
              window.clearTimeout(hideTimer.current)
            }}
            onPointerLeave={() => {
              overThumb.current = false
              reveal()
            }}
            onPointerDown={onThumbDown}
            onPointerMove={onThumbMove}
            onPointerUp={onThumbUp}
          />
        </div>
      ) : null}
      </div>
      </div>
      <SidebarStatus />
      </div>
    </aside>
  )
}